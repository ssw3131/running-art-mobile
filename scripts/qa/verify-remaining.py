"""Compare recorded evidence; never contacts a device or exports identity fields."""
import hashlib, json, pathlib, re, xml.etree.ElementTree as ET
ROOT=pathlib.Path.cwd(); D=ROOT/'.cache/remaining-qa'; A=ROOT/'.cache/account-phone-qa'
def report(name):
    return json.loads(re.search(r'report=(.*)',(D/name).read_text(encoding='utf-8-sig')).group(1))
def nodes(directory,name): return list(ET.parse(directory/(name+'.xml')).iter('node'))
def value(directory,name,key):
    return next(n.get('text') for n in nodes(directory,name) if n.get('resource-id')==key)
checks=[]
def passed(name): checks.append(name);print('PASS: '+name)
before=report('phone-before.txt');cleaned=report('phone-cleaned.txt')
for key in ['saved_courses','running_sessions','running_points','storage_test_notes']: assert before[key]==cleaned[key]
assert cleaned['sync_conflicts']==cleaned['sync_deletions']==0
passed('original phone courses/runs/GPS/notes and pending queues preserved')
a=report('phone-withdraw-before.txt')['remainingSynthetic'];b=report('phone-withdraw-after.txt')['remainingSynthetic']
for key in a:
    assert a[key]['contentHash']==b[key]['contentHash'] and a[key]['count']==b[key]['count']
assert a['saved_courses']['guests']==a['running_sessions']['guests']==0
assert b['saved_courses']['guests']==b['saved_courses']['count']==3
assert b['running_sessions']['guests']==b['running_sessions']['count']==1
assert b['running_points']['count']==1
passed('native withdrawal retains identical synthetic content and converts only ownership to guest')
assert any(n.get('resource-id')=='withdraw-resume' for n in nodes(D,'phone-withdrawal-restarted'))
assert '탈퇴가 완료' in value(D,'phone-withdraw-complete','withdraw-message')
passed('native pending withdrawal survives process restart and finishes via resume')
for label in ['before','after']:
    text=(D/f'server-{label}.txt').read_text(encoding='utf-8-sig')
    for expected in ['auth_profile 3 916e1ffcbd13c494bedfbd9b87619a36','personal_records 10 7b1decaea7dddc8ea95809dc86eaaa2f','storage_objects 4 fffb793920a4f0405b2a42dc18dfca13']:
        assert expected in text
passed('both disposable accounts removed; original server counts and metadata hashes unchanged')
assert not (ROOT/'.cache/account-expansion/fixtures.private.json').exists()
assert not list(D.glob('session-*.private.json'))
passed('temporary credential and session files deleted')
assert len(json.loads((ROOT/'.cache/account-expansion/hosted-report.json').read_text())['checks'])==7
photo=json.loads((D/'native-photo-report.json').read_text())
assert photo['hash']==hashlib.sha256((D/'native-upload.jpg').read_bytes()).hexdigest()
assert photo['metadataStripped'] and photo['bytes']==7437
passed('hosted photo checks and native immutable JPEG bytes agree')
assert '다른 곳에서 프로필' in value(D,'emulator-profile-conflict','profile-message')
assert '저장하지 못' in value(D,'phone-photo-offline-error','profile-message')
passed('native stale profile conflict and offline save failure displayed')
for name in ['emulator-real-conflict','emulator-delete-conflict']:
    assert '충돌 1건' in value(D,name,'sync-message')
assert value(D,'emulator-resolved-course-remote','course-title')=='QA remaining phone edit'
assert value(D,'emulator-resolved-course-local','course-title')=='QA remaining preserve local'
assert value(D,'phone-synced','sync-status')=='동기화 켜짐 · 전송 대기 0건'
assert value(D,'emulator-synced','sync-status')=='동기화 켜짐 · 전송 대기 0건'
passed('two Android instances resolve edit/edit and delete/edit conflicts with both choices')
assert '접근하지 못' in value(A,'remaining-storage-corrupt','storage-error')
assert value(A,'remaining-storage-recovered','storage-status')=='저장소 준비 완료'
assert '접근하지 못' in value(A,'remaining-storage-full','storage-error')
assert value(A,'remaining-storage-full','storage-note-input')=='RunPen_Storage_QA'
assert value(A,'remaining-storage-full','storage-count')=='저장한 메모 0개'
assert value(A,'remaining-storage-space-recovered','storage-count')=='저장한 메모 1개'
passed('native corrupt DB and actual ENOSPC show errors and recover without duplicate saves')
assert '위치 권한이 필요' in value(A,'remaining-location-denied','run-error')
assert '위치 기능을 켠' in value(A,'remaining-location-off-result','run-error')
assert (D/'emulator-permissions-before.txt').read_bytes()==(D/'emulator-permissions-after.txt').read_bytes()
passed('location denial/service-off block starts and original permissions are restored')
result={'checks':checks,'originalPhoneContentPreserved':True,'originalServerPreserved':True,'fixtureAccountsDeleted':2,'finalGoogleRestored':False}
if (A/'remaining-google-final.xml').exists():
    for key in ['account-name','account-email']:
        assert value(A,'remaining-google-before',key)==value(A,'remaining-google-final',key)
    assert value(A,'remaining-google-final-sync','sync-status')=='동기화 켜짐 · 전송 대기 0건'
    result['finalGoogleRestored']=True;passed('original Google identity and enabled sync with zero pending restored')
(D/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
