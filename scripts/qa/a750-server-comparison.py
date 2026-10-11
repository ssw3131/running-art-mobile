"""Explicit SM-A750N UI/performance QA; never selects another connected phone."""
import argparse
import datetime
import hashlib
import json
import pathlib
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / '.cache/a750-server-comparison-20261011'
ADB = ROOT / '.tools/android-sdk/platform-tools/adb.exe'
SERIAL = '3200ff204ed5a591'
APP = 'com.runningart.mobile.dev'
APK = ROOT / 'build/install/running-art-0.1.0-20261010-terrain.apk'
EXPECTED = '9b4426ca98a6466062c2696846057c088f9b4c6765b0cb1658a5a8d202282a32'
PRIVATE = {'account-name', 'account-email', 'profile-nickname', 'selected-center', 'result-center'}
sys.stdout.reconfigure(encoding='utf-8')


def adb(*args, timeout=60):
    result = subprocess.run([str(ADB), '-s', SERIAL, *args], capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(result.stderr.decode(errors='replace') + result.stdout.decode(errors='replace'))
    return result.stdout


def save(name, value):
    assert re.fullmatch(r'[a-zA-Z0-9_-]+', name)
    (OUT / (name + '.json')).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def ui(name='screen', screenshot=False):
    paths = ['/data/local/tmp/route-performance-live.xml', '/data/local/tmp/local/tmp/route-performance-live.xml']
    adb('shell', 'rm', '-f', *paths)
    response = adb('shell', 'uiautomator', 'runtest', '/data/local/tmp/a750-comparison-ui.jar',
                   '/system/framework/android.test.base.jar', '-c', 'PerformanceUiDump')
    assert b'OK (1 test)' in response, 'No fresh UI hierarchy'
    path = re.search(rb'PERFORMANCE_UI_PATH=([^\r\n]+)', response).group(1).decode()
    assert path in paths
    raw = adb('exec-out', 'cat', path)
    (OUT / (name + '.xml')).write_bytes(raw)
    if screenshot:
        (OUT / (name + '.png')).write_bytes(adb('exec-out', 'screencap', '-p'))
    return ET.fromstring(raw)


def find(key, tree):
    return next((n for n in tree.iter('node') if key in
                 (n.get('resource-id'), n.get('text'), n.get('content-desc'))), None)


def capture(name):
    tree = ui(name, True)
    print(json.dumps([{'id': n.get('resource-id'), 'text': n.get('text'),
                       'desc': n.get('content-desc'), 'bounds': n.get('bounds')}
                      for n in tree.iter('node') if n.get('resource-id') not in PRIVATE
                      and (n.get('text') or n.get('resource-id'))], ensure_ascii=False), flush=True)
    return tree


def scroll(up=False):
    adb('shell', 'input', 'swipe', '900', '1250' if up else '1850',
        '900', '1850' if up else '1250', '350')


def top():
    for _ in range(8):
        scroll(True)


def locate(key):
    for _ in range(20):
        node = find(key, ui())
        if node is not None:
            x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds')))
            if node.get('enabled') == 'true' and x2 > x1 and y2-y1 >= 60 and y1 >= 64 and y2 <= 2090:
                return (x1+x2)//2, (y1+y2)//2
            if 0 < y2 < 1120:
                scroll(True)
                continue
        scroll()
    raise RuntimeError('Control not interactable: ' + key)


def tap(key):
    x, y = locate(key)
    adb('shell', 'input', 'tap', str(x), str(y))
    time.sleep(.4)


def tap_visible(key):
    tree = ui()
    node = find(key, tree)
    assert node is not None, 'Not visible: ' + key
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds')))
    assert node.get('enabled') == 'true' and x2 > x1 and y2-y1 > 20 and y1 >= 64 and y2 <= 2094
    adb('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2))
    time.sleep(.5)


def page(path, restart=True):
    assert re.fullmatch(r'[a-z0-9/-]*', path)
    if restart:
        adb('shell', 'am', 'force-stop', APP)
    adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'runningart:///' + path, APP)
    time.sleep(2)


def conditions():
    battery = adb('shell', 'dumpsys', 'battery').decode()
    memory = adb('shell', 'dumpsys', 'meminfo', APP).decode()
    pss = re.search(r'TOTAL:\s*(\d+)', memory)
    return {'at': datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).isoformat(),
            'battery': {k: re.search(r'^\s*' + k + r': (.*)$', battery, re.M).group(1).strip()
                        for k in ['level', 'temperature', 'USB powered']},
            'pssKiB': int(pss[1]) if pss else None,
            'pid': adb('shell', 'pidof', APP).decode().strip()}


