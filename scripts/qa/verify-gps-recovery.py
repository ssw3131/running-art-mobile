"""Offline audit of recorded recovery evidence; never contacts a device."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
EMU = ROOT / '.cache/gps-recovery-20261011'
PHONE = ROOT / '.cache/gps-recovery-phone-20261011'


def read(folder, name):
    return json.loads((folder / (name + '.json')).read_text(encoding='utf8'))


def state_text(name, key):
    tree = ET.parse(PHONE / (name + '.xml'))
    return next(n.get('text') for n in tree.iter('node') if n.get('resource-id') == key)


def audit(final=False):
    passed = read(EMU, 'source-pass')
    apk = ROOT / 'build/install/running-art-0.1.0-20261011-gps-recovery.apk'
    digest = hashlib.sha256(apk.read_bytes()).hexdigest()
    assert passed['passed'] and passed['apkSha256'] == digest
    assert read(PHONE, 'installed')['apkSha256'] == digest
    assert 'tests 403' in (EMU / 'tests-final.log').read_text(encoding='utf8')
    assert 'fail 0' in (EMU / 'tests-final.log').read_text(encoding='utf8')
    for name in ['baseline-return', 'baseline-finished']:
        assert read(EMU, name)['locationService'], 'Original bug was not reproduced'
    before, after = [read(EMU, n) for n in ['source-before-backup', 'source-after-backup']]
    assert before['pid'] == after['pid']
    assert after['runs'][-1]['point_count'] > before['runs'][-1]['point_count']
    assert 'Backup is not allowed' in (EMU / 'source-backup.txt').read_text()
    for name in ['source-initial', 'source-paused', 'source-paused-later', 'source-restored',
                 'source-cycle-0', 'source-cycle-1', 'source-cycle-2', 'source-finished']:
        assert not read(EMU, name)['locationService'], name
        notifications = (EMU / (name + '-notifications.txt')).read_text(encoding='utf8')
        assert not re.search(r'NotificationRecord\([^\n]*pkg=com\.runningart\.mobile\.dev[^\n]*running-art-gps-v1', notifications), name
    killed, restored = [read(EMU, n)['runs'][-1] for n in ['source-killed', 'source-restored']]
    assert restored['status'] == 'interrupted'
    for field in ['active_ms', 'point_count', 'last_timestamp']:
        assert killed[field] == restored[field], field
    initial, finished = [read(EMU, n)['runs'] for n in ['source-initial', 'source-finished']]
    assert initial == finished[:len(initial)]

    baseline = read(PHONE, 'baseline')
    for name in ['after-install', 'before-lock-data']:
        assert read(PHONE, name) == baseline, name
    assert read(PHONE, 'baseline-account') == read(PHONE, 'after-install-account')
    assert read(PHONE, 'baseline-device')['network'] == read(PHONE, 'installed')['network']
    assert state_text('before-lock-sync', 'sync-status') == '동기화 켜짐 · 전송 대기 0건'
    assert state_text('smoke-restored', 'run-status') == '기록 중단'
    assert state_text('cold-restored', 'run-status') == '기록 중단'
    assert read(PHONE, 'smoke-before-backup')['pid'] == read(PHONE, 'smoke-after-backup')['pid']
    assert 'Backup is not allowed' in (PHONE / 'smoke-backup.txt').read_text()
    for name in ['smoke-paused', 'smoke-restored', 'smoke-finished', 'cold-finished']:
        item = read(PHONE, name)
        assert not item['locationService'] and not item['recordingNotification'], name
    assert read(PHONE, 'cold-resumed')['locationService']
    for name in ['smoke', 'cold']:
        runs = read(PHONE, name + '-timing')
        assert len(runs) == 1 and runs[0]['status'] == 'completed'
        assert read(PHONE, name + '-deleted')['id'] == runs[0]['id']
    cold = read(PHONE, 'cold-timing')[0]
    assert cold['last_timestamp'] > cold['resumed_at'], 'No real fix after cold resume'
    report = {'complete': False, 'apkSha256': digest, 'tests': 403,
              'emulator': {'backupExcluded': True, 'recoveryPreservesCheckpoint': True,
                           'stopSnapshotsWithoutServiceOrNotification': 8, 'resumePauseCycles': 3,
                           'priorSyntheticRecordsPreserved': True},
              'phone': {'installedAtKst': '2026-10-11T23:30:32+09:00', 'backupExcluded': True,
                        'shortRecordingTestsCleaned': 2, 'originalCounts': [3, 2, 209, 1],
                        'originalContentAccountAndSyncPreservedBeforeLock': True,
                        'longLock': {'complete': False, 'minimumUnpluggedMinutes': 60}}}
    receipt_path = PHONE / 'lock60-user-confirmation.json'
    if receipt_path.exists():
        pending = read(PHONE, 'lock60-user-confirmation')
        report['phone']['longLock'].update({'startedAtKst': pending['unplugConfirmedAtKst'],
                                         'earliestReturnAtKst': pending['minimumEndAtKst']})
    if final:
        # Receipt records user-confirmed physical unplug and pre-charge battery.
        receipt = read(PHONE, 'lock60-user-confirmation')
        assert receipt['allChargingDisconnected'] is True and receipt['keptLocked'] is True
        battery_after = receipt['batteryBeforeReconnectingPercent']
        assert type(battery_after) is int and 0 <= battery_after <= 100, 'Pre-charge battery confirmation is missing or invalid'
        assert receipt['minimumUnpluggedMinutesConfirmed'] >= 60
        assert receipt['minimumEndEpochMs'] - receipt['unplugConfirmedEpochMs'] >= 3600000
        assert receipt['reconnectedEpochMs'] == read(PHONE, 'lock60-reconnect-observed')['epochMs']
        assert receipt['reconnectedEpochMs'] - receipt['unplugConfirmedEpochMs'] >= 3600000
        runs = read(PHONE, 'lock60-timing')
        assert len(runs) == 1
        run = runs[0]
        assert run['status'] == 'completed' and run['reason'] is None
        assert run['active_ms'] >= 3600000
        points = run['pointTiming']
        assert len(points) == run['point_count'] and len(points) >= 2
        assert points[0]['timestamp'] <= receipt['unplugConfirmedEpochMs']
        assert points[-1]['timestamp'] >= receipt['reconnectedEpochMs'] - 60000
        gaps = [b['timestamp'] - a['timestamp'] for a, b in zip(points, points[1:])]
        # Minute-scale data holes must be investigated, not silently passed.
        assert min(gaps) > 0 and max(gaps) < 60000, 'Invalid timing or long GPS gap requires investigation'
        assert read(PHONE, 'lock60-locked')['pid'] == read(PHONE, 'lock60-return')['pid']
        assert read(PHONE, 'lock60-return')['locationService']
        assert read(PHONE, 'lock60-return')['recordingNotification']
        stopped = read(PHONE, 'lock60-finished')
        assert not stopped['locationService'] and not stopped['recordingNotification']
        assert read(PHONE, 'lock60-deleted')['id'] == run['id']
        assert read(PHONE, 'final-data') == baseline
        assert read(PHONE, 'final-data-after-cleanup') == baseline
        assert read(PHONE, 'final-account') == read(PHONE, 'baseline-account')
        assert state_text('final-sync', 'sync-status') == '동기화 켜짐 · 전송 대기 0건'
        assert read(PHONE, 'final-device')['servicesNone']
        assert read(PHONE, 'final-device')['apkSha256'] == digest
        assert read(PHONE, 'final-device')['network'] == read(PHONE, 'baseline-device')['network']
        cleanup = read(PHONE, 'final-cleanup')
        assert cleanup['internalBackupsRemoved'] and cleanup['helperPackageRemoved'] and cleanup['servicesNone']
        assert len(cleanup['temporaryFilesRemoved']) == 4
        report['phone']['longLock'] = {'complete': True,
            'confirmedMinimumUnpluggedMinutes': receipt['minimumUnpluggedMinutesConfirmed'],
            'adbReturnElapsedMinutes': round((receipt['reconnectedEpochMs']-receipt['unplugConfirmedEpochMs'])/60000, 2),
            'activeSeconds': run['active_ms']/1000, 'savedPoints': len(points),
            'maxPointGapSeconds': max(gaps)/1000,
            'batteryBeforePercent': int(read(PHONE, 'lock60-locked')['battery']['level']),
            'batteryAfterBeforeChargingPercent': receipt['batteryBeforeReconnectingPercent'],
            'timingBasis': '60-minute timer followed by user confirmation of continuous lock/no charging; ADB return includes connection troubleshooting',
            'physicalReconnectTimeKnown': False,
            'batteryScope': 'whole device, indoor stationary, starts at full charge; not app-only consumption'}
        report['phone']['originalContentAccountAndSyncPreservedAfterLock'] = True
        report['complete'] = True
    output = ROOT / 'docs/quality/gps-process-recovery-20261011.json'
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--final', action='store_true')
    audit(parser.parse_args().final)
