"""Manual steps for the explicitly connected SM-S942N; no private DB export."""
import hashlib
import importlib.util
import json
import pathlib
import re
import sys
import time
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('phone_base', ROOT / 'scripts/qa/guidance-phone.py')
q = importlib.util.module_from_spec(spec)
spec.loader.exec_module(q)
q.SERIAL = 'R3KL3019K7X'
q.OUT = ROOT / '.cache/phone-followup-20261011'
q.OUT.mkdir(parents=True, exist_ok=True)
PRIVATE = {'account-name', 'account-email', 'profile-nickname', 'result-center', 'selected-center'}


def save(name, value):
    q.evidence(name, '.json').write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def ui(name='current', screenshot=False):
    q.adb('shell', 'rm', '-f', '/data/local/tmp/runpen-phone-ui.xml')
    result = q.adb('shell', 'uiautomator', 'dump', '/data/local/tmp/runpen-phone-ui.xml')
    if b'UI hier' in result:
        raw = q.adb('exec-out', 'cat', '/data/local/tmp/runpen-phone-ui.xml')
    else:
        result = q.adb('shell', 'uiautomator', 'runtest', '/data/local/tmp/running-ui-dump.jar',
                       '/system/framework/android.test.base.jar', '-c', 'RunningUiDump')
        assert b'OK (1 test)' in result, 'No fresh UI hierarchy'
        raw = q.adb('exec-out', 'cat', '/data/local/tmp/running-qa.xml')
    q.evidence(name, '.xml').write_bytes(raw)
    if screenshot:
        q.evidence(name, '.png').write_bytes(q.adb('exec-out', 'screencap', '-p'))
    return ET.fromstring(raw)


def find(key, tree=None):
    return next((n for n in (tree if tree is not None else ui()).iter('node')
                 if key in (n.get('resource-id'), n.get('text'), n.get('content-desc'))), None)


def capture(name):
    tree = ui(name, True)
    for n in q.describe(tree):
        bounds = list(map(int, re.findall(r'\d+', n['bounds'])))
        if bounds[2] > bounds[0] and bounds[3] > bounds[1] and n['id'] not in PRIVATE and (n['text'] or (n['id'] and n['desc'])):
            print(json.dumps({k: n[k] for k in ['id', 'text', 'desc', 'bounds']}, ensure_ascii=False), flush=True)
    return tree


def scroll(up=False):
    q.adb('shell', 'input', 'swipe', '1000', '1500' if up else '2050',
          '1000', '2100' if up else '1430', '300')


def top():
    for _ in range(12):
        scroll(True)


def locate(key):
    for _ in range(14):
        node = find(key)
        if node is not None:
            x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds')))
            if node.get('enabled') == 'true' and y2-y1 >= 22 and y1 >= 65 and y2 <= 2210:
                return str((x1+x2)//2), str((y1+y2)//2)
        scroll()
    raise RuntimeError('Control not interactable: ' + key)


def tap(key):
    x, y = locate(key)
    q.adb('shell', 'input', 'tap', x, y)
    time.sleep(.5)


def page(path):
    assert re.fullmatch(r'[a-z0-9/-]+', path)
    q.adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW',
          '-d', 'runningart:///' + path, q.APP)
    time.sleep(1)


def helper(action, name):
    assert action in ['inspect', 'backup', 'cleanup-backups']
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


def state(name):
    path = q.adb('shell', 'pm', 'path', q.APP).decode().strip().removeprefix('package:')
    assert path.startswith('/data/app/') and path.endswith('/base.apk') and '\n' not in path
    package = q.adb('shell', 'dumpsys', 'package', q.APP).decode(errors='replace')
    battery = q.adb('shell', 'dumpsys', 'battery').decode(errors='replace')
    result = {'apkSha256': q.adb('shell', 'sha256sum', path).decode().split()[0],
              'package': [line.strip() for line in package.splitlines() if any(k in line for k in
                          ['firstInstallTime=', 'lastUpdateTime=', 'versionName=', 'dataDir='])],
              'battery': [line.strip() for line in battery.splitlines() if re.match(
                          r'^\s+(?:AC powered|USB powered|Wireless powered|level|temperature|status):', line)],
              'network': {k: q.adb('shell', 'settings', 'get', 'global', k).decode().strip()
                          for k in ['wifi_on', 'mobile_data', 'airplane_mode_on']},
              'servicesNone': '(nothing)' in q.adb('shell', 'dumpsys', 'activity', 'services', q.APP).decode()}
    save(name, result)
    print(json.dumps(result, ensure_ascii=False))


