"""Compare ignored phone evidence without printing coordinates or account identity."""
import hashlib
import json
import pathlib
import re
import xml.etree.ElementTree as ET

ROOT = pathlib.Path.cwd()
OUT = ROOT / '.cache/account-phone-qa'
before = json.loads((OUT / 'before-records.private.json').read_text(encoding='utf-8'))
after = json.loads((OUT / 'after-records.private.json').read_text(encoding='utf-8'))
report = {'existingRecords': {}, 'phoneProfile': {}, 'preservedInstallFields': {}}
for table, rows in before.items():
    assert len(rows) == len(after[table]), table
    old_columns = len(rows[0]) if rows else 0
    compared = [row[:old_columns] for row in after[table]]
    assert rows == compared, 'Original content changed: ' + table
    if table == 'running_sessions':
        assert all(len(row) == old_columns + 7 and row[old_columns:] == [None] * 7 for row in after[table])
    else:
        assert rows == after[table]
    digest = hashlib.sha256(json.dumps(rows, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
    report['existingRecords'][table] = {'count': len(rows), 'originalColumnsSha256': digest, 'unchanged': True}

def nodes(name):
    return list(ET.parse(OUT / (name + '.xml')).iter('node'))

def field(name, key):
    return next(n for n in nodes(name) if n.get('resource-id') == key)

assert field('profile-before', 'profile-save').get('enabled') == 'false'
assert field('profile-restarted-account', 'account-name').get('text') == 'RunPenPhoneQA'
assert field('before-account', 'account-name').get('text') == field('final-account', 'account-name').get('text')
assert field('before-account', 'account-email').get('text') == field('final-account', 'account-email').get('text')
assert any(n.get('content-desc') == '연결 계정의 프로필 사진' for n in nodes('final-account'))
assert '켜짐' in field('updated-sync', 'sync-status').get('text') and '0건' in field('updated-sync', 'sync-status').get('text')
assert field('withdrawal-policy', 'withdraw-confirm').get('enabled') == 'true'
assert '삭제하지 않고' in field('withdrawal-policy', 'withdraw-retention-policy').get('text')
assert not any(n.get('resource-id') == 'withdraw-unavailable' for n in nodes('withdrawal-policy'))
report['phoneProfile'] = {'existingSessionRetained': True, 'unchangedSaveDisabled': True, 'realSaveAndProcessRestart': True,
                         'originalIdentityAndProviderPictureRestored': True, 'syncEnabledPendingZero': True,
                         'withdrawalAvailablePolicyVerifiedWithoutDeletion': True}
for key, pattern in {'appId': r'\bappId=(\d+)', 'firstInstallTime': r'firstInstallTime=([^\r\n]+)',
                     'dataDir': r'\bdataDir=([^\r\n]+)', 'ceDataInode': r'ceDataInode=(\d+)'}.items():
    values = []
    for name in ['package-before.txt', 'package-final.txt']:
        raw = (OUT / name).read_bytes()
        text = raw.decode('utf-16' if raw[:2] in [b'\xff\xfe', b'\xfe\xff'] else 'utf-8-sig')
        values.append(re.search(pattern, text).group(1))
    assert values[0] == values[1], key
    report['preservedInstallFields'][key] = True
server = json.loads((ROOT / '.cache/account-hosted-qa/phone-profile-result.json').read_text(encoding='utf-8'))
assert server['passed'] and server['originalMetadataSha256'] == server['restoredMetadataSha256']
report['serverProfileRestoredSha256'] = server['restoredMetadataSha256']
report['passed'] = True
(OUT / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
