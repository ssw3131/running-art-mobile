"""Read/drive only emulator-5556 for RunPen simulation evidence; never a phone."""
import argparse
import hashlib
import json
import pathlib
import re
import sqlite3
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
sys.stdout.reconfigure(encoding='utf-8')

ROOT = pathlib.Path.cwd()
OUT = ROOT / '.cache/guidance-qa'
OUT.mkdir(parents=True, exist_ok=True)
ADB = ROOT / '.tools/android-sdk/platform-tools/adb.exe'
APP = 'com.runningart.mobile.dev'


def adb(*args, check=True):
    p = subprocess.run([str(ADB), '-s', 'emulator-5556', *args], capture_output=True)
    if check and p.returncode:
        raise RuntimeError(p.stderr.decode(errors='replace'))
    return p.stdout


def path(name, suffix):
    if not re.fullmatch(r'[a-zA-Z0-9_-]+', name):
        raise ValueError('Invalid evidence name')
    return OUT / (name + suffix)


def ui(name='screen'):
    for attempt in range(4):
        output = adb('shell', 'uiautomator', 'runtest', '/data/local/tmp/running-ui-dump.jar', '/system/framework/android.test.base.jar', '-c', 'RunningUiDump')
        if b'OK (1 test)' in output:
            break
        time.sleep(.5)
    else:
        raise RuntimeError(output.decode(errors='replace'))
    data = adb('shell', 'cat', '/data/local/tmp/running-qa.xml')
    path(name, '.xml').write_bytes(data)
    return ET.fromstring(data)


def capture(name):
    tree = ui(name)
    path(name, '.png').write_bytes(adb('exec-out', 'screencap', '-p'))
    return [n.get('text') for n in tree.iter('node') if n.get('text')]


