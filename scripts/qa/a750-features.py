"""UI-only follow-up of explicitly named A750 synthetic/public test courses."""
import importlib.util
import json
import pathlib
import re
import sys
import time

spec = importlib.util.spec_from_file_location('a750', pathlib.Path(__file__).with_name('a750-server-comparison.py'))
q = importlib.util.module_from_spec(spec)
spec.loader.exec_module(q)


def scroll(up=False):
    # Saved-course maps are inside the scroll view; swipe beyond their padded edge.
    q.adb('shell', 'input', 'swipe', '1052', '1250' if up else '1850',
          '1052', '1850' if up else '1250', '350')


q.scroll = scroll


def course(kind='terrain'):
    data = json.loads((q.OUT / ('saved-' + kind + '.json')).read_text(encoding='utf-8'))
    rows = [r for r in data['tests'] if r['kind'] == 'course' and r['name'] == 'QA phone A750 ' + kind]
    assert len(rows) == 1
    return rows[0]


def field(key, name):
    if key == 'run-status':
        q.top()
    for _ in range(14):
        tree = q.ui(name)
        node = q.find(key, tree)
        if node is not None and node.get('bounds') != '[0,0][0,0]':
            q.ui(name, True)
            return node.get('text') or node.get('content-desc')
        q.scroll()
    raise RuntimeError('Field not visible: ' + key)


def network():
    return {k: q.adb('shell', 'settings', 'get', 'global', k).decode().strip()
            for k in ['wifi_on', 'mobile_data']}


def restore_network(previous):
    q.adb('shell', 'svc', 'wifi', 'enable' if previous['wifi_on'] == '1' else 'disable')
    q.adb('shell', 'svc', 'data', 'enable' if previous['mobile_data'] == '1' else 'disable')


def terrain():
    row = course()
    path = 'courses/' + row['id']
    q.page(path)
    assert q.find('course-title', q.ui()).get('text') == row['name']
    q.tap('terrain-toggle')
    time.sleep(3)
    summary = field('terrain-summary', 'terrain-online')
    assert summary == '총 오르막 ↑96m'
    q.tap('terrain-reverse')
    direction = field('terrain-direction', 'terrain-reversed')
    assert '반대 방향' in direction
    q.tap('terrain-reverse')
    assert '기본 방향' in field('terrain-direction', 'terrain-restored')
    q.top()
    q.tap('terrain-toggle')
    previous = network()
    try:
        q.adb('shell', 'svc', 'wifi', 'disable')
        q.adb('shell', 'svc', 'data', 'disable')
        q.tap('terrain-toggle')
        assert field('terrain-summary', 'terrain-memory-offline') == summary
        q.page(path)
        q.tap('terrain-toggle')
        time.sleep(3)
        error = field('terrain-error', 'terrain-restart-offline')
        assert error
    finally:
        restore_network(previous)
    time.sleep(4)
    q.tap('terrain-retry')
    time.sleep(3)
    assert field('terrain-summary', 'terrain-retry') == summary
    q.save('terrain', {'ascentMeters': 96, 'reverseAndRestore': True,
                       'offlineMemory': True, 'freshProcessOfflineError': True, 'onlineRetry': True})
    q.helper('inspect', 'after-terrain')
    after = json.loads((q.OUT / 'after-terrain.json').read_text(encoding='utf-8'))
    assert next(r for r in after['tests'] if r['id'] == row['id'])['snapshotHash'] == row['snapshotHash']
    print('PASS: saved course, terrain directions, offline memory/error, retry, snapshot unchanged', flush=True)


def simulation():
    row = course()
    previous = network()
    try:
        q.adb('shell', 'svc', 'wifi', 'disable')
        q.adb('shell', 'svc', 'data', 'disable')
        q.page('courses/' + row['id'])
        q.tap('course-simulation-toggle')
        q.tap('simulation-play')
        time.sleep(4)
        q.tap('simulation-play')
        assert field('simulation-status', 'simulation-paused') == '일시정지'
        progress = field('simulation-progress', 'simulation-progress')
        time.sleep(3)
        assert field('simulation-progress', 'simulation-still-paused') == progress
        q.tap('simulation-restart')
        zero = field('simulation-progress', 'simulation-reset')
        assert '이동 0.00 /' in zero
        q.save('simulation', {'offlineReplay': True, 'pauseStable': True, 'restartZero': True, 'progress': progress})
    finally:
        restore_network(previous)
    print('PASS: offline saved-course simulation, pause and reset', flush=True)


