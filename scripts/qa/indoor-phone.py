"""Indoor QA on the explicitly selected phone; synthetic fixtures only."""
import hashlib
import importlib.util
import json
import pathlib
import re
import sys
import time
import xml.etree.ElementTree as ET

ROOT = pathlib.Path.cwd()
spec = importlib.util.spec_from_file_location('phone_base', ROOT / 'scripts/qa/guidance-phone.py')
q = importlib.util.module_from_spec(spec)
spec.loader.exec_module(q)
q.SERIAL = 'R3KL3019K7X'
q.OUT = ROOT / '.cache/indoor-phone'
q.OUT.mkdir(parents=True, exist_ok=True)
stock_ui = q.ui


def fresh_ui(name='screen'):
    for attempt in range(3):
        try:
            return stock_ui(name)
        except RuntimeError:
            result = q.adb('shell', 'uiautomator', 'runtest', '/data/local/tmp/running-ui-dump.jar',
                           '/system/framework/android.test.base.jar', '-c', 'RunningUiDump')
            if b'OK (1 test)' in result:
                raw = q.adb('shell', 'cat', '/data/local/tmp/running-qa.xml')
                q.evidence(name, '.xml').write_bytes(raw)
                return ET.fromstring(raw)
            print('UI hierarchy unavailable; retry ' + str(attempt + 1), flush=True)
            time.sleep(1)
    raise RuntimeError('No fresh UI hierarchy after three attempts')


q.ui = fresh_ui


def save(name, value):
    q.evidence(name, '.json').write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def find(key, tree=None):
    return next((n for n in (tree if tree is not None else q.ui()).iter('node')
                 if key in (n.get('resource-id'), n.get('text'), n.get('content-desc'))), None)


def page(path):
    q.adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'runningart:///' + path, q.APP)
    time.sleep(1.5)


def scroll(up=False):
    q.adb('shell', 'input', 'swipe', '1055', '1450' if up else '2020', '1055', '2100' if up else '1450', '300')


def top():
    for _ in range(5):
        scroll(True)