def tap(key):
    nodes = []
    for attempt in range(5):
        nodes = [n for n in ui().iter('node') if key in (n.get('resource-id'), n.get('text'), n.get('content-desc'))]
        if nodes:
            break
        time.sleep(.5)
    if not nodes:
        raise RuntimeError('Control not found: ' + key)
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', nodes[0].get('bounds')))
    if x2 <= x1 or y2 <= y1:
        raise RuntimeError('Control not visible: ' + key)
    adb('shell', 'input', 'tap', str((x1 + x2) // 2), str((y1 + y2) // 2))
    time.sleep(.8)


def snapshot(name):
    folder = path(name, '')
    folder.mkdir(exist_ok=True)
    for suffix in ['', '-wal', '-shm']:
        data = adb('exec-out', 'cat', f'/data/user/0/{APP}/files/SQLite/running-art.db{suffix}', check=False)
        if data:
            (folder / ('running-art.db' + suffix)).write_bytes(data)
    conn = sqlite3.connect(folder / 'running-art.db')
    tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
    report = {}
    for table in tables:
        rows = conn.execute('SELECT * FROM "' + table.replace('"', '""') + '"').fetchall()
        canonical = json.dumps(sorted(rows, key=repr), ensure_ascii=False, default=str, separators=(',', ':')).encode()
        report[table] = {'rows': len(rows), 'sha256': hashlib.sha256(canonical).hexdigest()}
    report['user_version'] = conn.execute('PRAGMA user_version').fetchone()[0]
    conn.close()
    path(name, '.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    return report


def install_database(file):
    # Explicit emulator and app-private paths; never copy accounts or phone data.
    device = f'/data/user/0/{APP}/files/SQLite/running-art.db'
    adb('shell', 'am', 'force-stop', APP)
    owner = adb('shell', 'stat', '-c', '%u:%g', device).decode().strip()
    assert re.fullmatch(r'\d+:\d+', owner)
    adb('push', str(file), '/data/local/tmp/runpen-guidance-qa.db')
    adb('shell', 'cp', '/data/local/tmp/runpen-guidance-qa.db', device)
    adb('shell', 'chown', owner, device)
    adb('shell', 'chmod', '600', device)
    for suffix in ['-wal', '-shm']:
        adb('shell', 'rm', '-f', device + suffix)
    adb('shell', 'rm', '-f', '/data/local/tmp/runpen-guidance-qa.db')


def seed_fixture():
    adb('shell', 'am', 'force-stop', APP)
    report = snapshot('before-fixture')
    assert report['user_version'] == 4
    assert all(v['rows'] == 0 for k, v in report.items() if k != 'user_version'), 'QA seeding requires the verified empty emulator'
    original = sqlite3.connect(path('before-fixture', '') / 'running-art.db')
    backup = sqlite3.connect(path('fixture-original', '.db'))
    original.backup(backup)
    backup.close()
    work = sqlite3.connect(path('fixture-seeded', '.db'))
    original.backup(work)
    original.close()
    value = json.loads(path('fixture', '.json').read_text(encoding='utf-8'))
    data = value['snapshot']
    for label, identity in [('A', 'a' * 32), ('B', 'b' * 32)]:
        work.execute('INSERT INTO saved_courses(id,name,source,shape,target_km,length_km,score,snapshot_json,snapshot_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
                     (identity, '안내 QA 보존 코스 ' + label, data['source'], data['shape'], data['targetKm'], data['lengthKm'], data['score'], value['json'], value['hash'], 1791000000000, 1791000000000))
    work.execute('INSERT INTO storage_test_notes(content,created_at,updated_at) VALUES(?,?,?)', ('모의 안내 자료 보존 검사', 1791000000000, 1791000000000))
    work.execute("INSERT INTO running_sessions(id,status,started_at,ended_at,active_ms,checkpoint_at,resumed_at,distance_m,point_count) VALUES(?, 'completed', ?, ?, 60000, ?, ?, 12, 2)",
                 ('c' * 32, 1791000000000, 1791000060000, 1791000060000, 1791000000000))
    for index in range(2):
        lng, lat = data['route'][index]
        work.execute('INSERT INTO running_points(run_id,sequence,segment,timestamp,latitude,longitude,accuracy) VALUES(?,?,?,?,?,?,?)',
                     ('c' * 32, index, 0, 1791000000000 + index * 60000, lat, lng, 5))
    work.commit()
    assert work.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    work.close()
    install_database(path('fixture-seeded', '.db'))
    print(json.dumps(snapshot('fixture-before'), ensure_ascii=False), flush=True)


def restore_fixture():
    assert path('fixture-original', '.db').exists(), 'Missing exact original backup'
    install_database(path('fixture-original', '.db'))
    after = snapshot('after-fixture-restored')
    before = json.loads(path('before-fixture', '.json').read_text())
    assert before == after, 'Original emulator contents were not restored'
    print('Original emulator database restored; all table counts and hashes equal', flush=True)


def smoke():
    tap('guidance-result')
    assert any('완주를 축하합니다' in v for v in capture('result'))
    tap('guidance-retry')
    tap('guidance-settings')
    capture('settings')
    tap('guidance-voice-switch')
    tap('guidance-background-switch')
    tap('guidance-settings-close')
    tap('guidance-play')
    time.sleep(2)
    adb('shell', 'input', 'keyevent', '3')
    time.sleep(3)
    services = adb('shell', 'dumpsys', 'activity', 'services', APP).decode()
    assert 'expo.modules.guidance.GuidanceService' not in services
    adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'runningart://guidance', APP)
    time.sleep(2)
    labels = capture('background-disabled-paused')
    assert any('이어서 재생' in v for v in labels)
    tap('guidance-settings')
    tap('guidance-voice-switch')
    tap('guidance-background-switch')
    tap('guidance-settings-close')
    tap('guidance-panel')
    tap('guidance-restart')
    path('smoke', '.json').write_text(json.dumps({'result': True, 'settings': True, 'background_disabled_pauses': True, 'no_auto_resume': True}), encoding='utf-8')
    print('Smoke assertions passed', flush=True)


def start_long():
    for _ in range(5):
        tree = ui()
        if any(n.get('resource-id') == 'guidance-scenario-long' for n in tree.iter('node')):
            break
        adb('shell', 'input', 'swipe', '960', '575', '180', '575', '400')
    tap('guidance-scenario-long')
    capture('long-ready')
    adb('shell', 'settings', 'put', 'secure', 'location_mode', '0')
    adb('shell', 'svc', 'wifi', 'disable')
    # Mark the beginning in logcat without deleting previous evidence.
    adb('shell', 'log', '-t', 'RunPenGuidance', 'long_test_begin')
    tap('guidance-play')
    capture('long-start')
    print('Long scenario started at 1x; GPS and Wi-Fi off', flush=True)


def monitor(minutes):
    start = time.monotonic()
    adb('shell', 'input', 'keyevent', '223')
    samples = []
    while time.monotonic() - start < minutes * 60:
        power = adb('shell', 'dumpsys', 'power').decode(errors='replace')
        services = adb('shell', 'dumpsys', 'activity', 'services', APP).decode(errors='replace')
        logs = adb('logcat', '-d', '-s', 'RunPenGuidance:I', '*:S').decode(errors='replace')
        sample = {'elapsed_s': round(time.monotonic() - start, 1), 'asleep': 'mWakefulness=Asleep' in power or 'mWakefulness=Dozing' in power,
                  'service': 'expo.modules.guidance.GuidanceService' in services, 'checkpoint': re.findall(r'checkpoint ([^\r\n]+)', logs)[-1:]}
        samples.append(sample)
        path('screen-off-monitor', '.json').write_text(json.dumps(samples, ensure_ascii=False, indent=2), encoding='utf-8')
        path('screen-off-native', '.log').write_text(logs, encoding='utf-8')
        print(json.dumps(sample, ensure_ascii=False), flush=True)
        if not sample['service']:
            raise RuntimeError('Guidance foreground service ended before the screen-off test completed')
        time.sleep(min(30, max(0, minutes * 60 - (time.monotonic() - start))))
    print(json.dumps({'completed': True, 'elapsed_s': round(time.monotonic() - start, 1)}), flush=True)


def resume_long():
    samples = json.loads(path('screen-off-monitor', '.json').read_text())
    assert samples[-1]['elapsed_s'] >= 1760
    assert all(s['asleep'] and s['service'] for s in samples)
    power = adb('shell', 'dumpsys', 'power').decode(errors='replace')
    assert 'mWakefulness=Asleep' in power or 'mWakefulness=Dozing' in power
    logs = adb('logcat', '-d', '-s', 'RunPenGuidance:I', '*:S').decode(errors='replace').split('long_test_begin')[-1]
    checkpoints = re.findall(r'checkpoint ([^\r\n]+)', logs)
    assert int(re.search(r'time=(\d+)', checkpoints[-1])[1]) >= 1780000
    assert all('tts_done id=' + key in logs for key in ['off-1', 'returned-1', 'turn-1-100', 'turn-1-30'])
    assert len(re.findall(r'vibration id=off-1 ', logs)) == 1
    connectivity = adb('shell', 'dumpsys', 'connectivity').decode(errors='replace')
    assert 'Active default network: none' in connectivity
    assert adb('shell', 'settings', 'get', 'secure', 'location_mode').strip() == b'0'
    path('screen-off-final', '.log').write_text(logs, encoding='utf-8')
    path('screen-off-power', '.txt').write_text(power, encoding='utf-8')
    path('screen-off-summary', '.json').write_text(json.dumps({'samples': len(samples), 'last_sample_s': samples[-1]['elapsed_s'],
        'all_asleep': True, 'all_service': True, 'offline': True, 'gps_off': True, 'off_and_return_speech_done': True,
        'turn_speech_done': True, 'one_vibration': True, 'last_checkpoint': checkpoints[-1]}, ensure_ascii=False, indent=2), encoding='utf-8')
    adb('shell', 'input', 'keyevent', '224')
    adb('shell', 'wm', 'dismiss-keyguard')
    time.sleep(2)
    print(json.dumps(capture('long-resumed'), ensure_ascii=False), flush=True)


def assert_stopped(name):
    time.sleep(3)
    service = adb('shell', 'dumpsys', 'activity', 'services', APP).decode(errors='replace')
    assert 'expo.modules.guidance.GuidanceService' not in service
    power = adb('shell', 'dumpsys', 'power').decode(errors='replace')
    locks = [line for line in power.splitlines() if 'PARTIAL_WAKE_LOCK' in line and 'HeadlessJsTaskService' in line]
    assert not locks
    first = adb('logcat', '-d', '-s', 'RunPenGuidance:I', '*:S')
    time.sleep(5)
    assert first == adb('logcat', '-d', '-s', 'RunPenGuidance:I', '*:S'), 'Guidance continued after stopping'
    path(name, '.json').write_text(json.dumps({'no_service': True, 'no_headless_wakelock': True, 'no_new_progress_speech_vibration_for_5s': True}), encoding='utf-8')
    print('Stopped and cleaned up: ' + name, flush=True)


def launch_route(route):
    adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'runningart://' + route, APP)
    time.sleep(2)


def saved_smoke():
    launch_route('courses/' + 'a' * 32)
    for _ in range(5):
        if any(n.get('resource-id') == 'course-guidance' for n in ui().iter('node')):
            break
        adb('shell', 'input', 'swipe', '550', '1900', '550', '650', '350')
    capture('saved-course-detail')
    tap('course-guidance')
    labels = capture('saved-course-ready')
    assert any('안내 QA 보존 코스 A' in v for v in labels)
    tap('guidance-play')
    time.sleep(3)
    tap('guidance-play')
    launch_route('guidance?courseId=' + 'b' * 32)
    assert any('진행 중인 모의 시험을 먼저 종료' in v for v in capture('different-course-blocked'))
    launch_route('guidance?courseId=' + 'a' * 32)
    assert any('이어서 재생' in v for v in capture('same-course-resumed'))
    tap('guidance-panel')
    tap('guidance-speed-30')
    tap('guidance-panel-close')
    tap('guidance-play')
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        if any(n.get('resource-id') == 'guidance-result' for n in ui().iter('node')):
            break
        time.sleep(2)
    else:
        raise RuntimeError('Saved course did not finish within 60s at 30x')
    capture('saved-course-arrived')
    tap('guidance-result')
    time.sleep(2)
    labels = capture('saved-course-result')
    assert any('완주를 축하합니다' in v for v in labels)
    assert any('안내 QA 보존 코스 A' in v for v in labels)
    assert_stopped('saved-result-stopped')
    path('saved-smoke', '.json').write_text(json.dumps({'detail_entry': True, 'original_course': True, 'other_course_blocked': True,
        'same_course_resumes': True, 'arrival_confirmation': True, 'result': True}), encoding='utf-8')
    print('Saved course smoke passed', flush=True)


def notification_stop():
    if any(n.get('resource-id') == 'guidance-retry' for n in ui().iter('node')):
        tap('guidance-retry')
    tap('guidance-play')
    time.sleep(2)
    adb('shell', 'cmd', 'statusbar', 'expand-notifications')
    time.sleep(2)
    if not any(n.get('text') == '시험 종료' for n in ui().iter('node')):
        tap('Expand')
        time.sleep(1)
    capture('notification-stop-controls')
    tap('시험 종료')
    assert_stopped('notification-stop')
    adb('shell', 'cmd', 'statusbar', 'collapse')
    time.sleep(2)
    assert any('모의 주행을 종료했어요' in v for v in capture('notification-ended-ui'))
    tap('guidance-retry')
    tap('guidance-play')
    time.sleep(2)
    adb('shell', 'am', 'force-stop', APP)
    assert_stopped('force-stop')
    launch_route('guidance')
    labels = capture('force-stop-reopened')
    assert '00:00:00' in labels and any('모의 주행 시작' in v for v in labels)
    assert_stopped('no-auto-restart')
    print('Notification stop and process-stop recovery passed', flush=True)


def manual_smoke():
    tap('guidance-mode')
    tap('guidance-play')
    tap('guidance-panel')
    tap('guidance-speed-5')
    tap('guidance-command-depart')
    tap('guidance-panel-close')
    time.sleep(11)
    labels = capture('final-focus-off')
    assert '코스를 벗어났어요' in labels and '↶' in labels
    tap('guidance-panel')
    tap('guidance-command-return')
    tap('guidance-panel-close')
    time.sleep(11)
    assert '코스를 따라 달리고 있어요' in capture('final-focus-returned')
    tap('guidance-panel')
    tap('guidance-command-weak')
    tap('guidance-panel-close')
    time.sleep(2)
    assert '위치를 확인하고 있어요' in capture('final-focus-weak')
    tap('guidance-panel')
    tap('guidance-command-normal')
    tap('guidance-panel-close')
    time.sleep(2)
    assert '코스를 따라 달리고 있어요' in capture('final-focus-recovered')
    tap('guidance-play')
    assert_stopped('final-manual-paused')
    path('manual-smoke', '.json').write_text(json.dumps({'off_route': True, 'stationary_uturn': True, 'retrace_return': True,
        'weak': True, 'normal_after_weak': True, 'pause_cleanup': True}), encoding='utf-8')
    print('Final manual off/return/weak/recovery/pause smoke passed', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['capture', 'tap', 'snapshot', 'launch', 'monitor', 'smoke', 'start-long', 'resume-long', 'assert-stopped', 'seed-fixture', 'restore-fixture', 'saved-smoke', 'notification-stop', 'manual-smoke'])
    parser.add_argument('value', nargs='?', default='screen')
    args = parser.parse_args()
    if args.action == 'capture': print(json.dumps(capture(args.value), ensure_ascii=False))
    elif args.action == 'tap': tap(args.value)
    elif args.action == 'snapshot': print(json.dumps(snapshot(args.value), ensure_ascii=False))
    elif args.action == 'launch': print(adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'runningart://guidance', APP).decode())
    elif args.action == 'monitor': monitor(float(args.value))
    elif args.action == 'smoke': smoke()
    elif args.action == 'start-long': start_long()
    elif args.action == 'seed-fixture': seed_fixture()
    elif args.action == 'restore-fixture': restore_fixture()
    elif args.action == 'resume-long': resume_long()
    elif args.action == 'assert-stopped': assert_stopped(args.value)
    elif args.action == 'saved-smoke': saved_smoke()
    elif args.action == 'notification-stop': notification_stop()
    elif args.action == 'manual-smoke': manual_smoke()