def state(name):
    installed = adb('shell', 'pm', 'list', 'packages', APP).decode().splitlines()
    if 'package:' + APP not in installed:
        result = {'installed': False, 'package': APP, 'model': 'SM-A750N'}
        save(name, result)
        print(json.dumps(result), flush=True)
        return
    path = adb('shell', 'pm', 'path', APP).decode().strip().removeprefix('package:')
    assert path.startswith('/data/app/') and path.endswith('/base.apk') and '\n' not in path
    package = adb('shell', 'dumpsys', 'package', APP).decode(errors='replace')
    result = {'apkSha256': adb('shell', 'sha256sum', path).decode().split()[0],
              'package': [line.strip() for line in package.splitlines() if any(k in line for k in
                          ['firstInstallTime=', 'lastUpdateTime=', 'versionName=', 'dataDir=', 'userId='])],
              'network': {k: adb('shell', 'settings', 'get', 'global', k).decode().strip()
                          for k in ['wifi_on', 'mobile_data', 'airplane_mode_on']},
              'fontScale': adb('shell', 'settings', 'get', 'system', 'font_scale').decode().strip(),
              'servicesNone': '(nothing)' in adb('shell', 'dumpsys', 'activity', 'services', APP).decode()}
    save(name, result)
    print(json.dumps(result, ensure_ascii=False), flush=True)


def helper(action, name):
    assert action in ['inspect', 'backup', 'cleanup-backups']
    adb('shell', 'am', 'force-stop', APP)
    response = adb('shell', 'am', 'instrument', '-w', '-e', 'action', action,
                   'com.runningart.authdigest/com.runningart.authdigest.PhoneValidation').decode()
    assert 'INSTRUMENTATION_CODE: 0' in response, response
    (OUT / (name + '.txt')).write_text(response, encoding='utf-8')
    if action == 'inspect':
        value = json.loads(re.search(r'INSTRUMENTATION_RESULT: report=(.*)', response).group(1))
        save(name, value)
        print(json.dumps(value, ensure_ascii=False), flush=True)
    else:
        print('PASS: ' + action, flush=True)


def metrics():
    raw = adb('logcat', '-d', '-s', 'ReactNativeJS:I').decode(errors='replace')
    values = []
    for line in raw.splitlines():
        if 'ROUTE_LAB_METRICS' in line:
            try:
                values.append(json.loads(line[line.index('{'):line.rindex('}')+1]))
            except (ValueError, json.JSONDecodeError):
                pass
    return values


def prepare(dataset, execution, km):
    page('route-lab')
    tap('route-diagnostics')
    tap('sample-' + dataset)
    top()
    tap('compute-' + execution)
    tap('road-mode-prefer-cache')
    tap('shape-heart')
    tap('distance-' + km)


def details(name, count=5):
    top()
    result = {}
    for i in range(20):
        tree = ui(name + '-ui-' + str(i), i in [0, 2])
        for node in tree.iter('node'):
            key = node.get('resource-id', '')
            value = node.get('text', '')
            if '개 코스를 찾았어요' in value:
                result['completion'] = value
            if value.startswith('전체 소요 시간'):
                result['totalTiming'] = value
            if value.startswith('도로 조회 '):
                result['stageTiming'] = value
            if key in ['calculation-done', 'route-timing', 'calculation-metrics', 'reference-comparison'] or re.fullmatch(r'candidate-\d+', key):
                text = ' / '.join(n.get('text') for n in node.iter('node') if n.get('text'))
                if len(text) > len(result.get(key, '')):
                    result[key] = text
        if all('candidate-' + str(i) in result for i in range(count)) and 'calculation-metrics' in result:
            break
        scroll()
    assert count > 0 and all('candidate-' + str(i) in result for i in range(count)), 'Missing candidates'
    save(name + '-details', result)
    return result