def terrain_chart():
    q.page('courses/' + course()['id'])
    q.tap('terrain-toggle')
    time.sleep(3)
    q.locate('terrain-chart')
    node = q.find('terrain-chart', q.ui())
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds')))
    q.adb('shell', 'input', 'tap', str(round(x1+.6*(x2-x1))), str((y1+y2)//2))
    selected = field('terrain-selection', 'terrain-chart-selected')
    q.tap('terrain-reverse')
    reversed_value = field('terrain-selection', 'terrain-chart-reversed')
    assert selected != reversed_value and '고도 35m' in selected and '고도 35m' in reversed_value
    q.save('terrain-chart', {'selected': selected, 'reversed': reversed_value, 'sameElevation': True})
    print('PASS: terrain graph touch and direction preserve selected physical elevation', flush=True)


def gpx():
    row = course()
    q.page('courses/' + row['id'])
    q.tap('course-export-gpx')
    tree = q.ui('gpx-chooser', True)
    packages = {n.get('package') for n in tree.iter('node')}
    assert any(p and p != q.APP for p in packages), 'System share chooser not shown'
    texts = ' '.join(n.get('text', '') + ' ' + n.get('content-desc', '') for n in tree.iter('node'))
    q.save('gpx', {'systemChooserOpened': True, 'recipientSelected': False, 'gpxMentioned': '.gpx' in texts})
    q.adb('shell', 'input', 'keyevent', '4')
    print('PASS: GPX system chooser opened and dismissed', flush=True)


def cleanup_courses():
    q.helper('inspect', 'before-course-cleanup')
    data = json.loads((q.OUT / 'before-course-cleanup.json').read_text(encoding='utf-8'))
    for row in data['tests']:
        assert row['kind'] == 'course' and row['name'] in ['QA phone A750 terrain', 'QA phone A750 custom']
        q.page('courses/' + row['id'])
        assert q.find('course-title', q.ui()).get('text') == row['name']
        q.tap('course-delete')
        q.tap_visible('android:id/button1')
    q.helper('inspect', 'final-content')
    print('PASS: only named A750 test courses deleted', flush=True)


def gps():
    package = q.adb('shell', 'dumpsys', 'package', q.APP).decode()
    background_before = bool(re.search(r'android.permission.ACCESS_BACKGROUND_LOCATION: granted=true', package))
    since = int(time.time() * 1000)
    previous_start = q.OUT / 'gps-start.json'
    if previous_start.exists() and not (q.OUT / 'gps.json').exists():
        previous = json.loads(previous_start.read_text(encoding='utf-8'))
        since, background_before = previous['since'], previous['backgroundGrantedBefore']
    else:
        q.save('gps-start', {'since': since, 'backgroundGrantedBefore': background_before})
    q.page('run')
    q.tap('run-start')
    q.tap_visible('android:id/button1')
    time.sleep(2)
    tree = q.ui('gps-permission')
    for ident in ['com.android.permissioncontroller:id/permission_allow_always_button',
                  'com.android.permissioncontroller:id/permission_allow_button']:
        node = q.find(ident, tree)
        if node is not None and node.get('text') == '항상 허용':
            q.tap_visible(ident)
            break
    time.sleep(12)
    tree = q.ui('gps-after-permission')
    error = q.find('run-error', tree)
    if error is not None and error.get('text') == '러닝 준비를 취소했어요.':
        q.save('gps-permission-cancel', {'permissionFlowCancelledPreparation': True, 'retryRequired': True})
        q.tap('run-start')
        q.tap_visible('android:id/button1')
        time.sleep(12)
    assert field('run-status', 'gps-running') == '러닝 중'
    service = q.adb('shell', 'dumpsys', 'activity', 'services', q.APP).decode()
    assert 'LocationTaskService' in service
    q.tap('run-pause')
    assert field('run-status', 'gps-paused') == '일시정지'
    time.sleep(3)
    gps_from_paused(since, background_before)


def gps_from_paused(since, background_before):
    assert field('run-status', 'gps-paused') == '일시정지'
    q.tap('run-start')
    q.tap_visible('android:id/button1')
    time.sleep(7)
    assert field('run-status', 'gps-resumed') == '러닝 중'
    q.page('run')
    assert field('run-status', 'gps-interrupted') == '기록 중단'
    q.tap('run-start')
    q.tap_visible('android:id/button1')
    time.sleep(8)
    q.tap('run-finish')
    q.tap_visible('android:id/button1')
    time.sleep(2)
    q.ui('gps-completed', True)
    q.adb('shell', 'am', 'force-stop', q.APP)
    response = q.adb('shell', 'am', 'instrument', '-w', '-e', 'action', 'recent-runs', '-e', 'since', str(since),
                     'com.runningart.authdigest/com.runningart.authdigest.PhoneValidation').decode()
    assert 'INSTRUMENTATION_CODE: 0' in response
    rows = json.loads(re.search(r'INSTRUMENTATION_RESULT: runs=(.*)', response).group(1))
    assert len(rows) == 1 and rows[0]['status'] == 'completed'
    q.save('gps', {'pauseResume': True, 'forceStopRecovery': True, 'foregroundService': True, 'run': rows[0]})
    ident = rows[0]['id']
    assert re.fullmatch(r'[a-f0-9-]+', ident)
    q.page('runs/' + ident)
    q.tap('run-delete')
    q.tap_visible('android:id/button1')
    if not background_before:
        q.adb('shell', 'pm', 'revoke', q.APP, 'android.permission.ACCESS_BACKGROUND_LOCATION')
    permissions_after = q.adb('shell', 'dumpsys', 'package', q.APP).decode()
    assert bool(re.search(r'android.permission.ACCESS_BACKGROUND_LOCATION: granted=true', permissions_after)) == background_before
    q.save('gps-cleanup', {'testRunDeleted': True, 'backgroundPermissionRestored': True})
    print('PASS: real stationary GPS lifecycle, interruption restore, save/delete; no location export', flush=True)


if __name__ == '__main__':
    assert q.adb('shell', 'getprop', 'ro.product.model').decode().strip() == 'SM-A750N'
    assert sys.argv[1] in ['terrain', 'terrain_chart', 'simulation', 'gpx', 'cleanup_courses', 'gps']
    globals()[sys.argv[1]]()
