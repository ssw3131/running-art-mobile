"""Reconcile collected physical-phone evidence; never controls a device."""
import datetime
import json
import math
import pathlib
import statistics
import sys
import xml.etree.ElementTree as ET

sys.stdout.reconfigure(encoding='utf-8')
ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / '.cache/a750-server-comparison-20261011'


def read(name):
    return json.loads((OUT / (name + '.json')).read_text(encoding='utf-8'))


def same(a, b):
    for key in ['dataset', 'shape', 'targetKm', 'nodes', 'edges', 'routing', 'candidates']:
        assert a[key] == b[key], key
    assert len(a['scores']) == len(b['scores']) == 5
    assert all(math.isclose(x, y, rel_tol=0, abs_tol=1e-6) for x, y in zip(a['scores'], b['scores']))


def visible(name):
    values = read(name + '-details')
    for path in OUT.glob(name + '-ui-*.xml'):
        for node in ET.parse(path).iter('node'):
            text = node.get('text', '')
            if '개 코스를 찾았어요' in text:
                values['completion'] = text
            if text.startswith('계산 기준 '):
                values['publicCenter'] = text
    return values


def summary():
    groups = {key: [read(key + '-' + str(i)) for i in range(1, 4)]
              for key in ['server-gangnam', 'device-gangnam', 'server-busan', 'device-busan']}
    firsts = {place: read('device-' + place + '-first') for place in ['gangnam', 'busan']}
    all_rows = [row for rows in groups.values() for row in rows] + list(firsts.values())
    assert len({r['before']['pid'] for r in all_rows}) == len(all_rows), 'Fresh processes required'
    checks = ['fourteen-fresh-process-calculations']
    for place in ['gangnam', 'busan']:
        base = firsts[place]['result']
        rows = groups['server-' + place] + groups['device-' + place]
        for row in rows:
            same(base, row['result'])
            current = visible(row['name'])
            original = visible(firsts[place]['name'])
            assert all(current['candidate-' + str(i)] == original['candidate-' + str(i)] for i in range(5))
            if current.get('completion'):
                expected = '서버에서' if row['name'].startswith('server-') else '기기에서'
                assert current['completion'] == expected + ' 5개 코스를 찾았어요.'
        for row in groups['device-' + place]:
            cache = row['result']['roadCache']
            assert row['result']['cached'] and cache['downloaded'] == 0
            assert cache['manifestHash'] == base['roadCache']['manifestHash']
        assert firsts[place]['result']['roadCache']['downloaded'] > 0
        checks += [place + '-inputs-search-counts-scores-and-five-summaries-match', place + '-cached-downloads-zero']
    previous = json.loads((ROOT / 'docs/quality/a750-performance-20261005.json').read_text(encoding='utf-8'))
    old_metrics = json.loads((ROOT / '.cache/a750-performance/gangnam-1.json').read_text(encoding='utf-8'))['result']
    same(groups['device-gangnam'][0]['result'], old_metrics)
    high = json.loads((ROOT / 'docs/quality/phone-followup-20261011.json').read_text(encoding='utf-8'))
    assert read('installed')['apkSha256'] == high['apkSha256']
    assert [visible('server-gangnam-2')['candidate-' + str(i)] for i in range(5)] == high['candidateSummaries']
    checks += ['historical-a750-inputs-and-results-match', 'same-apk-high-end-five-summaries-match']
    for kind in ['server', 'device']:
        cancel = read(kind + '-cancel')
        assert cancel['cancelled'] and cancel['noLateResultAfterSeconds'] >= 12
        same(groups['device-gangnam'][0]['result'], read(kind + '-after-cancel')['result'])
    checks.append('both-cancel-no-late-success-and-retry')
    same(groups['device-gangnam'][0]['result'], read('offline-fallback')['result'])
    assert read('offline-fallback')['result']['roadCache']['downloaded'] == 0
    assert read('offline-network')['network']['wifi_on'] == read('offline-network')['network']['mobile_data'] == '0'
    assert visible('offline-fallback')['completion'] == '서버 연결 대신 기기에서 5개 코스를 찾았어요.'
    checks.append('network-off-fallback-cached-same-results')
    assert read('device-input')['responseWhileComputing']
    terrain = read('terrain')
    assert terrain['ascentMeters'] == 96 and all(v for k, v in terrain.items() if k != 'ascentMeters')
    saved = read('saved-terrain')['tests']
    after = read('after-terrain')['tests']
    saved_terrain = next(r for r in saved if r['name'] == 'QA phone A750 terrain')
    assert saved_terrain['schema'] == 2
    assert next(r for r in after if r['id'] == saved_terrain['id'])['snapshotHash'] == saved_terrain['snapshotHash']
    custom = next(r for r in read('saved-custom')['tests'] if r['name'] == 'QA phone A750 custom')
    assert custom['schema'] == 3 and all(read('drawing').values())
    assert read('custom-reopened') == {'sameName': True, 'schema': 3}
    chart = read('terrain-chart')
    assert chart['sameElevation'] and chart['selected'] != chart['reversed']
    save_observations = []
    for before, success, duplicate in [('save-inspect', 'save-result', 'duplicate-result'),
                                        ('custom-save-inspect', 'custom-save-result', 'custom-duplicate-result')]:
        def ui_text(name):
            return ' '.join(n.get('text', '') for n in ET.parse(OUT / (name + '.xml')).iter('node'))
        assert '이 기기에 코스를 저장했어요.' not in ui_text(before)
        assert '이 기기에 코스를 저장했어요.' in ui_text(success)
        assert '이미 저장한 코스예요.' in ui_text(duplicate)
        save_observations.append({'firstAutomatedTapNoNotice': True, 'freshTapSaved': True, 'duplicatePrevented': True})
    simulation = read('simulation')
    assert simulation['offlineReplay'] and simulation['pauseStable'] and simulation['restartZero']
    gpx = read('gpx')
    assert gpx['systemChooserOpened'] and not gpx['recipientSelected']
    gps = read('gps')
    assert gps['pauseResume'] and gps['forceStopRecovery'] and gps['foregroundService']
    assert gps['run']['status'] == 'completed' and all(read('gps-cleanup').values())
    assert read('gps-permission-cancel')['permissionFlowCancelledPreparation']
    permission_text = ' '.join(n.get('text', '') for n in ET.parse(OUT / 'gps-permission-granted-cancelled.xml').iter('node'))
    assert '러닝 준비를 취소했어요.' in permission_text
    checks += ['input-while-computing', 'terrain-directions-offline-retry-snapshot', 'terrain-chart-selection',
               'custom-drawing-schema-v3-reopened', 'save-retry-and-duplicate-prevention', 'saved-course-offline-simulation', 'gpx-chooser-cancel',
               'stationary-gps-lifecycle-interruption-save-delete']
    initial, final = read('initial-content'), read('final-content')
    for key in ['saved_courses', 'running_sessions', 'running_points', 'storage_test_notes']:
        assert final[key] == initial[key]
    assert final['tests'] == [] and final['sync_deletions'] == final['sync_conflicts'] == 0
    finish = read('final-state')
    assert finish['apkSha256'] == read('installed')['apkSha256']
    assert finish['network'] == read('installed')['network']
    assert finish['fontScale'] == read('installed')['fontScale'] and finish['servicesNone']
    assert all(read('cleanup').values())
    checks += ['original-empty-content-restored', 'network-font-and-apk-preserved', 'helpers-removed-no-services']
    timings = {}
    for key, rows in groups.items():
        timings[key] = {'runsSeconds': [round(r['result']['timing']['totalMs']/1000, 3) for r in rows],
                        'medianSeconds': {k.removesuffix('Ms'): round(statistics.median(r['result']['timing'][k]/1000 for r in rows), 3)
                                          for k in ['roadMs', 'calculationMs', 'totalMs']},
                        'phoneMaxTimerLagMs': round(max(r['result']['maxTimerLagMs'] for r in rows), 1)}
    comparisons = {}
    for place in ['gangnam', 'busan']:
        server = timings['server-' + place]['medianSeconds']['total']
        device = timings['device-' + place]['medianSeconds']['total']
        comparisons[place] = {'deviceToServerRatio': round(device/server, 2),
                               'waitReductionPercent': round((1-server/device)*100, 1)}
    observations = [s for row in all_rows for s in [row['before'], *row['samples'], row['after']]]
    result = {'recordedAt': datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).isoformat(),
              'device': 'SM-A750N / Android 10 / API 29', 'apkSha256': finish['apkSha256'],
              'newInstall': read('before-install')['installed'] is False,
              'timings': timings, 'comparisons': comparisons,
              'firstDeviceDownloadSeconds': {k: round(v['result']['timing']['totalMs']/1000, 3) for k,v in firsts.items()},
              'historicalLowEndGangnamSeconds': previous['gangnamCached']['medianSeconds']['total'],
              'sameApkHighEndGangnamSeconds': high['medianTotalSeconds'],
              'temperatureRangeC': [min(int(s['battery']['temperature'])/10 for s in observations),
                                    max(int(s['battery']['temperature'])/10 for s in observations)],
              'sampledPssMiB': [round(min(s['pssKiB'] for s in observations if s['pssKiB'])/1024, 1),
                                round(max(s['pssKiB'] for s in observations if s['pssKiB'])/1024, 1)],
              'checks': checks,
              'features': {'terrainAscentMeters': 96, 'customSchema': 3,
                           'gpsSavedPoints': gps['run']['point_count'],
                           'gpsRejectedPoints': gps['run']['rejected_count'],
                           'gpsActiveSeconds': round(gps['run']['active_ms']/1000, 3)},
              'saveInteractionObservations': save_observations,
              'gpsFirstPermissionObservation': read('gps-permission-cancel'),
              'limitations': ['각 조건 3회이며 USB 충전·백그라운드 부하·CPU 주파수를 통제하지 않았다.',
                              '같은 APK 고사양폰은 같은 날의 이전 측정이며 동시 통제 비교가 아니다.',
                              '입력량·탐색량·5후보 점수/표시를 대조했으며 모든 후보의 전체 좌표를 비교하지 않았다.',
                              '서버의 maxSliceMs는 서버 계산 구간이다. 폰의 화면 지연은 maxTimerLagMs와 구분한다.',
                              '비로그인 검증이며 계정 동기화·사진 서버·야외 GPS·장시간 배터리를 완료한 것은 아니다.',
                              '이름 입력 후 자동 저장 첫 터치가 두 번 반응하지 않았다. 새 좌표 터치 후 저장/중복 방지는 통과했으나 수동 터치 재현·원인은 미확정이다.',
                              'Android 10 첫 위치 항상 허용 후 준비가 취소되어 다시 시작했다. 권한 창 전환 처리의 후속 확인이 필요하다.']}
    (ROOT / 'docs/quality/a750-server-comparison-20261011.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    summary()