def account(name):
    page('account')
    tree = ui(name, True)
    identity = [find(k, tree).get('text') for k in ['account-name', 'account-email'] if find(k, tree) is not None]
    assert len(identity) == 2, 'Signed-in account not visible'
    result = {'identitySha256': hashlib.sha256(json.dumps(identity, ensure_ascii=False).encode()).hexdigest()}
    save(name, result)
    print(json.dumps(result))


def calculate(name):
    tap('calculate-route')
    started = time.monotonic()
    time.sleep(12)
    while time.monotonic() - started < 150:
        try:
            tree = ui()
        except (AssertionError, RuntimeError):
            time.sleep(3)
            continue
        text = ' / '.join(n.get('text', '') for n in tree.iter('node'))
        if '개 코스를 찾았어요' in text or '계산을 완료했어요' in text:
            break
        if find('calculation-error', tree) is not None:
            raise RuntimeError('Calculation failed')
        time.sleep(2)
    else:
        raise RuntimeError('Calculation did not finish')
    collect(name)


def collect(name):
    result = {}
    keys = ['calculation-done', 'route-timing', 'calculation-metrics', 'reference-comparison']
    keys += ['candidate-' + str(i) for i in range(5)]
    for i in range(8):
        tree = ui(name + '-' + str(i), i in [0, 2])
        for node in tree.iter('node'):
            value = node.get('text', '')
            if '전체 소요 시간' in value:
                result['totalTiming'] = value
            if value.startswith('도로 조회 '):
                result['stageTiming'] = value
            if '개 코스를 찾았어요' in value:
                result['completion'] = value
        for key in keys:
            node = find(key, tree)
            if node is not None:
                value = ' / '.join(n.get('text') for n in node.iter('node') if n.get('text'))
                if value and len(value) > len(result.get(key, '')):
                    result[key] = value
        if all(k in result for k in keys[2:]):
            break
        scroll()
    assert all('candidate-' + str(i) in result for i in range(5)), 'Missing candidates'
    save(name, result)
    print(json.dumps(result, ensure_ascii=False), flush=True)


def offline_calculation(name):
    top()
    tap('compute-server')
    previous = {k: q.adb('shell', 'settings', 'get', 'global', k).decode().strip()
                for k in ['wifi_on', 'mobile_data']}
    try:
        q.adb('shell', 'svc', 'wifi', 'disable')
        q.adb('shell', 'svc', 'data', 'disable')
        calculate(name)
    finally:
        q.adb('shell', 'svc', 'wifi', 'enable' if previous['wifi_on'] == '1' else 'disable')
        q.adb('shell', 'svc', 'data', 'enable' if previous['mobile_data'] == '1' else 'disable')


