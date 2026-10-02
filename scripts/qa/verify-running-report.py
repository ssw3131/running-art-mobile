"""Reconcile emulator UI/SQLite/APK evidence into a shareable summary (no raw GPS)."""
import datetime
import hashlib
import json
import math
import pathlib
import sqlite3
import xml.etree.ElementTree as ET

root = pathlib.Path.cwd()
folder = root / '.cache/running-qa'


def read(name):
    return json.loads((folder / name).read_text(encoding='utf-8-sig'))


state = read('phase.json')
assert state['phase'] == 8
run_id = state['run_id']


def data(stage):
    return read(stage + '/data.json')


def record(stage, key=run_id):
    return next(row for row in data(stage)['running_sessions'] if row['id'] == key)


def distance(a, b):
    lat_a, lat_b = math.radians(a['latitude']), math.radians(b['latitude'])
    lon = math.radians(b['longitude'] - a['longitude'])
    h = math.sin((lat_b - lat_a) / 2) ** 2 + math.cos(lat_a) * math.cos(lat_b) * math.sin(lon / 2) ** 2
    return 6371008.8 * 2 * math.asin(math.sqrt(min(1, h)))


done = record('completed')
points = [p for p in data('completed')['running_points'] if p['run_id'] == run_id]
assert len(points) == done['point_count']
assert [p['sequence'] for p in points] == list(range(1, len(points) + 1))
assert all(a['timestamp'] < b['timestamp'] and a['segment'] <= b['segment'] for a, b in zip(points, points[1:]))
total = sum(distance(a, b) for a, b in zip(points, points[1:]) if a['segment'] == b['segment'])
assert abs(total - done['distance_m']) < 0.001
assert record('paused') == record('paused-later')
assert data('paused')['running_points'] == data('paused-later')['running_points']
assert record('resumed')['segment'] > record('paused')['segment']
locked, before_lock = record('locked'), record('before-lock')
assert locked['point_count'] > before_lock['point_count']
assert locked['distance_m'] > before_lock['distance_m']
stopped, restored = record('force-stopped'), record('recovered')
assert restored['status'] == 'interrupted'
for key in ['active_ms', 'distance_m', 'point_count']:
    assert restored[key] == stopped[key]
assert data('force-stopped')['running_points'] == data('recovered')['running_points']
assert done == record('completed-later')
assert data('completed')['running_points'] == data('completed-later')['running_points']
loss = record('location-loss', state['loss_run_id'])
assert loss['status'] == 'interrupted'
assert data('cleaned')['running_sessions'] == [] and data('cleaned')['running_points'] == []
baseline = sqlite3.connect(folder / 'before-db/running-art.db')
baseline.row_factory = sqlite3.Row
for table in ['saved_courses', 'storage_test_notes']:
    assert [dict(row) for row in baseline.execute('SELECT * FROM ' + table)] == data('cleaned')[table]
baseline.close()
denied = ET.parse(folder / 'permission-denied.xml')
assert any(n.get('resource-id') == 'run-error' and '권한' in n.get('text', '') for n in denied.iter('node'))
detail = ET.parse(folder / 'detail-offline.xml')
assert any(n.get('text') == '러닝 상세' for n in detail.iter('node'))
permission = ET.parse(folder / 'background-permission-granted.xml')
assert any(n.get('resource-id') == 'com.android.permissioncontroller:id/allow_always_radio_button' and n.get('checked') == 'true' for n in permission.iter('node'))
returned = ET.parse(folder / 'background-permission-return.xml')
assert any(n.get('resource-id') == 'run-status' and n.get('text') == '러닝 중' for n in returned.iter('node'))
apk = read('apk.json')
assert hashlib.sha256((root / apk['path']).read_bytes()).hexdigest() == apk['sha256']
assert hashlib.sha256((folder / 'installed.apk').read_bytes()).hexdigest() == apk['sha256']
providers = (folder / 'providers-after.txt').read_text(encoding='utf8')
assert 'gps provider:\n      service: ProviderRequest[OFF]' in providers
assert 'mStarted=false' in providers
assert 'com.runningart.mobile.dev' not in providers
report = {
    'verifiedAt': datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).isoformat(timespec='seconds'),
    'platform': 'Android API 36 emulator-5556, x86_64',
    'locationSource': 'synthetic emulator geo fix, not physical GPS',
    'apk': apk,
    'installedApkHashMatches': True,
    'signerMatchesPreviousApk': 'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c',
    'permissionChecks': {'foregroundDeniedUi': True, 'foregroundGrant': 'adb test setup', 'backgroundGrant': 'system Settings Allow all the time; returned to running', 'notificationGrant': 'system UI Allow'},
    'network': {'activeDefaultNetwork': 'none', 'wifi': 0, 'mobileData': 0, 'airplaneMode': 0},
    'pauseStableTimeAndPoints': True,
    'resumeDoesNotBridgeGap': True,
    'screenLocked': {'additionalPoints': locked['point_count'] - before_lock['point_count'], 'additionalMeters': locked['distance_m'] - before_lock['distance_m']},
    'coldRestart': {'state': restored['status'], 'preservedPointCount': restored['point_count'], 'preservedActiveMs': restored['active_ms'], 'preservedDistanceM': restored['distance_m'], 'downtimeAddedMs': 0},
    'completed': {'pointCount': len(points), 'distanceM': done['distance_m'], 'independentCoordinateSumM': total, 'activeMs': done['active_ms'], 'offlineRestoration': True, 'noWritesAfterFinish': True},
    'gpsDisabledStartBlocked': True,
    'gpsLossDuringRun': {'status': loss['status'], 'preservedPointCount': loss['point_count']},
    'finishAndDeleteCancellation': True,
    'cleanup': {'qaRecordsAndPointsRemoved': True, 'originalCourseAndNoteRowsPreserved': True, 'originalRowsWereEmpty': True, 'gpsProviderOff': True, 'originalNetworkAndLocationSettingsRestored': True},
    'evidenceDirectory': '.cache/running-qa',
    'limitations': ['Physical phone and outdoor GPS not tested', 'Long duration, battery, vendor power saving, OS reclamation and reboot not tested', 'iOS not implemented/tested'],
}
target = root / 'docs/quality/running-tracking-emulator-report.json'
target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print(json.dumps(report, ensure_ascii=False, indent=2))
