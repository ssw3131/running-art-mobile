"""Reconcile the real 2026-10-11 SM-S942N trial; never equate evidence checks with a product pass."""
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import statistics
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / '.cache/phone-lock-battery-20261011'
KST = timezone(timedelta(hours=9))


def read(name):
    return json.loads((RAW / (name + '.json')).read_text(encoding='utf-8-sig'))


def stamp(ms):
    return datetime.fromtimestamp(ms / 1000, KST).isoformat(timespec='milliseconds')


def text(name):
    return ' / '.join(n.get('text', '') for n in ET.parse(RAW / (name + '.xml')).iter('node'))


before, endpoint = read('locked-awaiting-unplug'), read('reconnect')
assert before['wakefulness'][0] == 'Dozing' and before['locationTaskService']
assert before['battery']['level'] == '94' and endpoint['battery']['level'] == '94'
assert endpoint['wakefulness'][0] == 'Awake' and endpoint['locationTaskService']
assert before['batterySaver'] == endpoint['batterySaver'] == '0'
assert before['stayAwakeWhilePlugged'] == endpoint['stayAwakeWhilePlugged'] == '15'
phase = read('phase')
assert read('charging-confirmation')['chargingStartApproxKst'] == '2026-10-11T21:47:00+09:00'
unplug = int(datetime.fromisoformat(phase['unplugConfirmedAtKst']).timestamp() * 1000)
run = read('gps-test-run')
assert run['status'] == 'completed' and run['started_at'] >= read('gps-test-start')['since']
points = run['pointTiming']
assert len(points) == run['point_count'] == 155
assert all(a['sequence'] < b['sequence'] and a['timestamp'] < b['timestamp'] for a, b in zip(points, points[1:]))
gaps = [(b['timestamp'] - a['timestamp']) / 1000 for a, b in zip(points, points[1:])]
assert points[-1]['timestamp'] > unplug + 30 * 60 * 1000
assert points[-1]['timestamp'] < endpoint['hostEpochMs'] - 40 * 60 * 1000
assert '기록 중단' in text('run-return') and '앱이 다시 시작되어' in text('run-return')
assert '00:40:10' in text('run-return')
exits = (RAW / 'reconnect-app-exit-info.txt').read_text(encoding='utf-8')
assert 'timestamp=2026-10-11 21:04:23.815' in exits and 'reason=2 (SIGNALED)' in exits and 'status=9' in exits
events = (RAW / 'app-process-events.txt').read_text(encoding='utf-8')
assert '21:04:23.678' in events and 'full_backup_package: com.runningart.mobile.dev' in events
assert '21:04:24.892' in events and 'full_backup_success: com.runningart.mobile.dev' in events
assert '21:05:56.447' in events and 'am_proc_start:' in events
history = (RAW / 'reconnect-battery-history.txt').read_text(encoding='utf-8')
assert 'RESET:TIME: 2026-10-11-21-47-27-660' in history
assert '21:47:27.660 093 status=discharging health=good plug=none' in history
assert '21:47:30.817 093 status=charging plug=ac' in history
assert read('baseline') == read('final-data')
assert read('account-before') == read('final-account')
assert '동기화 켜짐 · 전송 대기 0건' in text('sync-after-delete')
assert read('test-run-deleted')['id'] == run['id']
assert read('cleanup-device-files')['remaining'] == [] and read('cleanup-device-files')['helperRemoved']
assert 'INSTRUMENTATION_CODE: 0' in (RAW / 'cleanup-backups.txt').read_text(encoding='utf-8')
final = read('final-state')
assert final['apkSha256'] == read('preparation-device')['apkSha256']
assert final['network'] == read('preparation-device')['network'] and final['servicesNone']
assert read('final-location-settings') == json.loads((ROOT / '.cache/phone-followup-20261011/gps-settings-after.json').read_text(encoding='utf-8'))
report = {
    'date': '2026-10-11', 'device': 'SM-S942N / Android 16',
    'outcome': 'partial; sampling beyond 30 minutes observed; interrupted before return',
    'apkSha256': final['apkSha256'], 'productChanged': False,
    'checks': ['locked-start', 'unlocked-reconnect', 'stored-point-timing', 'interruption-ui-and-process-exit',
               'automatic-backup-and-process-restart-events', 'battery-history-endpoint-with-limits',
               'original-data-and-account', 'test-delete-and-sync', 'helpers-and-backup-cleanup',
               'apk-network-location-and-final-service-state'],
    'timeline': {'runStartedAtKst': stamp(run['started_at']), 'lockedAtKst': before['observedAtKst'],
                 'unplugConfirmedAtKst': phase['unplugConfirmedAtKst'],
                 'lastStoredPointAtKst': stamp(points[-1]['timestamp']),
                 'lastProcessedFixAtKst': stamp(run['last_timestamp']),
                 'processExitAtKst': '2026-10-11T21:04:23.815+09:00',
                 'headlessProcessRestartAtKst': '2026-10-11T21:05:56.447+09:00',
                 'reconnectObservedAtKst': endpoint['observedAtKst'],
                 'savedAtKst': stamp(run['ended_at']), 'cleanupCompletedAtKst': phase['cleanupCompletedAtKst']},
    'gps': {'activeMs': run['active_ms'], 'storedPoints': len(points), 'rejectedFixes': run['rejected_count'],
            'storedSegments': len(set(p['segment'] for p in points)),
            'storedGapMedianSeconds': statistics.median(gaps), 'storedGapMaxSeconds': max(gaps),
            'pointsWithinFirst30MinutesAfterUnplugConfirmation': sum(unplug <= p['timestamp'] <= unplug + 1800000 for p in points),
            'lastStoredPointAfterUnplugConfirmationSeconds': (points[-1]['timestamp'] - unplug) / 1000,
            'lastStoredPointToReconnectSeconds': (endpoint['hostEpochMs'] - points[-1]['timestamp']) / 1000,
            'continuousUntilReturn': False, 'fieldAccuracyValidated': False},
    'battery': {'lastMeasuredBeforeUnplugPercent': 94,
                'historyUnpoweredAtKst': '2026-10-11T21:47:27.660+09:00', 'historyUnpoweredPercent': 93,
                'historyChargingAtKst': '2026-10-11T21:47:30.817+09:00',
                'firstAdbReconnectPercent': 94, 'observedPercentagePointDifference': 1,
                'userConfirmedChargingStartApproxKst': '2026-10-11T21:47:00+09:00',
                'approxWholeDevicePercentagePointDecrease': 1,
                'exactUninterruptedUnpluggedDurationEstablished': False,
                'continuousGpsBatteryBenchmarkPassed': False,
                'limits': ['History starts at 21:47; earlier charging/screen continuity cannot be reconstructed.',
                           'Latest user correction places charging at the 21:47 reconnect; this supersedes the earlier ambiguous answer.',
                           '94 was sampled before physical unplug; 93 is a later unpowered snapshot.',
                           'GPS recording stopped during the trial; these endpoints are not continuous-GPS energy usage.']},
    'preservation': {'originalDataHashesMatch': True, 'accountIdentityMatch': True,
                     'syncEnabledPendingZero': True, 'testRunDeleted': True, 'deviceHelpersAndBackupRemoved': True,
                     'finalServicesNone': True, 'locationAndNetworkPreserved': True},
    'followup': ['Reproduce OS backup/process exit and reconcile interrupted recording with surviving service.',
                 'Repeat a controlled unplugged battery trial after addressing recording continuity.',
                 'Outdoor movement, course guidance, battery saver and reboot remain separate.'],
}
(ROOT / 'docs/quality/phone-lock-battery-20261011.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('PASS: 10 evidence reconciliation groups; PRODUCT RESULT: interrupted, continuous run not passed')
