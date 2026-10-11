"""Isolated API 36 backup/process recovery evidence. Never targets a phone.

Use the bundled Python runtime, from the mobile root. Raw artifacts stay ignored.
SQLite queries are read-only and do not stop the app or its GPS service.
"""
import argparse
import json
import pathlib
import re
import shlex
import subprocess
import time
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / '.cache/gps-recovery-20261011'
ADB = ROOT / '.tools/android-sdk/platform-tools/adb.exe'
SERIAL = 'emulator-5562'
APP = 'com.runningart.mobile.dev'
DB = f'/data/user/0/{APP}/files/SQLite/running-art.db'


def adb(*args, check=True, timeout=45):
    result = subprocess.run([str(ADB), '-s', SERIAL, *args], capture_output=True, timeout=timeout)
    if check and result.returncode:
        raise RuntimeError(result.stderr.decode(errors='replace') + result.stdout.decode(errors='replace'))
    return result.stdout


def shell(*args, **kwargs):
    return adb('shell', shlex.join(args), **kwargs)


def label(value):
    if not re.fullmatch(r'[a-zA-Z0-9_-]+', value):
        raise ValueError('Invalid evidence label')
    return value


def save(name, data):
    (OUT / name).write_bytes(data if isinstance(data, bytes) else data.encode('utf8'))


def capture(name):
    for attempt in range(3):
        result = shell('uiautomator', 'runtest', '/data/local/tmp/running-ui-dump.jar',
                       '/system/framework/android.test.base.jar', '-c', 'RunningUiDump').decode()
        if 'OK (1 test)' in result:
            break
        if 'No fresh UI hierarchy' not in result or attempt == 2:
            raise RuntimeError(result)
        time.sleep(1)
    raw = shell('cat', '/data/local/tmp/running-qa.xml')
    save(label(name) + '.xml', raw)
    save(label(name) + '.png', adb('exec-out', 'screencap', '-p'))
    return ET.fromstring(raw)