def calculate(name):
    before = conditions()
    old = metrics()
    tap('calculate-route')
    print('Started ' + name, flush=True)
    started = time.monotonic()
    samples = []
    result = None
    while time.monotonic()-started < 300:
        time.sleep(3)
        values = metrics()
        if values and values != old:
            result = values[-1]
            break
        if int(time.monotonic()-started)//30 > len(samples):
            samples.append(conditions())
            print('Calculating ' + name + ' ' + str(round(time.monotonic()-started)) + 's', flush=True)
    if result is None:
        capture(name + '-failure')
        raise RuntimeError('Calculation did not produce metrics')
    after = conditions()
    save(name, {'name': name, 'result': result, 'before': before, 'after': after, 'samples': samples})
    visible = details(name, result['candidates'])
    print(json.dumps({'name': name, 'result': result, 'completion': visible.get('calculation-done'),
                      'after': after}, ensure_ascii=False), flush=True)


def run(name, dataset, execution, km):
    prepare(dataset, execution, km)
    calculate(name)


def batch():
    cases = [('server-gangnam-2', 'seoul-gangnam', 'server', '5'),
             ('device-gangnam-1', 'seoul-gangnam', 'device', '5'),
             ('server-gangnam-3', 'seoul-gangnam', 'server', '5'),
             ('device-gangnam-2', 'seoul-gangnam', 'device', '5'),
             ('server-busan-1', 'busan-cityhall', 'server', '3'),
             ('device-busan-first', 'busan-cityhall', 'device', '3'),
             ('device-gangnam-3', 'seoul-gangnam', 'device', '5'),
             ('server-busan-2', 'busan-cityhall', 'server', '3'),
             ('device-busan-1', 'busan-cityhall', 'device', '3'),
             ('server-busan-3', 'busan-cityhall', 'server', '3'),
             ('device-busan-2', 'busan-cityhall', 'device', '3'),
             ('device-busan-3', 'busan-cityhall', 'device', '3')]
    for case in cases:
        if not (OUT / (case[0] + '-details.json')).exists():
            run(*case)


def cancel(execution):
    prepare('seoul-gangnam', execution, '5')
    old = metrics()
    tap('calculate-route')
    if execution == 'device':
        tap('response-check')
        tree = ui('device-input-during-calculation', True)
        assert any('누른 횟수 1' in n.get('text', '') for n in tree.iter('node'))
        assert metrics() == old, 'Calculation finished before input test'
        save('device-input', {'responseWhileComputing': True})
        top()
        tap('cancel-route')
    else:
        tap_visible('cancel-route')
    tree = ui(execution + '-cancel', True)
    assert any('계산을 취소했어요.' in n.get('text', '') for n in tree.iter('node'))
    time.sleep(12)
    tree = ui(execution + '-cancel-late', True)
    assert any('계산을 취소했어요.' in n.get('text', '') for n in tree.iter('node')) and metrics() == old
    save(execution + '-cancel', {'cancelled': True, 'noLateResultAfterSeconds': 12})
    calculate(execution + '-after-cancel')


def fill(key, value):
    assert re.fullmatch(r'[A-Za-z0-9 .-]+', value)
    tap(key)
    node = find(key, ui())
    assert node is not None
    length = len(node.get('text', ''))
    assert length < 120
    adb('shell', 'input', 'keyevent', '123', *(['67'] * length))
    adb('shell', 'input', 'text', value.replace(' ', '%s'))
    adb('shell', 'input', 'keyevent', '4')
    time.sleep(1.5)


def save_course(name):
    assert name.startswith('QA phone A750 ')
    top()
    fill('course-save-name', name)
    tap('course-save')
    time.sleep(1)
    tree = ui('course-saved', True)
    assert any('이 기기에 코스를 저장했어요.' in n.get('text', '') for n in tree.iter('node'))
    tap('course-save')
    tree = ui('course-duplicate', True)
    assert any('이미 저장한 코스예요.' in n.get('text', '') for n in tree.iter('node'))
    helper('inspect', 'saved-' + name.split()[-1])


def draw(kind):
    node = find('drawing-canvas', ui())
    assert node is not None
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds')))
    paths = {'square': [(.18,.18),(.82,.18),(.82,.82),(.18,.82),(.18,.18)],
             'open': [(.18,.18),(.82,.18),(.82,.82)],
             'triangle': [(.5,.15),(.85,.85),(.15,.85),(.5,.15)]}
    points = ';'.join(f'{round(x1+x*(x2-x1))},{round(y1+y*(y2-y1))}' for x,y in paths[kind])
    response = adb('shell', 'uiautomator', 'runtest', '/data/local/tmp/a750-comparison-gesture.jar',
                   '/system/framework/android.test.base.jar', '-c', 'DrawingGesture', '-e', 'points', "'" + points + "'")
    assert b'OK (1 test)' in response


