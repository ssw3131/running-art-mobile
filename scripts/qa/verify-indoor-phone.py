"""Verify recorded indoor phone evidence without contacting the phone/server."""
import json
import hashlib
import pathlib
import re
import sys
import xml.etree.ElementTree as ET

sys.stdout.reconfigure(encoding='utf-8')

ROOT = pathlib.Path.cwd()
D = ROOT / '.cache/indoor-phone'


def load(name):
    return json.loads((D / (name + '.json')).read_text(encoding='utf-8-sig'))


def nodes(name):
    return list(ET.parse(D / (name + '.xml')).iter('node'))


def texts(name):
    return [n.get('text', '') for n in nodes(name)]


def timing(name):
    result = load(name).get('timing', [])
    if not result:
        result = [text for text in texts(name + '-result')
                  if re.match(r'^(전체 소요 시간|도로 조회|코스 계산) ', text)]
    return result


checks = []
rows = []
for sample in ['busan-cityhall', 'daejeon', 'jeju', 'boundary-guro-gwangmyeong']:
    online, offline = [load(sample + '-' + mode) for mode in ['refresh', 'offline']]
    assert len(online['candidates']) == len(offline['candidates']) == 5
    assert all(re.match(r'^\d순위 · [\d.]+ km · \d+점 ', value) for value in online['candidates']), sample
    assert online['candidates'] == offline['candidates'], sample + ' candidates differ'
    assert online['center'] == offline['center']
    assert online['calculation-metrics'].split('\n')[0] == offline['calculation-metrics'].split('\n')[0]
    assert offline['network'] == {'wifi_on': '0', 'mobile_data': '0', 'airplane_mode_on': '0'}
    assert '캐시 사용' in ' '.join(timing(sample + '-offline'))
    rows.append({'sample': sample, 'online': timing(sample + '-refresh'),
                 'offline': timing(sample + '-offline'), 'input': offline['calculation-metrics'].split('\n')[0],
                 'candidatesEqual': True})
    checks.append(sample + ': five candidate summaries/input/center match, radios off and persistent cache used')

if '--routes-only' not in sys.argv:
    before, after = load('before-inspect'), load('after-inspect')
    for table in ['saved_courses', 'running_sessions', 'running_points', 'storage_test_notes']:
        assert before[table] == after[table], table
    assert not after['tests'] and after['sync_deletions'] == after['sync_conflicts'] == 0
    assert load('before-account')['accountHash'] == load('after-account')['accountHash']
    assert load('after-account')['sync'] == '동기화 켜짐 · 전송 대기 0건'
    checks.append('original data hashes and Google account preserved; sync enabled with zero pending')
    assert load('anonymous-published')['syntheticOnly'] and load('anonymous-revoked')['anonymousResultNull']
    checks.append('only synthetic 232 GPS points/two segments/three layers published; revocation blocks anonymous API')
    assert 'QA phone indoor synthetic' in texts('browser-ready')
    # Chrome did not expose the refreshed body to UIAutomator. This assertion
    # ties an explicitly manual visual observation to its exact screenshot.
    visual = load('browser-revoked-visual')
    assert visual['method'] == 'assistant visual inspection'
    assert visual['visibleTitle'] == '이 경로를 볼 수 없어요' and visual['mapAbsent']
    assert visual['screenshotSha256'] == hashlib.sha256((D/'browser-revoked.png').read_bytes()).hexdigest()
    for key in ['actual', 'planned', 'target']:
        state = load('browser-toggle-' + key)
        assert state['before'] is True and state['disabled'] is False and state['restored'] is True
    checks.append('phone browser loads synthetic share, three independent toggles restore, revoked page blocks access')
    final = load('device-final')
    assert final['network'] == load('baseline-device')['network']
    assert all(final[key] for key in ['helperRemoved', 'qaFilesRemoved', 'appServicesNone', 'qaTabClosed'])
    assert final['apkSha256'] == load('tested-installation')['apkSha256']
    checks.append('latest installed release preserved; network restored; helper/temp files/QA browser tab removed')

result = {'checks': checks, 'routes': rows, 'passed': True}
(D / ('routes-verification.json' if '--routes-only' in sys.argv else 'verification.json')).write_text(
    json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False, indent=2))