def tap(key):
    for _ in range(12):
        n = find(key)
        if n is not None:
            x1, y1, x2, y2 = map(int, re.findall(r'\d+', n.get('bounds')))
            if n.get('enabled') == 'true' and y2-y1 >= 20 and y1 >= 70 and y2 <= 2200:
                q.adb('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2))
                time.sleep(.5)
                return
        scroll()
    raise RuntimeError('Control unavailable: ' + key)


def capture(name):
    tree = q.ui(name)
    q.evidence(name, '.png').write_bytes(q.adb('exec-out', 'screencap', '-p'))
    safe = [n for n in q.describe(tree) if n['id'] not in ['account-name', 'account-email', 'profile-nickname']]
    for n in safe:
        for k in ['text', 'desc']:
            n[k] = re.sub(r'(?:https://)?runpen-shared-runs\.ssw3131\.workers\.dev/\S*|https://\S+', '[link]', n[k] or '')
    print(json.dumps(safe, ensure_ascii=False), flush=True)
    return tree


def helper(action, name):
    assert action in ['inspect', 'backup', 'seed', 'cleanup-backups']
    q.adb('shell', 'am', 'force-stop', q.APP)
    response = q.adb('shell', 'am', 'instrument', '-w', '-e', 'action', action,
                     'com.runningart.authdigest/com.runningart.authdigest.PhoneValidation').decode()
    assert 'INSTRUMENTATION_CODE: 0' in response, response
    q.evidence(name, '.txt').write_text(response, encoding='utf-8')
    if action == 'inspect':
        result = json.loads(re.search(r'INSTRUMENTATION_RESULT: report=(.*)', response).group(1))
        save(name, result)
        print(json.dumps(result, ensure_ascii=False), flush=True)
    else:
        print('PASS: ' + action, flush=True)


def account(name):
    page('account')
    tree = q.ui(name + '-account')
    values = [find(k, tree).get('text') for k in ['account-name', 'account-email']]
    assert all(values)
    result = {'accountHash': hashlib.sha256(json.dumps(values).encode()).hexdigest()}
    page('account-sync')
    tree = q.ui(name + '-sync')
    result['sync'] = find('sync-status', tree).get('text')
    assert '켜짐' in result['sync'] and '0건' in result['sync'], result['sync']
    save(name + '-account', result)
    print(json.dumps(result, ensure_ascii=False), flush=True)


def network():
    return {k: q.adb('shell', 'settings', 'get', 'global', k).decode().strip()
            for k in ['wifi_on', 'mobile_data', 'airplane_mode_on']}


def restore_network():
    baseline = json.loads(q.evidence('baseline-device', '.json').read_text())['network']
    for key, service in [('wifi_on', 'wifi'), ('mobile_data', 'data')]:
        q.adb('shell', 'svc', service, 'enable' if baseline[key] == '1' else 'disable')
    print(json.dumps({'networkRestored': network()}), flush=True)


def offline_batch():
    assert network()['airplane_mode_on'] == '0'
    try:
        q.adb('shell', 'svc', 'wifi', 'disable')
        q.adb('shell', 'svc', 'data', 'disable')
        assert network()['wifi_on'] == '0' and network()['mobile_data'] == '0'
        for sample in ['busan-cityhall', 'daejeon', 'jeju', 'boundary-guro-gwangmyeong']:
            if q.evidence(sample + '-offline', '.json').exists():
                print('Retaining already completed offline evidence: ' + sample, flush=True)
                continue
            route_start(sample, 'offline')
            deadline = time.monotonic() + 100
            while time.monotonic() < deadline:
                time.sleep(5)
                tree = q.ui(sample + '-offline-wait')
                assert find('calculation-error', tree) is None, 'Offline calculation failed'
                if find('calculation-done', tree) is not None:
                    break
            else:
                raise RuntimeError('Offline calculation deadline exceeded')
            route_result()
    finally:
        restore_network()


def route_start(sample, mode):
    assert sample in ['busan-cityhall', 'daejeon', 'jeju', 'boundary-guro-gwangmyeong', 'ulleung']
    assert mode in ['refresh', 'offline']
    q.adb('shell', 'am', 'force-stop', q.APP)
    page('route-lab')
    top()
    tap('route-diagnostics')
    tap('sample-' + sample)
    top()
    tap('road-mode-' + mode)
    tap('distance-3')
    tree = q.ui(sample + '-' + mode + '-before')
    center = find('selected-center', tree).get('text')
    tap('calculate-route')
    save('active-route', {'sample': sample, 'mode': mode, 'center': center, 'network': network(), 'started': time.time()})
    print(json.dumps({'started': sample, 'mode': mode, 'center': center}, ensure_ascii=False), flush=True)


def route_result():
    active = json.loads(q.evidence('active-route', '.json').read_text(encoding='utf-8'))
    name = active['sample'] + '-' + active['mode']
    tree = q.ui(name + '-result')
    done = find('calculation-done', tree)
    if done is None:
        capture(name + '-pending')
        return
    fields = {}
    fields['timing'] = [n.get('text') for n in tree.iter('node')
                        if re.match(r'^(전체 소요 시간|도로 조회|코스 계산) ', n.get('text', ''))]
    q.evidence(name + '-map', '.png').write_bytes(q.adb('exec-out', 'screencap', '-p'))
    for key in ['calculation-done', 'route-timing', 'result-center', 'calculation-metrics', 'reference-comparison']:
        n = find(key, tree)
        if n is not None:
            fields[key] = ' '.join(x.get('text', '') for x in n.iter('node')).strip()
    fields['candidates'] = []
    # Scroll until the development metrics at the end; deduplicate visible candidates.
    candidates = {}
    for step in range(8):
        for n in tree.iter('node'):
            if re.fullmatch(r'candidate-\d+', n.get('resource-id', '')):
                value = ' '.join(x.get('text', '') for x in n.iter('node')).strip()
                key = n.get('resource-id')
                if len(value) > len(candidates.get(key, '')):
                    candidates[key] = value
        for key in ['route-timing', 'result-center', 'calculation-metrics', 'reference-comparison']:
            n = find(key, tree)
            if n is not None:
                fields[key] = ' '.join(x.get('text', '') for x in n.iter('node')).strip()
        if 'calculation-metrics' in fields:
            break
        scroll()
        tree = q.ui(name + '-details-' + str(step))
    fields['candidates'] = [candidates[k] for k in sorted(candidates)]
    assert fields['candidates'], 'No candidate results'
    save(name, {**active, **fields, 'observed': time.time()})
    q.evidence(name, '.png').write_bytes(q.adb('exec-out', 'screencap', '-p'))
    print(json.dumps(fields, ensure_ascii=False), flush=True)


def fixture():
    data = json.loads(q.evidence('fixture-summary', '.json').read_text())
    assert re.fullmatch(r'0505[a-f0-9]{28}', data['runId'])
    assert re.fullmatch(r'0505[a-f0-9]{28}', data['courseId'])
    return data


def share():
    data = fixture()
    page('runs/' + data['runId'])
    top()
    assert find('run-course-result').get('text').startswith('QA phone indoor synthetic')
    tap('run-share-link')
    tree = q.ui('share-confirm')
    assert find('이 러닝 경로를 공유할까요?', tree) is not None
    tap('android:id/button1')
    time.sleep(3)
    tree = q.ui('share-chooser')
    content = '\n'.join(n.get('text', '') + ' ' + n.get('content-desc', '') for n in tree.iter('node'))
    links = re.findall(r'https://runpen-shared-runs\.ssw3131\.workers\.dev/#r/[a-f0-9]{64}', content)
    assert links, 'No complete synthetic sharing link in chooser'
    save('shared-link', {'link': links[0]})
    q.adb('shell', 'input', 'keyevent', '4')
    print('PASS: synthetic link published through RunPen; no recipient selected', flush=True)


def browser_open():
    link = json.loads(q.evidence('shared-link', '.json').read_text())['link']
    assert re.fullmatch(r'https://runpen-shared-runs\.ssw3131\.workers\.dev/#r/[a-f0-9]{64}', link)
    q.adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', link)
    time.sleep(4)
    capture('browser-opened')


def revoke():
    data = fixture()
    page('runs/' + data['runId'])
    top()
    assert find('run-course-result').get('text').startswith('QA phone indoor synthetic')
    tap('run-share-revoke')
    assert find('공유를 중단할까요?') is not None
    tap('android:id/button1')
    time.sleep(2)
    q.ui('share-revoked')
    print('Synthetic sharing revocation requested through RunPen', flush=True)


def cleanup_fixture():
    data = fixture()
    page('runs/' + data['runId'])
    top()
    assert find('run-course-result').get('text').startswith('QA phone indoor synthetic')
    tap('run-delete')
    tap('android:id/button1')
    page('courses/' + data['courseId'])
    top()
    assert find('course-title').get('text') == 'QA phone indoor synthetic'
    tap('course-delete')
    tap('android:id/button1')
    page('account-sync')
    tap('sync-now')
    time.sleep(3)
    tree = q.ui('fixture-deleted-sync')
    assert '0건' in find('sync-status', tree).get('text')
    print('PASS: only synthetic run/course deleted and deletion synchronized', flush=True)


def browser_toggle(key):
    from PIL import Image
    assert key in ['actual', 'planned', 'target']
    tree = q.ui('browser-toggle-' + key + '-before')
    checkbox = find('show-' + key, tree)
    assert checkbox is not None and checkbox.get('class') == 'android.widget.CheckBox'
    box = tuple(map(int, re.findall(r'\d+', checkbox.get('bounds'))))
    map_box = tuple(map(int, re.findall(r'\d+', find('map', tree).get('bounds'))))
    color = {'actual': (23, 99, 71), 'planned': (40, 121, 206), 'target': (179, 100, 173)}[key]

    def observe(label):
        name = 'browser-toggle-' + key + '-' + label
        q.ui(name)
        q.evidence(name, '.png').write_bytes(q.adb('exec-out', 'screencap', '-p'))
        pixels = Image.open(q.evidence(name, '.png')).convert('RGB')
        check_pixels = list(pixels.crop(box).get_flattened_data())
        green = sum(1 for r, g, b in check_pixels if abs(r-23) < 35 and abs(g-99) < 35 and abs(b-71) < 35)
        count = sum(1 for rgb in pixels.crop(map_box).get_flattened_data() if max(abs(a-b) for a, b in zip(rgb, color)) < 35)
        return green / len(check_pixels) > .35, count

    before, before_pixels = observe('before')
    assert before, 'Expected a visibly selected checkbox'
    tap('show-' + key)
    disabled, disabled_pixels = observe('off')
    assert not disabled, 'Checkbox did not visually clear'
    tap('show-' + key)
    restored, restored_pixels = observe('restored')
    assert restored, 'Checkbox did not visually restore'
    assert before_pixels > disabled_pixels + 30, 'Expected route color to disappear'
    assert abs(restored_pixels-before_pixels) <= max(30, before_pixels*.02), 'Route did not visually restore'
    result = {'before': before, 'disabled': disabled, 'restored': restored,
              'routeColorPixels': [before_pixels, disabled_pixels, restored_pixels],
              'stateEvidence': 'checkbox fill pixels; Android web accessibility reports checked=false in both states',
              'mapBounds': map_box, 'checkboxBounds': box}
    save('browser-toggle-' + key, result)
    print(json.dumps(result), flush=True)


def browser_close():
    tree = q.ui('browser-before-close')
    link = json.loads(q.evidence('shared-link', '.json').read_text())['link']
    url = find('com.android.chrome:id/url_bar', tree)
    assert url is not None and url.get('text') in [link, link.removeprefix('https://')]
    count = int(re.search(r'\d+', find('com.android.chrome:id/tab_switcher_button', tree).get('content-desc')).group())
    q.adb('shell', 'input', 'keycombination', '113', '51')
    time.sleep(1)
    tree = q.ui('browser-after-close')
    tabs = find('com.android.chrome:id/tab_switcher_button', tree)
    if tabs is None:
        q.adb('shell', 'am', 'start', '-W', '-n', 'com.android.chrome/com.google.android.apps.chrome.Main')
        tree = q.ui('browser-after-close')
        tabs = find('com.android.chrome:id/tab_switcher_button', tree)
    # Do not retain or print content from the user's remaining tab.
    q.evidence('browser-after-close', '.xml').unlink(missing_ok=True)
    assert tabs is not None
    after = int(re.search(r'\d+', tabs.get('content-desc')).group())
    assert after == count-1, 'QA tab closure not confirmed'
    result = {'qaTabClosed': True, 'beforeTabs': count, 'afterTabs': after}
    save('browser-tab-closed', result)
    print(json.dumps(result), flush=True)


def finish_device():
    before = json.loads(q.evidence('before-inspect', '.json').read_text())
    after = json.loads(q.evidence('after-inspect', '.json').read_text())
    for key in ['saved_courses', 'running_sessions', 'running_points', 'storage_test_notes']:
        assert before[key] == after[key]
    assert not after['tests'] and after['sync_deletions'] == after['sync_conflicts'] == 0
    accounts = [json.loads(q.evidence(label+'-account', '.json').read_text(encoding='utf-8')) for label in ['before', 'after']]
    assert accounts[0] == accounts[1]
    assert json.loads(q.evidence('browser-tab-closed', '.json').read_text())['qaTabClosed']
    helper('cleanup-backups', 'backup-cleanup')
    assert b'Success' in q.adb('uninstall', 'com.runningart.authdigest')
    temporary = ['/data/local/tmp/runpen-phone-ui.xml', '/data/local/tmp/running-qa.xml',
                 '/data/local/tmp/running-ui-dump.jar', '/data/local/tmp/runpen-phone-fixture.json']
    q.adb('shell', 'rm', '-f', *temporary)
    for path in temporary:
        assert q.adb('shell', 'sh', '-c', "'if [ -e " + path + " ]; then echo EXISTS; fi'").strip() != b'EXISTS'
    assert not q.adb('shell', 'pm', 'list', 'packages', 'com.runningart.authdigest').strip()
    page('account')
    apk = q.adb('shell', 'pm', 'path', q.APP).decode().strip().removeprefix('package:')
    assert apk.startswith('/data/app/') and apk.endswith('/base.apk') and '\n' not in apk
    digest = q.adb('shell', 'sha256sum', apk).decode().split()[0]
    assert digest == json.loads(q.evidence('tested-installation', '.json').read_text())['apkSha256']
    assert network() == json.loads(q.evidence('baseline-device', '.json').read_text())['network']
    assert '(nothing)' in q.adb('shell', 'dumpsys', 'activity', 'services', q.APP).decode()
    result = {'apkSha256': digest, 'network': network(), 'helperRemoved': True, 'qaFilesRemoved': True,
              'appServicesNone': True, 'qaTabClosed': True}
    save('device-final', result)
    print(json.dumps(result), flush=True)


if __name__ == '__main__':
    action = sys.argv[1]
    if action == 'baseline':
        services = q.adb('shell', 'dumpsys', 'activity', 'services', q.APP).decode()
        assert '(nothing)' in services, 'Active app service; do not interrupt a run'
        apk = q.adb('shell', 'pm', 'path', q.APP).decode().strip().removeprefix('package:')
        assert apk.startswith('/data/app/') and apk.endswith('/base.apk') and '\n' not in apk
        digest = q.adb('shell', 'sha256sum', apk).decode().split()[0]
        assert digest == 'cb31939f46f3210099c0735f8d6810d1bef0463355f8dcfecd2a096a4afc3e32'
        save('baseline-device', {'apkSha256': digest, 'network': network(), 'servicesNone': True})
        account('before')
    elif action == 'helper':
        helper(sys.argv[2], sys.argv[3])
    elif action == 'account':
        account(sys.argv[2])
    elif action == 'open':
        page(sys.argv[2])
    elif action == 'tap':
        tap(sys.argv[2])
    elif action == 'capture':
        capture(sys.argv[2])
    elif action == 'screen':
        q.evidence(sys.argv[2], '.png').write_bytes(q.adb('exec-out', 'screencap', '-p'))
    elif action == 'installation':
        apk = q.adb('shell', 'pm', 'path', q.APP).decode().strip().removeprefix('package:')
        assert apk.startswith('/data/app/') and apk.endswith('/base.apk') and '\n' not in apk
        digest = q.adb('shell', 'sha256sum', apk).decode().split()[0]
        assert digest == '3155bab0d86ddd445f3aac907669f520b21bc1d6796fedfd83ff45c491b01ad2'
        save('tested-installation', {'apkSha256': digest, 'source': 'separate common UI installation at 19:21:46 KST'})
        print('PASS: installed common UI release hash matches documented update', flush=True)
    elif action == 'top':
        top()
    elif action == 'scroll':
        scroll()
    elif action == 'route-start':
        route_start(sys.argv[2], sys.argv[3])
    elif action == 'route-result':
        route_result()
    elif action == 'network-off':
        assert network()['airplane_mode_on'] == '0'
        q.adb('shell', 'svc', 'wifi', 'disable')
        q.adb('shell', 'svc', 'data', 'disable')
        print(json.dumps(network()))
    elif action == 'share':
        share()
    elif action == 'browser-open':
        browser_open()
    elif action == 'revoke':
        revoke()
    elif action == 'cleanup-fixture':
        cleanup_fixture()
    elif action == 'browser-toggle':
        browser_toggle(sys.argv[2])
    elif action == 'browser-close':
        browser_close()
    elif action == 'finish-device':
        finish_device()
    elif action == 'network-restore':
        restore_network()
    elif action == 'offline-batch':
        offline_batch()
    else:
        raise ValueError(action)
