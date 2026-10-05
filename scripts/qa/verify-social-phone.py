"""Compare native phone evidence without printing identity values or record content."""
import json
import pathlib
import re
import xml.etree.ElementTree as ET

root = pathlib.Path.cwd()
ui = root / '.cache/account-phone-qa'
out = root / '.cache/social-phone'
checks = []


def tree(name):
    return ET.parse(ui / ('social-' + name + '.xml'))


def field(doc, key):
    node = next((n for n in doc.iter('node') if n.get('resource-id') == key), None)
    assert node is not None, key
    return node.get('text') or node.get('content-desc')


def texts(doc):
    return [n.get('text', '') for n in doc.iter('node')]


def same_identity(a, b):
    for key in ['account-name', 'account-email']:
        assert field(a, key) == field(b, key), 'Account display mismatch'


before = tree('google-before')
same_identity(before, tree('google-updated'))
same_identity(before, tree('google-final'))
assert '연결 계정 · Google' in texts(tree('google-final'))
assert '2회' in texts(tree('google-final'))
assert '2개' in field(tree('google-final-menu'), 'account-courses')
assert field(tree('sync-final'), 'sync-status') == '동기화 켜짐 · 전송 대기 0건'
checks.append('Original Google profile, 2 courses/2 runs and enabled sync restored')

for provider, label in [('kakao', '카카오'), ('naver', '네이버')]:
    login, restored = tree(provider + '-login'), tree(provider + '-restored')
    assert field(login, 'auth-message') == label + ' 로그인되었습니다.'
    assert '연결 계정 · ' + label in texts(restored)
    assert field(login, 'account-email') == '이메일 정보가 없는 계정'
    assert field(login, 'account-name') not in ['', '러너', '나의 러닝, RunPen']
    same_identity(login, restored)
    assert (out / (provider + '-pid-login.txt')).read_text().strip() != (out / (provider + '-pid-restored.txt')).read_text().strip()
    assert field(tree(provider + '-sync'), 'sync-status') == '동기화 꺼짐 · 전송 대기 0건'
    assert '0개' in field(tree(provider + '-menu'), 'account-courses')
    assert '0.00 km' in texts(restored) and '2회' not in texts(restored)
    assert field(tree(provider + '-cancelled'), 'auth-message') == '로그인을 취소했습니다.'
    logged_out = tree(provider + '-logout-restored')
    for name in ['google', 'kakao', 'naver']:
        field(logged_out, name + '-sign-in')
    assert not any(value.startswith('연결 계정 ·') for value in texts(logged_out))
    checks.append(provider + ': consent return, profile, new-process restore, cancel/logout and account isolation')


def digest(name):
    raw = (out / name).read_text(encoding='utf-8-sig')
    assert 'INSTRUMENTATION_CODE: 0' in raw
    return json.loads(re.search(r'INSTRUMENTATION_RESULT: report=(.*)', raw).group(1))


a, b = digest('digest-before.txt'), digest('digest-final.txt')
for name, count in [('saved_courses', 2), ('running_sessions', 2), ('running_points', 209), ('storage_test_notes', 1)]:
    assert a[name] == b[name] and a[name].startswith(str(count) + ':'), name
assert b['tests'] == [] and b['sync_deletions'] == b['sync_conflicts'] == 0
checks.append('All original course/run/GPS/note content hashes preserved; no pending deletion/conflict')

before_pkg, after_pkg = [(out / name).read_text(encoding='utf-8-sig') for name in ['package-before.txt', 'package-after.txt']]
for name in ['appId', 'firstInstallTime', 'dataDir']:
    pattern = name + r'=([^\r\n]+)'
    assert re.search(pattern, before_pkg).group(1) == re.search(pattern, after_pkg).group(1), name
assert (out / 'installed-sha256.txt').read_text(encoding='utf-8-sig').startswith('33f6920a2e3591838b57b777bd7e1f2eb59fdadf333a7cdca5a0e7697e964952')
checks.append('Installed APK hash and original app identity/data path match')
report = {'passed': True, 'checks': checks, 'counts': {'courses': 2, 'runs': 2, 'gpsPoints': 209, 'notes': 1}}
(out / 'result.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
