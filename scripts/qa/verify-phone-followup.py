"""Reconcile the 2026-10-11 physical-phone evidence; never accesses the phone."""
import json
from pathlib import Path
import re
import statistics
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / '.cache/phone-followup-20261011'
checks = []


def data(name):
    return json.loads((RAW / (name + '.json')).read_text(encoding='utf-8'))


def node(name, key):
    return next(n for n in ET.parse(RAW / (name + '.xml')).iter('node')
                if n.get('resource-id') == key)


def check(name, condition):
    assert condition, name
    checks.append(name)


baseline, final = data('baseline'), data('final-content')
tables = ['saved_courses', 'running_sessions', 'running_points', 'storage_test_notes']
check('original-content', all(baseline[k] == final[k] for k in tables))
check('test-record-cleanup', not final['tests'] and final['sync_deletions'] == final['sync_conflicts'] == 0)
check('account-preserved', all(data(n) == data('account-before') for n in
      ['account-after-install', 'account-after-photos', 'account-final']))
check('sync-enabled-and-empty', node('sync-after-cleanup', 'sync-status').get('text') == '동기화 켜짐 · 전송 대기 0건')
device = data('device-final')
check('installed-apk', device['apkSha256'] == data('installed')['apkSha256'] ==
      '9b4426ca98a6466062c2696846057c088f9b4c6765b0cb1658a5a8d202282a32')
check('network-and-service-restored', device['servicesNone'] and device['network'] == data('before-install')['network'])
check('location-permissions-restored', data('gps-settings-before') == data('gps-settings-after'))

names = [f'{mode}-gangnam-{i}' for mode in ['server', 'device'] for i in [1, 2, 3]]
names += ['offline-fallback', 'server-after-cancel']
results = {}
for name in names:
    # Native view pruning can leave a partial candidate in a later capture.
    # Reconcile all captures, keeping the complete/longest observed text.
    row = data(name)
    for file in RAW.glob(name + '-*.xml'):
        for n in ET.parse(file).iter('node'):
            value, key = n.get('text', ''), n.get('resource-id', '')
            if '전체 소요 시간' in value:
                row['totalTiming'] = value
            if value.startswith('도로 조회 '):
                row['stageTiming'] = value
            if key.startswith('candidate-'):
                value = ' / '.join(c.get('text') for c in n.iter('node') if c.get('text'))
                if len(value) > len(row.get(key, '')):
                    row[key] = value
    results[name] = row
reference = [results[names[0]]['candidate-' + str(i)] for i in range(5)]
check('eight-calculations-five-candidate-summaries', all(
      [r['candidate-' + str(i)] for i in range(5)] == reference for r in results.values()))
check('server-device-offline-routing', all('서버에서' in results[f'server-gangnam-{i}']['completion'] for i in [1, 2, 3])
      and all('기기에서' in results[f'device-gangnam-{i}']['completion'] for i in [1, 2, 3])
      and '서버 연결 대신 기기에서' in results['offline-fallback']['completion'])
check('cancel-retained-before-recalculation', all(node(n, 'calculation-cancelled') is not None
      for n in ['server-cancelled', 'server-cancelled-late']))
check('terrain-online-memory-and-retry', all('96m' in node(n, 'terrain-summary').get('text', '')
      for n in ['saved-terrain-online', 'saved-terrain-memory-offline', 'saved-terrain-retry']))
check('terrain-new-process-offline-error', node('saved-terrain-restart-offline', 'terrain-error') is not None
      and node('saved-terrain-restart-offline', 'terrain-retry') is not None)
a11y = (RAW / 'terrain-accessibility.txt').read_text(encoding='utf-8')
values = {k: re.search(r'INSTRUMENTATION_RESULT: ' + k + r'=(.*)', a11y).group(1)
          for k in ['before', 'incremented', 'restored']}
check('terrain-accessibility-actions', 'INSTRUMENTATION_CODE: 0' in a11y and
      values['before'] == values['restored'] != values['incremented'])
check('location-off-and-approximate-only', '위치 기능' in node('gps-location-off', 'run-error').get('text')
      and '정확한 위치' in node('gps-approximate-only', 'run-error').get('text'))
run = data('gps-test-run')
check('real-gps-pause-interrupt-resume-save', run['status'] == 'completed' and run['point_count'] == 5
      and len(run['pointTiming']) == 5 and run['active_ms'] == 39813
      and data('gps-live-service')['locationTaskService']
      and node('gps-paused', 'run-status').get('text') == '일시정지'
      and node('gps-interrupted', 'run-status').get('text') == '기록 중단'
      and node('gps-resumed-paused', 'run-status').get('text') == '일시정지')

photo_ids = ['a2399413-a07f-45ac-bf4a-435f99a92e66', 'dcbe9e5e-f798-4b29-b61a-2ad7df6ca433',
             '08f949a0-6ee7-407e-bbee-631b468014c2']
photos = [next(p for p in data('photo-output-' + str(i)) if p['path'] == 'ImageManipulator/' + photo_id + '.jpg')
          for i, photo_id in enumerate(photo_ids)]
check('three-native-photo-formats', all(p['width'] == p['height'] == 512 and p['mime'] == 'image/jpeg'
      and not p['hasAppOrCommentMetadata'] for p in photos))
cleanup = data('temporary-cleanup')
check('temporary-device-files-removed', all(cleanup.values()) and cleanup['photoCacheFilesRemoved'] == 12
      and cleanup['syntheticGalleryRowsRemoved'] == 3
      and 'photos=[]' in (RAW / 'photo-cache-final.txt').read_text()
      and 'No result found' in (RAW / 'photo-gallery-final.txt').read_text())

timings = {name: {'totalSeconds': float(re.search(r'[\d.]+', r['totalTiming']).group()),
                 'stages': r['stageTiming']} for name, r in results.items()}
report = {
    'date': '2026-10-11', 'device': 'SM-S942N / Android 16',
    'status': 'indoor-complete; field/long-lock/battery/additional-device pending',
    'apkSha256': device['apkSha256'], 'installedAtKst': '2026-10-11T19:09:47+09:00',
    'checks': checks, 'originalContent': {k: final[k] for k in tables},
    'sameAccount': True, 'syncPending': 0, 'timings': timings,
    'medianTotalSeconds': {mode: statistics.median(timings[f'{mode}-gangnam-{i}']['totalSeconds']
                                                 for i in [1, 2, 3]) for mode in ['server', 'device']},
    'candidateSummaries': reference, 'terrainAscentMeters': 96, 'accessibility': values,
    'photoOutputs': [{k: p[k] for k in ['bytes', 'sha256', 'width', 'height', 'mime', 'hasAppOrCommentMetadata']}
                     for p in photos],
    'gps': {k: run[k] for k in ['status', 'active_ms', 'distance_m', 'point_count', 'rejected_count']},
    'cleanup': cleanup, 'network': device['network'], 'servicesNone': device['servicesNone'],
    'limits': ['No field distance/height ground truth', 'No 30-minute phone lock or battery drain',
               'No second physical phone or latest low-end-phone build', 'No spoken TalkBack confirmation',
               'No other-device profile instant-refresh retest', 'No reboot or OS memory-pressure test',
               'Candidate UI summaries compared; not full geometry hashes in this phone run',
               '2026-10-11 parallel Figma changes excluded from installed APK'],
}
target = ROOT / 'docs/quality/phone-followup-20261011.json'
target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'PASS: {len(checks)} evidence groups; sanitized report: {target.name}')