def drawing():
    prepare('seoul-gangnam', 'server', '3')
    top()
    tap('shape-custom')
    assert find('drawing-apply', ui()).get('enabled') == 'false'
    draw('open')
    tree = ui('drawing-open', True)
    assert find('drawing-apply', tree).get('enabled') == 'false'
    tap_visible('drawing-clear')
    draw('square')
    tree = ui('drawing-square', True)
    assert find('drawing-apply', tree).get('enabled') == 'true'
    tap_visible('drawing-apply')
    top()
    tap('shape-custom')
    draw('triangle')
    tap_visible('drawing-cancel')
    top()
    tap('shape-custom')
    ui('drawing-cancel-preserved', True)
    tap_visible('drawing-apply')
    top()
    calculate('server-custom')
    save('drawing', {'openRejected': True, 'clearAndSquareAccepted': True, 'editCancelled': True})
    save_course('QA phone A750 custom')


def offline(name):
    prepare('seoul-gangnam', 'server', '5')
    previous = {k: adb('shell', 'settings', 'get', 'global', k).decode().strip()
                for k in ['wifi_on', 'mobile_data']}
    try:
        adb('shell', 'svc', 'wifi', 'disable')
        adb('shell', 'svc', 'data', 'disable')
        time.sleep(2)
        state('offline-network')
        calculate(name)
    finally:
        adb('shell', 'svc', 'wifi', 'enable' if previous['wifi_on'] == '1' else 'disable')
        adb('shell', 'svc', 'data', 'enable' if previous['mobile_data'] == '1' else 'disable')


def finish():
    initial = json.loads((OUT / 'initial-content.json').read_text(encoding='utf-8'))
    final = json.loads((OUT / 'final-content.json').read_text(encoding='utf-8'))
    assert all(initial[k] == final[k] for k in ['saved_courses', 'running_sessions', 'running_points', 'storage_test_notes'])
    assert not final['tests'] and final['sync_deletions'] == final['sync_conflicts'] == 0
    page('account')
    tree = ui('final-account', True)
    assert find('account-email', tree).get('text') == '로그인하고 내 기록을 이어가세요.'
    page('')
    ui('final-home', True)
    crash = adb('logcat', '-b', 'crash', '-d', '-T', '10-11 20:36:59.000').decode(errors='replace')
    assert 'Process: ' + APP + ',' not in crash, 'App crash during test'
    state('final-state')
    installed = json.loads((OUT / 'installed.json').read_text(encoding='utf-8'))
    current = json.loads((OUT / 'final-state.json').read_text(encoding='utf-8'))
    assert current['apkSha256'] == EXPECTED and current['network'] == installed['network']
    assert current['fontScale'] == installed['fontScale'] and current['servicesNone']
    assert b'Success' in adb('uninstall', 'com.runningart.authdigest')
    paths = ['/data/local/tmp/a750-comparison-ui.jar', '/data/local/tmp/a750-comparison-gesture.jar',
             '/data/local/tmp/a750-comparison-ui.xml', '/data/local/tmp/running-qa.xml',
             '/data/local/tmp/local/tmp/running-qa.xml', '/data/local/tmp/route-performance-live.xml',
             '/data/local/tmp/local/tmp/route-performance-live.xml']
    adb('shell', 'rm', '-f', *paths)
    for path in paths:
        result = subprocess.run([str(ADB), '-s', SERIAL, 'shell', 'test', '-e', path], capture_output=True, timeout=20)
        assert result.returncode == 1, 'QA file still exists or device disconnected'
    assert not adb('shell', 'pm', 'list', 'packages', 'com.runningart.authdigest').strip()
    save('cleanup', {'signedOut': True, 'originalContentRestored': True, 'helperRemoved': True,
                     'qaDeviceFilesRemoved': True, 'noAppCrashSinceInstall': True, 'noAppServices': True})
    print('PASS: content restored, guest/home, same APK/settings, no service, helpers removed', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['state', 'capture', 'tap', 'tap_visible', 'page', 'top', 'helper', 'run', 'offline', 'calculate', 'details', 'prepare', 'batch', 'cancel', 'fill', 'save_course', 'drawing', 'draw', 'finish'])
    parser.add_argument('args', nargs='*')
    args = parser.parse_args()
    assert adb('shell', 'getprop', 'ro.product.model').decode().strip() == 'SM-A750N', 'Wrong device'
    OUT.mkdir(parents=True, exist_ok=True)
    globals()[args.action](*args.args)