def tap(key):
    for _ in range(8):
        root = capture('current')
        matches = [n for n in root.iter('node') if key in (n.get('resource-id'), n.get('text'), n.get('content-desc'))]
        if matches:
            node = matches[0]
            x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds')))
            if node.get('enabled') == 'true' and x2 > x1 and y2-y1 > 20 and 65 <= y1 < y2 <= 2340:
                shell('input', 'tap', str((x1+x2)//2), str((y1+y2)//2))
                time.sleep(.4)
                return
            if node.get('enabled') != 'true':
                time.sleep(1)
                continue
        shell('input', 'swipe', '1040', '1900', '1040', '750', '350')
        time.sleep(0.5)
    raise RuntimeError('Control not interactable: ' + key)


def query(sql):
    return json.loads(shell('sqlite3', '-json', DB, sql).decode() or '[]')


def snapshot(name):
    report = {
        'hostAt': time.time(), 'deviceAt': shell('date', '+%s').decode().strip(),
        'pid': shell('pidof', APP, check=False).decode().strip(),
        'runs': query('SELECT id,status,active_ms,checkpoint_at,point_count,rejected_count,last_timestamp,segment,reason FROM running_sessions ORDER BY started_at'),
        'points': query('SELECT run_id,sequence,segment,timestamp,latitude,longitude,accuracy FROM running_points ORDER BY run_id,sequence'),
    }
    services = shell('dumpsys', 'activity', 'services', APP).decode()
    report['locationService'] = bool(re.search(r'^  \* ServiceRecord\{[^\n]*com\.runningart\.mobile\.dev/expo\.modules\.location\.services\.LocationTaskService', services, re.M))
    save(label(name) + '-services.txt', services)
    save(label(name) + '-notifications.txt', shell('dumpsys', 'notification', '--noredact'))
    save(label(name) + '-exit.txt', shell('dumpsys', 'activity', 'exit-info', APP))
    save(label(name) + '.json', json.dumps(report, indent=2, ensure_ascii=False))
    print(json.dumps({k: v for k, v in report.items() if k != 'points'}, ensure_ascii=False))
    return report


def inject(start, count):
    for i in range(start, start + count):
        adb('emu', 'geo', 'fix', f'{127+i*0.00005:.7f}', '37.0000000', '0', '10')
        time.sleep(2)


def verify():
    """Only on the isolated AVD, after installing the source-built release."""
    setup()
    tree = capture('source-initial')
    if any(n.get('resource-id') == 'run-finish' for n in tree.iter('node')):
        tap('run-finish'); tap('종료·저장'); time.sleep(2)
        setup()
    initial = snapshot('source-initial')
    assert not initial['locationService'], 'Service exists before verification'
    tap('run-start'); tap('계속'); inject(200, 6)
    before = snapshot('source-before-backup')
    assert before['runs'][-1]['status'] == 'running' and before['locationService']
    shell('input', 'keyevent', '3')
    backup = shell('bmgr', 'backupnow', APP, timeout=120)
    save('source-backup.txt', backup)
    assert b'Backup is not allowed' in backup, backup.decode()
    inject(206, 6)
    after = snapshot('source-after-backup')
    assert before['pid'] == after['pid']
    assert after['runs'][-1]['status'] == 'running'
    assert after['runs'][-1]['point_count'] > before['runs'][-1]['point_count']
    setup(); tap('run-pause'); time.sleep(2)
    paused = snapshot('source-paused')
    assert paused['runs'][-1]['status'] == 'paused' and not paused['locationService']
    inject(212, 3)
    later = snapshot('source-paused-later')
    assert later['runs'][-1]['point_count'] == paused['runs'][-1]['point_count']
    tap('run-start'); tap('계속'); inject(215, 5)
    resumed = snapshot('source-resumed')
    assert resumed['runs'][-1]['status'] == 'running' and resumed['locationService']
    shell('input', 'keyevent', '3')
    shell('kill', '-9', resumed['pid'])
    killed = snapshot('source-killed')
    inject(220, 5)
    setup(); time.sleep(3)
    restored = snapshot('source-restored')
    assert restored['runs'][-1]['status'] == 'interrupted' and not restored['locationService']
    for field in ['active_ms', 'point_count', 'last_timestamp']:
        assert restored['runs'][-1][field] == killed['runs'][-1][field], field
    assert restored['pid'] != resumed['pid']
    # Repeat rapid UI transitions to exercise binding/unregister timing.
    for i in range(3):
        tap('run-start'); tap('계속'); time.sleep(.2); tap('run-pause'); time.sleep(2)
        cycle = snapshot('source-cycle-' + str(i))
        assert not cycle['locationService'] and cycle['runs'][-1]['status'] == 'paused'
    tap('run-start'); tap('계속'); inject(230, 5)
    tap('run-finish'); tap('종료·저장'); time.sleep(3)
    final = snapshot('source-finished')
    assert final['runs'][-1]['status'] == 'completed' and not final['locationService']
    assert all(row == final['runs'][i] for i, row in enumerate(initial['runs']))
    save('source-pass.json', json.dumps({'passed': True, 'runId': final['runs'][-1]['id'],
         'at': time.time(), 'apkSha256': shell('sha256sum', shell('pm', 'path', APP).decode().strip().removeprefix('package:')).decode().split()[0]}))
    print('PASS: backup exclusion, pause/resume, process recovery, repeated cleanup, prior records preserved', flush=True)


def setup():
    if shell('getprop', 'sys.boot_completed').strip() != b'1':
        raise RuntimeError('Android is still booting')
    for permission in ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'ACCESS_BACKGROUND_LOCATION', 'POST_NOTIFICATIONS']:
        shell('pm', 'grant', APP, 'android.permission.' + permission)
    shell('settings', 'put', 'secure', 'location_mode', '3')
    shell('settings', 'put', 'system', 'screen_off_timeout', '1800000')
    adb('push', str(ROOT / '.cache/running-qa/ui-dump.jar'), '/data/local/tmp/running-ui-dump.jar')
    shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'runningart://run', APP)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['setup', 'capture', 'tap', 'snapshot', 'inject', 'backup', 'kill', 'verify'])
    parser.add_argument('value', nargs='?', default='current')
    parser.add_argument('--count', type=int, default=10)
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    if adb('emu', 'avd', 'name').decode().splitlines()[0].strip() != 'RunningArt_Recovery_QA':
        raise RuntimeError('Wrong AVD; refusing all actions')
    if args.action == 'setup':
        setup()
    elif args.action == 'verify':
        verify()
    elif args.action == 'capture':
        root = capture(args.value)
        print(json.dumps([{'id': n.get('resource-id'), 'text': n.get('text'), 'description': n.get('content-desc')}
                          for n in root.iter('node') if n.get('text') or n.get('content-desc') or n.get('resource-id')], ensure_ascii=False))
    elif args.action == 'tap':
        tap(args.value)
    elif args.action == 'snapshot':
        snapshot(args.value)
    elif args.action == 'inject':
        if not 1 <= args.count <= 25:
            raise ValueError('Use 1..25 samples per invocation')
        start = int(args.value)
        inject(start, args.count)
        print('Injected', args.count, 'synthetic emulator fixes')
    elif args.action == 'backup':
        shell('bmgr', 'enable', 'true')
        selected = shell('bmgr', 'transport', 'com.android.localtransport/.LocalTransport')
        if b'Selected transport' not in selected:
            raise RuntimeError(selected.decode())
        shell('settings', 'put', 'secure', 'backup_local_transport_parameters', 'is_encrypted=true')
        result = shell('bmgr', 'backupnow', APP, timeout=120)
        save(label(args.value) + '-backup.txt', result)
        save(label(args.value) + '-logcat.txt', shell('logcat', '-d', '-v', 'threadtime', '-t', '2500'))
        print(result.decode())
    elif args.action == 'kill':
        pid = shell('pidof', APP).decode().strip()
        if not re.fullmatch(r'\d+', pid):
            raise RuntimeError('Expected exactly one app process')
        shell('kill', '-9', pid)
        print('Killed this test app process', pid)


if __name__ == '__main__':
    main()
