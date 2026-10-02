"""API 36 emulator-only UI/GPS/SQLite evidence helper; never targets a physical phone.

Run from mobile root. Output lives in .cache/running-qa. GPS injection uses a synthetic
line near 37N/127E and does not represent a user's actual location.
"""
import argparse
import json
import pathlib
import re
import sqlite3
import subprocess
import time
import xml.etree.ElementTree as ET

ROOT = pathlib.Path.cwd()
OUT = ROOT / '.cache/running-qa'
ADB = ROOT / '.tools/android-sdk/platform-tools/adb.exe'
APP = 'com.runningart.mobile.dev'
OUT.mkdir(parents=True, exist_ok=True)


def adb(*args, check=True):
    result = subprocess.run([str(ADB), '-s', 'emulator-5556', *args], capture_output=True)
    if check and result.returncode:
        raise RuntimeError(result.stderr.decode(errors='replace'))
    return result.stdout


def label(value):
    if not re.fullmatch(r'[a-zA-Z0-9_-]+', value):
        raise ValueError('Evidence name must be alphanumeric')
    return value


def dump(name='screen'):
    result = adb('shell', 'uiautomator', 'runtest', '/data/local/tmp/running-ui-dump.jar',
                 '/system/framework/android.test.base.jar', '-c', 'RunningUiDump').decode(errors='replace')
    if 'shortMsg=' in result or 'OK (1 test)' not in result:
        raise RuntimeError('Live UI dump failed: ' + result)
    content = adb('shell', 'cat', '/data/local/tmp/running-qa.xml')
    (OUT / (label(name) + '.xml')).write_bytes(content)
    return ET.fromstring(content)


