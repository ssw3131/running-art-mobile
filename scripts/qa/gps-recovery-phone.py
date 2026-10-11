"""Explicit SM-S942N recovery follow-up; hashes/timing only, no GPS export.

Never run instrumentation during a live measurement: recent-runs/inspect are
allowed only after the UI has finished the recording and services are stopped.
"""
from datetime import datetime, timezone, timedelta
import argparse
import json
import pathlib
import re
import runpy
import subprocess
import time
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[2]
s = runpy.run_path(str(ROOT / 'scripts/qa/phone-followup.py'), run_name='qa')
q = s['q']
q.OUT = ROOT / '.cache/gps-recovery-phone-20261011'
q.OUT.mkdir(exist_ok=True)


def live_ui(name='current', screenshot=False):
    # The running clock never becomes idle; read without a ten-second idle wait.
    for attempt in range(3):
        result = q.adb('shell', 'uiautomator', 'runtest', '/data/local/tmp/running-ui-dump.jar',
                       '/system/framework/android.test.base.jar', '-c', 'RunningUiDump')
        if b'OK (1 test)' in result:
            break
        if b'No fresh UI hierarchy' not in result or attempt == 2:
            raise RuntimeError(result.decode(errors='replace'))
        time.sleep(1)
    raw = q.adb('exec-out', 'cat', '/data/local/tmp/running-qa.xml')
    q.evidence(name, '.xml').write_bytes(raw)
    if screenshot:
        q.evidence(name, '.png').write_bytes(q.adb('exec-out', 'screencap', '-p'))
    return ET.fromstring(raw)


s['ui'].__globals__['ui'] = live_ui
s['ui'] = live_ui


def stamp():
    return datetime.now(timezone(timedelta(hours=9))).isoformat(timespec='seconds')


def services_none():
    text = q.adb('shell', 'dumpsys', 'activity', 'services', q.APP).decode()
    return not re.search(r'^  \* ServiceRecord\{[^\n]*com\.runningart\.mobile\.dev/', text, re.M)


def observe(name):
    battery = {}
    for line in q.adb('shell', 'dumpsys', 'battery').decode().splitlines():
        match = re.match(r'\s*(AC powered|USB powered|Wireless powered|Dock powered|status|level|scale|temperature|Charge counter):\s*(.+)', line)
        if match:
            battery[match[1]] = match[2]
    power = q.adb('shell', 'dumpsys', 'power').decode()
    services = q.adb('shell', 'dumpsys', 'activity', 'services', q.APP).decode()
    notifications = q.adb('shell', 'dumpsys', 'notification', '--noredact').decode()
    process = subprocess.run([str(q.ADB), '-s', q.SERIAL, 'shell', 'pidof', q.APP],
                             capture_output=True, timeout=40)
    assert process.returncode in [0, 1] and not process.stderr.strip(), 'Could not observe app process'
    if name == 'lock60-return':
        q.evidence(name + '-exit', '.txt').write_bytes(q.adb('shell', 'dumpsys', 'activity', 'exit-info', q.APP))
    # Keep raw system details local; only print this app's status and battery.
    q.evidence(name + '-services', '.txt').write_text(services, encoding='utf8')
    result = {'atKst': stamp(), 'epochMs': int(time.time()*1000), 'battery': battery,
              'pid': process.stdout.decode().strip(),
              'wakefulness': re.findall(r'mWakefulness=(\w+)', power),
              'locationService': bool(re.search(r'^  \* ServiceRecord\{[^\n]*com\.runningart\.mobile\.dev/expo\.modules\.location\.services\.LocationTaskService', services, re.M)),
              'recordingNotification': bool(re.search(r'NotificationRecord\([^\n]*pkg=com\.runningart\.mobile\.dev[^\n]*running-art-gps-v1', notifications)),
              'batterySaver': q.adb('shell', 'settings', 'get', 'global', 'low_power').decode().strip()}
    s['save'](name, result)
    print(json.dumps(result, ensure_ascii=False))
    return result