def chart(fraction):
    node = find('terrain-chart')
    assert node is not None
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds')))
    q.adb('shell', 'input', 'tap', str(round(x1+(x2-x1)*fraction)), str((y1+y2)//2))


def fill(key, value):
    tap(key)
    q.adb('shell', 'input', 'keycombination', '113', '29')
    q.adb('shell', 'input', 'text', value.replace(' ', '%s'))
    q.adb('shell', 'input', 'keyevent', '4')


def saved_terrain():
    report = json.loads(q.evidence('after-save', '.json').read_text(encoding='utf-8'))
    courses = [r for r in report['tests'] if r.get('name') == 'QA phone 20261011 terrain']
    assert len(courses) == 1
    path = 'courses/' + courses[0]['id']
    page(path)
    tap('terrain-toggle')
    time.sleep(3)
    scroll()
    capture('saved-terrain-online')
    top()
    tap('terrain-toggle')
    previous = {k: q.adb('shell', 'settings', 'get', 'global', k).decode().strip()
                for k in ['wifi_on', 'mobile_data']}
    try:
        q.adb('shell', 'svc', 'wifi', 'disable')
        q.adb('shell', 'svc', 'data', 'disable')
        tap('terrain-toggle')
        scroll()
        tree = capture('saved-terrain-memory-offline')
        assert find('terrain-summary', tree) is not None
        q.adb('shell', 'am', 'force-stop', q.APP)
        page(path)
        tap('terrain-toggle')
        time.sleep(3)
        tree = capture('saved-terrain-restart-offline')
        assert find('terrain-error', tree) is not None
    finally:
        q.adb('shell', 'svc', 'wifi', 'enable' if previous['wifi_on'] == '1' else 'disable')
        q.adb('shell', 'svc', 'data', 'enable' if previous['mobile_data'] == '1' else 'disable')
    time.sleep(3)
    tap('terrain-retry')
    time.sleep(3)
    scroll()
    tree = capture('saved-terrain-retry')
    assert find('terrain-summary', tree) is not None
    print('PASS: saved terrain, offline memory, fresh-process error, online retry', flush=True)


def fixture_media():
    where = '"_data LIKE \'/storage/emulated/0/Pictures/RunPenQA20261011/%\'"'
    raw = q.adb('shell', 'content', 'query', '--uri', 'content://media/external/images/media',
                '--projection', '_id:_display_name:mime_type:width:height:datetaken:date_modified',
                '--where', where, '--sort', '"datetaken DESC, _id DESC"').decode()
    q.evidence('photo-media', '.txt').write_text(raw, encoding='utf-8')
    print(raw)


def photo_report(name):
    since = json.loads(q.evidence('photo-start', '.json').read_text(encoding='utf-8'))['since']
    q.adb('shell', 'am', 'force-stop', q.APP)
    raw = q.adb('shell', 'am', 'instrument', '-w', '-e', 'action', 'photo-report', '-e',
                'since', str(since), 'com.runningart.authdigest/com.runningart.authdigest.PhoneValidation').decode()
    assert 'INSTRUMENTATION_CODE: 0' in raw, raw
    report = json.loads(re.search(r'INSTRUMENTATION_RESULT: photos=(.*)', raw).group(1))
    save(name, report)
    outputs = [r for r in report if r['path'].startswith('ImageManipulator/')]
    assert outputs and all(r['width'] == r['height'] == 512 and not r['hasAppOrCommentMetadata'] for r in outputs)
    print(json.dumps(report, ensure_ascii=False), flush=True)


def photo_flow(index):
    assert index in [0, 1, 2]
    page('account-profile')
    tap('profile-upload-picture')
    tap('컬렉션')
    time.sleep(1)
    q.adb('shell', 'input', 'swipe', '540', '652', '540', '190', '400')
    tap('이 기기에서')
    tap('RunPenQA20261011')
    tree = ui('photo-fixtures-' + str(index), True)
    assert find('RunPenQA20261011', tree) is not None
    pictures = [n for n in tree.iter('node') if '촬영한 사진' in n.get('content-desc', '')]
    assert len(pictures) == 3, 'Only the three synthetic images may be selected'
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', pictures[index].get('bounds')))
    q.adb('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2))
    tap('완료')
    time.sleep(1)
    tree = ui('photo-crop-' + str(index), True)
    assert find('com.runningart.mobile.dev:id/crop_image_menu_crop', tree) is not None
    tap('com.runningart.mobile.dev:id/crop_image_menu_crop')
    time.sleep(2)
    tree = ui('photo-preview-' + str(index), True)
    assert find('다른 사진 선택', tree) is not None
    photo_report('photo-output-' + str(index))
    print('PASS: synthetic album position ' + str(index), flush=True)


def gps_prechecks():
    mode = q.adb('shell', 'settings', 'get', 'secure', 'location_mode').decode().strip()
    assert mode == '3', 'Unexpected original location setting'
    permissions = ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'ACCESS_BACKGROUND_LOCATION']
    def permission_lines():
        raw = q.adb('shell', 'dumpsys', 'package', q.APP).decode()
        return [line.strip() for line in raw.splitlines()
                if any('android.permission.' + p + ': granted=' in line for p in permissions)]
    before = permission_lines()
    assert len(before) == 3 and all('granted=true' in line for line in before)
    save('gps-settings-before', {'mode': mode, 'permissions': before})
    try:
        q.adb('shell', 'am', 'force-stop', q.APP)
        q.adb('shell', 'settings', 'put', 'secure', 'location_mode', '0')
        tree = ui('location-off-system-dialog')
        if find('닫기', tree) is not None:
            tap('닫기')
        page('run')
        tap('run-start')
        tap('계속')
        tree = capture('gps-location-off')
        assert find('run-error', tree) is not None and '위치 기능' in find('run-error', tree).get('text')
    finally:
        q.adb('shell', 'settings', 'put', 'secure', 'location_mode', mode)
    try:
        q.adb('shell', 'pm', 'revoke', q.APP, 'android.permission.ACCESS_FINE_LOCATION')
        page('run')
        tap('run-start')
        tap('계속')
        tree = capture('gps-approximate-only')
        assert find('run-error', tree) is not None and '정확한 위치' in find('run-error', tree).get('text')
    finally:
        for permission in permissions:
            q.adb('shell', 'pm', 'grant', q.APP, 'android.permission.' + permission)
    after = permission_lines()
    save('gps-settings-after', {'mode': q.adb('shell', 'settings', 'get', 'secure', 'location_mode').decode().strip(), 'permissions': after})
    assert before == after, 'Permission flags must be restored exactly'
    print('PASS: location off, approximate-only blocking, original permission flags restored', flush=True)


def live_click(key):
    result = q.adb('shell', 'uiautomator', 'runtest', '/data/local/tmp/drawing-gesture.jar',
                   '/system/framework/android.test.base.jar', '-c', 'DrawingGesture', '-e', 'click', key)
    assert b'OK (1 test)' in result, 'Live control unavailable: ' + key


def gps_basic():
    since = int(time.time()*1000)
    save('gps-test-start', {'since': since})
    page('run')
    tap('run-start')
    tap('계속')
    time.sleep(15)
    scroll()
    live_click('run-pause')
    top()
    tree = capture('gps-paused')
    assert find('run-status', tree).get('text') == '일시정지'
    gps_resume_flow()


def gps_resume_flow():
    since = json.loads(q.evidence('gps-test-start', '.json').read_text(encoding='utf-8'))['since']
    top()
    tree = capture('gps-paused')
    assert find('run-status', tree).get('text') == '일시정지'
    tap('run-start')
    tap('계속')
    time.sleep(10)
    services = q.adb('shell', 'dumpsys', 'activity', 'services', q.APP).decode()
    assert 'LocationTaskService' in services, 'No real GPS foreground service'
    save('gps-live-service', {'observedAt': int(time.time()*1000), 'locationTaskService': True})
    q.adb('shell', 'am', 'force-stop', q.APP)
    page('run')
    top()
    tree = capture('gps-interrupted')
    assert find('run-status', tree).get('text') == '기록 중단'
    tap('run-start')
    tap('계속')
    time.sleep(10)
    scroll()
    live_click('run-pause')
    top()
    tree = capture('gps-resumed-paused')
    assert find('run-status', tree).get('text') == '일시정지'
    tap('run-finish')
    tap('종료·저장')
    ui('gps-saved', True)
    q.adb('shell', 'am', 'force-stop', q.APP)
    raw = q.adb('shell', 'am', 'instrument', '-w', '-e', 'action', 'recent-runs', '-e',
                'since', str(since), 'com.runningart.authdigest/com.runningart.authdigest.PhoneValidation').decode()
    assert 'INSTRUMENTATION_CODE: 0' in raw, raw
    runs = json.loads(re.search(r'INSTRUMENTATION_RESULT: runs=(.*)', raw).group(1))
    assert len(runs) == 1 and runs[0]['status'] == 'completed'
    save('gps-test-run', runs[0])
    print(json.dumps({k: v for k, v in runs[0].items() if k != 'pointTiming'}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    assert q.adb('shell', 'getprop', 'ro.product.model').decode().strip() == 'SM-S942N'
    action = sys.argv[1]
    value = sys.argv[2] if len(sys.argv) > 2 else 'screen'
    if action == 'prepare':
        q.adb('push', str(ROOT / '.cache/running-qa/ui-dump.jar'), '/data/local/tmp/running-ui-dump.jar')
    elif action == 'capture':
        capture(value)
    elif action == 'open':
        page(value)
    elif action == 'tap':
        tap(value)
    elif action == 'top':
        top()
    elif action == 'scroll':
        scroll()
    elif action == 'helper':
        helper(value, sys.argv[3])
    elif action == 'state':
        state(value)
    elif action == 'account':
        account(value)
    elif action == 'calculate':
        calculate(value)
    elif action == 'collect':
        collect(value)
    elif action == 'offline-calculation':
        offline_calculation(value)
    elif action == 'fill':
        fill(value, sys.argv[3])
    elif action == 'chart':
        chart(float(value))
    elif action == 'saved-terrain':
        saved_terrain()
    elif action == 'fixture-media':
        fixture_media()
    elif action == 'photo-report':
        photo_report(value)
    elif action == 'photo-flow':
        photo_flow(int(value))
    elif action == 'gps-prechecks':
        gps_prechecks()
    elif action == 'gps-basic':
        gps_basic()
    elif action == 'gps-resume-flow':
        gps_resume_flow()
    else:
        raise ValueError(action)