def tap(key, scroll=True):
    for attempt in range(6 if scroll else 3):
        nodes = [n for n in dump().iter('node') if key in (n.get('resource-id'), n.get('text'), n.get('content-desc'))]
        if nodes:
            x1, y1, x2, y2 = map(int, re.findall(r'\d+', nodes[0].get('bounds')))
            if y2 - y1 >= 80 and y1 >= 270 and y2 <= 2337:
                adb('shell', 'input', 'tap', str((x1 + x2) // 2), str((y1 + y2) // 2))
                time.sleep(1)
                return
        # Scroll in the page margin; the native map intentionally consumes map gestures.
        if scroll:
            adb('shell', 'input', 'swipe', '1040', '1950', '1040', '750', '350')
        time.sleep(1)
    raise RuntimeError('Control not found: ' + key)


def capture(name):
    root = dump(name)
    (OUT / (label(name) + '.png')).write_bytes(adb('exec-out', 'screencap', '-p'))
    return [n.get('text') for n in root.iter('node') if n.get('text')]


def snapshot(name):
    folder = OUT / label(name)
    folder.mkdir(exist_ok=True)
    for suffix in ('', '-wal', '-shm'):
        data = adb('exec-out', 'cat', f'/data/user/0/{APP}/files/SQLite/running-art.db{suffix}', check=False)
        if data:
            (folder / ('running-art.db' + suffix)).write_bytes(data)
    connection = sqlite3.connect(folder / 'running-art.db')
    connection.row_factory = sqlite3.Row
    tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    report = {name: [dict(row) for row in connection.execute('SELECT * FROM ' + name)]
              for name in ['storage_test_notes', 'saved_courses', 'running_sessions', 'running_points'] if name in tables}
    connection.close()
    (folder / 'data.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
    return report


def inject(start, count):
    for i in range(start, start + count):
        adb('emu', 'geo', 'fix', f'{127 + i * 0.00007:.7f}', '37.0000000', '0', '10')
        time.sleep(2)


def scenario():
    """Resumable evidence phases; each action is observed through UI or SQLite."""
    phase_file = OUT / 'phase.json'
    state = json.loads(phase_file.read_text()) if phase_file.exists() else {'phase': 0}
    phase = state['phase']
    if phase == 0:
        # Existing interrupted session is from this QA's first failed native build.
        before = snapshot('final-build-before')
        state['old_ids'] = [r['id'] for r in before['running_sessions']]
        if any(r['status'] != 'completed' for r in before['running_sessions']):
            tap('run-finish'); tap('종료·저장', False)
        tap('run-start'); tap('계속', False)
        tree = dump()
        if any(n.get('resource-id') == 'com.android.permissioncontroller:id/permission_allow_button' for n in tree.iter('node')):
            tap('com.android.permissioncontroller:id/permission_allow_button', False)
        inject(0, 10)
        data = snapshot('foreground')
        active = [r for r in data['running_sessions'] if r['status'] == 'running']
        assert len(active) == 1, active
        state['run_id'] = active[0]['id']
        assert active[0]['point_count'] >= 5, active
        assert active[0]['distance_m'] > 20, active
        capture('foreground')
        print('Foreground GPS reception and distance confirmed', flush=True)
    elif phase == 1:
        tap('run-pause'); before = snapshot('paused')
        record = next(r for r in before['running_sessions'] if r['id'] == state['run_id'])
        assert record['status'] == 'paused'
        inject(100, 5)
        after = snapshot('paused-later')
        assert before['running_points'] == after['running_points']
        assert record == next(r for r in after['running_sessions'] if r['id'] == state['run_id'])
        capture('paused-later')
        tap('run-start'); tap('계속', False)
        inject(110, 10)
        capture('resumed')
        data = snapshot('resumed')
        resumed = next(r for r in data['running_sessions'] if r['id'] == state['run_id'])
        assert resumed['distance_m'] > record['distance_m'] + 20
        assert resumed['distance_m'] < record['distance_m'] + 100, resumed
        assert resumed['segment'] > record['segment']
        print('Pause excludes time/points; resume separates the moved location', flush=True)
    elif phase == 2:
        before = snapshot('before-lock')
        adb('shell', 'input', 'keyevent', '3')
        adb('shell', 'input', 'keyevent', '223')
        inject(120, 15)
        after = snapshot('locked')
        previous = next(r for r in before['running_sessions'] if r['id'] == state['run_id'])
        locked = next(r for r in after['running_sessions'] if r['id'] == state['run_id'])
        assert locked['status'] == 'running' and locked['point_count'] > previous['point_count'] + 5, locked
        assert locked['distance_m'] > previous['distance_m'] + 20, locked
        adb('shell', 'input', 'keyevent', '224'); adb('shell', 'wm', 'dismiss-keyguard')
        adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'runningart:///run', APP)
        capture('returned-from-lock')
        print('Screen-locked background GPS persisted without network', flush=True)
    elif phase == 3:
        current = snapshot('recovery-phase-current')
        active = next(r for r in current['running_sessions'] if r['id'] == state['run_id'])
        if active['status'] == 'running':
            snapshot('before-force-stop')
            adb('shell', 'am', 'force-stop', APP)
            inject(200, 5)
            snapshot('force-stopped')
            adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'runningart:///run', APP)
            time.sleep(3)
            snapshot('recovered')
        before = json.loads((OUT / 'before-force-stop/data.json').read_text(encoding='utf8'))
        stopped = json.loads((OUT / 'force-stopped/data.json').read_text(encoding='utf8'))
        after = json.loads((OUT / 'recovered/data.json').read_text(encoding='utf8'))
        previous = next(r for r in before['running_sessions'] if r['id'] == state['run_id'])
        restored = next(r for r in after['running_sessions'] if r['id'] == state['run_id'])
        committed = next(r for r in stopped['running_sessions'] if r['id'] == state['run_id'])
        assert restored['status'] == 'interrupted', restored
        assert restored['active_ms'] == committed['active_ms']
        assert restored['distance_m'] == committed['distance_m']
        assert after['running_points'] == stopped['running_points']
        assert restored['point_count'] >= previous['point_count']
        capture('recovered')
        tap('run-start'); tap('계속', False); inject(210, 8)
        capture('recovered-resumed')
        print('Force stop preserves committed samples; restart does not count downtime', flush=True)
    elif phase == 4:
        if not any(n.get('text') == '러닝을 종료할까요?' for n in dump().iter('node')):
            tap('run-finish')
        tap('계속하기', False)
        assert next(r for r in snapshot('finish-cancelled')['running_sessions'] if r['id'] == state['run_id'])['status'] == 'running'
        tap('run-finish'); tap('종료·저장', False)
        data = snapshot('completed')
        saved = next(r for r in data['running_sessions'] if r['id'] == state['run_id'])
        assert saved['status'] == 'completed'
        inject(230, 3)
        after = snapshot('completed-later')
        assert saved == next(r for r in after['running_sessions'] if r['id'] == state['run_id'])
        assert data['running_points'] == after['running_points']
        adb('shell', 'am', 'force-stop', APP)
        adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'runningart:///runs/' + state['run_id'], APP)
        time.sleep(3); capture('detail-offline')
        assert '러닝 상세' in capture('detail-offline')
        print('Finish confirmation/cancellation and offline history restoration confirmed', flush=True)
    elif phase == 5:
        tap('run-delete'); tap('취소', False)
        assert any(r['id'] == state['run_id'] for r in snapshot('delete-cancelled')['running_sessions'])
        adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'runningart:///run', APP)
        adb('shell', 'settings', 'put', 'secure', 'location_mode', '0')
        tap('run-start'); tap('계속', False)
        text = capture('location-disabled-start')
        assert any('기기의 위치 기능을 켠' in line for line in text), text
        assert all(r['status'] == 'completed' for r in snapshot('location-disabled-start')['running_sessions'])
        adb('shell', 'settings', 'put', 'secure', 'location_mode', '3')
        tap('run-start'); tap('계속', False); inject(300, 6)
        data = snapshot('before-location-loss')
        active = next(r for r in data['running_sessions'] if r['status'] == 'running')
        state['loss_run_id'] = active['id']
        adb('shell', 'settings', 'put', 'secure', 'location_mode', '0')
        time.sleep(7)
        data = snapshot('location-loss')
        interrupted = next(r for r in data['running_sessions'] if r['id'] == active['id'])
        assert interrupted['status'] == 'interrupted', interrupted
        capture('location-loss')
        adb('shell', 'settings', 'put', 'secure', 'location_mode', '3')
        tap('run-finish'); tap('종료·저장', False)
        print('Disabled GPS blocks start; service loss interrupts and preserves the run', flush=True)
    elif phase == 6:
        # Only IDs created by this scenario are removed; never clear app data.
        ids = state['old_ids'] + [state['run_id'], state['loss_run_id']]
        for run_id in ids:
            adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'runningart:///runs/' + run_id, APP)
            time.sleep(1); tap('run-delete'); tap('삭제', False)
        after = snapshot('cleaned')
        assert not any(r['id'] in ids for r in after['running_sessions'])
        assert not any(p['run_id'] in ids for p in after['running_points'])
        before = json.loads((OUT / 'final-build-before/data.json').read_text(encoding='utf8'))
        assert before['saved_courses'] == after['saved_courses']
        assert before['storage_test_notes'] == after['storage_test_notes']
        capture('cleaned-list')
        print('Deletion removes only QA records and their GPS points; existing data preserved', flush=True)
    elif phase == 7:
        # Follow-up manual system-permission flow: revoke background permission,
        # start from the app, select Allow all the time in Settings and return.
        permission_data = snapshot('permission-flow-running')
        active = [r for r in permission_data['running_sessions'] if r['status'] == 'running']
        assert len(active) == 1
        state['permission_run_id'] = active[0]['id']
        returned = ET.parse(OUT / 'background-permission-return.xml')
        assert any(n.get('resource-id') == 'run-status' and n.get('text') == '러닝 중' for n in returned.iter('node'))
        tap('run-finish'); tap('종료·저장', False)
        adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'runningart:///runs/' + active[0]['id'], APP)
        time.sleep(1); tap('run-delete'); tap('삭제', False)
        after = snapshot('cleaned')
        assert not after['running_sessions'] and not after['running_points']
        capture('cleaned-list')
        print('Background permission Settings flow returns to running; QA record removed', flush=True)
    else:
        print('All scenario phases finished'); return
    state['phase'] = phase + 1
    phase_file.write_text(json.dumps(state, indent=2))
    print(json.dumps(state), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['dump', 'tap', 'shot', 'db', 'inject', 'settings', 'scenario'])
    parser.add_argument('value', nargs='?', default='screen')
    parser.add_argument('--start', type=int, default=0)
    parser.add_argument('--count', type=int, default=10)
    args = parser.parse_args()
    if args.command == 'scenario':
        scenario()
        return
    if args.command == 'dump':
        for node in dump(args.value).iter('node'):
            a = node.attrib
            if a.get('text') or a.get('resource-id') or a.get('content-desc'):
                print(a.get('resource-id', ''), a.get('text', ''), a.get('content-desc', ''), a.get('bounds', ''))
    elif args.command == 'tap':
        nodes = [n for n in dump().iter('node') if args.value in (n.get('resource-id'), n.get('text'), n.get('content-desc'))]
        if len(nodes) != 1:
            raise RuntimeError(f'Expected one visible control: {args.value}; found {len(nodes)}')
        x1, y1, x2, y2 = map(int, re.findall(r'\d+', nodes[0].get('bounds')))
        adb('shell', 'input', 'tap', str((x1 + x2) // 2), str((y1 + y2) // 2))
    elif args.command == 'shot':
        target = OUT / (label(args.value) + '.png')
        target.write_bytes(adb('exec-out', 'screencap', '-p'))
        print(target)
    elif args.command == 'db':
        folder = OUT / label(args.value)
        folder.mkdir(exist_ok=True)
        for suffix in ('', '-wal', '-shm'):
            data = adb('exec-out', 'cat', f'/data/user/0/{APP}/files/SQLite/running-art.db{suffix}', check=False)
            if data:
                (folder / ('running-art.db' + suffix)).write_bytes(data)
        connection = sqlite3.connect(folder / 'running-art.db')
        connection.row_factory = sqlite3.Row
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        report = {name: [dict(row) for row in connection.execute('SELECT * FROM ' + name)]
                  for name in ['storage_test_notes', 'saved_courses', 'running_sessions', 'running_points'] if name in tables}
        connection.close()
        (folder / 'data.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
        print(json.dumps({name: len(rows) for name, rows in report.items()}))
        for row in report.get('running_sessions', []):
            print(json.dumps(row, ensure_ascii=False))
    elif args.command == 'inject':
        if not 1 <= args.count <= 25:
            raise ValueError('Each injection batch must be 1–25 points')
        for i in range(args.start, args.start + args.count):
            adb('emu', 'geo', 'fix', f'{127 + i * 0.00007:.7f}', '37.0000000', '0', '10')
            time.sleep(2)
        print(f'Injected synthetic fixes {args.start} through {args.start + args.count - 1}')
    elif args.command == 'settings':
        report = {}
        for name, scope in [('airplane_mode_on', 'global'), ('wifi_on', 'global'), ('mobile_data', 'global'), ('location_mode', 'secure')]:
            report[name] = adb('shell', 'settings', 'get', scope, name).decode().strip()
        report['captured_at'] = time.strftime('%Y-%m-%dT%H:%M:%S%z')
        (OUT / (label(args.value) + '.json')).write_text(json.dumps(report, indent=2), encoding='utf8')
        print(json.dumps(report))


if __name__ == '__main__':
    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    main()