def prepare():
    assert services_none(), 'Existing app service; do not interrupt it'
    assert not q.evidence('baseline', '.json').exists(), 'Baseline already exists'
    q.adb('push', str(ROOT / '.cache/running-qa/ui-dump.jar'), '/data/local/tmp/running-ui-dump.jar')
    s['page']('run')
    assert s['find']('run-status', s['ui']('baseline-no-active-run')) is None, 'Existing unfinished run'
    s['state']('baseline-device')
    result = subprocess.run([str(q.ADB), '-s', q.SERIAL, 'install', '-r', '--no-streaming',
                             str(ROOT / '.cache/phone-validation/helper/phone-validation.apk')],
                            capture_output=True, timeout=180)
    assert result.returncode == 0, result.stderr.decode(errors='replace')
    s['helper']('inspect', 'baseline')
    s['helper']('backup', 'baseline-backup')
    s['account']('baseline-account')
    s['page']('account-sync')
    s['capture']('baseline-sync')


def start(name):
    assert q.evidence('baseline', '.json').exists() and q.evidence('baseline-backup', '.txt').exists()
    assert not q.evidence(name + '-start', '.json').exists(), 'Do not duplicate this run'
    assert services_none(), 'Existing app service'
    s['page']('run')
    assert s['find']('run-status', s['ui']('guard-' + name)) is None, 'Existing unfinished run'
    s['save'](name + '-start', {'since': int(time.time()*1000), 'atKst': stamp()})
    resume()
    time.sleep(12)
    tree = s['ui'](name + '-started', True)
    assert s['find']('run-status', tree).get('text') == '러닝 중'
    assert s['find']('run-error', tree) is None
    assert observe(name + '-running')['locationService']


def resume():
    # Scrolling and the first touch may race layout on a physical phone.
    # Retry opening the confirmation, but never confirm an unseen dialog.
    for attempt in range(3):
        s['tap']('run-start')
        tree = live_ui('resume-dialog')
        if s['find']('계속', tree) is not None:
            s['tap']('계속')
            return
        time.sleep(1)
    raise RuntimeError('Resume confirmation did not open')


def lock(name):
    s['page']('run')
    tree = s['ui'](name + '-before-lock', True)
    assert s['find']('run-status', tree).get('text') == '러닝 중'
    assert observe(name + '-before-lock')['locationService']
    q.adb('shell', 'input', 'keyevent', '223')
    time.sleep(3)
    result = observe(name + '-locked')
    assert result['locationService'] and 'Awake' not in result['wakefulness']
    s['save']('phase', {'state': 'locked-awaiting-physical-unplug', 'name': name, 'atKst': stamp(),
                       'minimumUnpluggedMinutes': 60, 'completed': False})


def recent(name):
    assert services_none(), 'Read timing only after normal finish and service cleanup'
    since = json.loads(q.evidence(name + '-start', '.json').read_text())['since']
    raw = q.adb('shell', 'am', 'instrument', '-w', '-e', 'action', 'recent-runs', '-e', 'since', str(since),
                'com.runningart.authdigest/com.runningart.authdigest.PhoneValidation').decode()
    assert 'INSTRUMENTATION_CODE: 0' in raw, raw
    runs = json.loads(re.search(r'INSTRUMENTATION_RESULT: runs=(.*)', raw).group(1))
    s['save'](name + '-timing', runs)
    print(json.dumps([{k: v for k, v in r.items() if k != 'pointTiming'} for r in runs], ensure_ascii=False))


def backup_probe(name):
    assert 'ALLOW_BACKUP' not in q.adb('shell', 'dumpsys', 'package', q.APP).decode(), 'Original APK must not be probed'
    before = observe(name + '-before-backup')
    assert before['locationService'] and before['pid']
    result = q.adb('shell', 'bmgr', 'backupnow', q.APP).decode()
    q.evidence(name + '-backup', '.txt').write_text(result, encoding='utf8')
    assert 'Backup is not allowed' in result, result
    time.sleep(8)
    after = observe(name + '-after-backup')
    assert before['pid'] == after['pid'] and after['locationService']
    print(result, flush=True)


def delete_test(name):
    assert services_none(), 'Do not delete during recording'
    since = json.loads(q.evidence(name + '-start', '.json').read_text())['since']
    runs = json.loads(q.evidence(name + '-timing', '.json').read_text())
    assert len(runs) == 1, 'Only a single explicitly recorded test can be deleted'
    run = runs[0]
    assert run['status'] == 'completed' and run['started_at'] >= since
    assert re.fullmatch(r'[a-f0-9]{32}', run['id'])
    s['page']('runs/' + run['id']); s['tap']('run-delete'); s['tap']('삭제')
    time.sleep(2)
    s['save'](name + '-deleted', {'id': run['id'], 'atKst': stamp()})


def cleanup():
    assert services_none(), 'Never clean up during recording'
    baseline = json.loads(q.evidence('baseline', '.json').read_text(encoding='utf8'))
    final = json.loads(q.evidence('final-data', '.json').read_text(encoding='utf8'))
    assert final == baseline, 'Final content audit must pass first'
    assert q.evidence('lock60-deleted', '.json').exists(), 'Long recording must be finished and removed first'
    s['helper']('cleanup-backups', 'final-backup-cleanup')
    s['helper']('inspect', 'final-data-after-cleanup')
    preserved = json.loads(q.evidence('final-data-after-cleanup', '.json').read_text(encoding='utf8'))
    assert preserved == baseline, 'Original content changed during backup cleanup'
    result = q.adb('uninstall', 'com.runningart.authdigest').decode()
    assert result.strip() == 'Success', result
    missing = subprocess.run([str(q.ADB), '-s', q.SERIAL, 'shell', 'pm', 'path',
                              'com.runningart.authdigest'], capture_output=True, timeout=40)
    assert missing.returncode in [0, 1] and not missing.stdout.strip()
    paths = ['/data/local/tmp/running-ui-dump.jar', '/data/local/tmp/running-qa.xml',
             '/data/local/tmp/runpen-phone-ui.xml', '/data/local/tmp/runpen-install-ui.xml']
    q.adb('shell', 'rm', '-f', *paths)
    for path in paths:
        result = subprocess.run([str(q.ADB), '-s', q.SERIAL, 'shell', 'test', '-e', path],
                                capture_output=True, timeout=40)
        assert result.returncode == 1, 'Temporary helper file remains: ' + path
    assert services_none()
    s['save']('final-cleanup', {'atKst': stamp(), 'internalBackupsRemoved': True,
             'helperPackageRemoved': True, 'temporaryFilesRemoved': paths, 'servicesNone': True})


def tracked_device_online(line):
    # adb emits hexadecimal frame lengths before the first device line.
    # Empty frames can precede that line without an intervening newline.
    return re.fullmatch(r'(?:[0-9a-fA-F]{4})*' + re.escape(q.SERIAL) + r'\tdevice', line.strip()) is not None


def watch_return():
    assert q.evidence('lock60-user-confirmation', '.json').exists()
    assert not q.evidence('lock60-reconnect-observed', '.json').exists(), 'Keep the first reconnection evidence'
    print('Waiting for this phone to reconnect; no UI or recording actions', flush=True)
    tracker = subprocess.Popen([str(q.ADB), 'track-devices'], stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, text=True, encoding='utf8')
    try:
        for line in tracker.stdout:
            if not tracked_device_online(line):
                continue
            s['save']('lock60-reconnect-observed', {'epochMs': int(time.time()*1000), 'atKst': stamp()})
            assert q.adb('shell', 'getprop', 'ro.product.model').decode().strip() == 'SM-S942N'
            observe('lock60-return')
            print('Reconnection and first read-only app/battery observation saved', flush=True)
            return
        raise RuntimeError('ADB device tracker exited before reconnection')
    finally:
        tracker.terminate()
        tracker.wait(timeout=10)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['prepare', 'state', 'account', 'capture', 'open', 'tap', 'observe', 'start', 'lock', 'recent', 'inspect', 'cleanup-backups', 'backup-probe', 'delete-test', 'resume', 'cleanup', 'watch-return'])
    parser.add_argument('name', nargs='?', default='current')
    args = parser.parse_args()
    assert re.fullmatch(r'[a-z0-9/-]+|계속|종료·저장|삭제', args.name), 'Invalid argument'
    if args.action == 'watch-return':
        watch_return()
        raise SystemExit()
    assert q.adb('shell', 'getprop', 'ro.product.model').decode().strip() == 'SM-S942N'
    if args.action == 'prepare': prepare()
    elif args.action == 'observe': observe(args.name)
    elif args.action == 'start': start(args.name)
    elif args.action == 'resume': resume()
    elif args.action == 'cleanup': cleanup()
    elif args.action == 'lock': lock(args.name)
    elif args.action == 'recent': recent(args.name)
    elif args.action == 'backup-probe': backup_probe(args.name)
    elif args.action == 'delete-test': delete_test(args.name)
    elif args.action in ['inspect', 'cleanup-backups']:
        assert services_none(), 'Do not interrupt recording for instrumentation'
        s['helper'](args.action, args.name)
    elif args.action == 'open': s['page'](args.name)
    else: s[args.action](args.name)
