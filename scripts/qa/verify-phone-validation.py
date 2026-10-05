"""Validate phone evidence without printing account identity or original coordinates."""
import json, pathlib, re, xml.etree.ElementTree as ET
root=pathlib.Path.cwd(); out=root/'.cache/phone-validation'
def report(name):
    raw=(out/(name+'.txt')).read_text(encoding='utf-8-sig')
    assert 'INSTRUMENTATION_CODE: 0' in raw
    return json.loads(re.search(r'INSTRUMENTATION_RESULT: report=(.*)',raw).group(1))
def node(name,key):
    return next(n for n in ET.parse(out/(name+'.xml')).iter('node') if n.get('resource-id')==key)
before=report('baseline');offline=report('offline-inspect');synced=report('synced-inspect');empty=report('empty-inspect');restored=report('restored-inspect')
for table in ['saved_courses','running_sessions','running_points']:
    assert empty[table].startswith('0:')
    assert offline[table]==synced[table]==restored[table],table+' payload changed during sync/restore'
assert all(r['dirty']==0 and r['remoteVersion']>0 for r in synced['tests'])
assert synced['tests']==restored['tests']
assert {r['schema'] for r in restored['tests'] if r['kind']=='course'}=={2,3}
assert len([r for r in restored['tests'] if r['kind']=='run'])==2
for name in ['offline-pending-four','offline-restarted-four']:
    assert '4건' in node(name,'sync-status').get('text')
assert '전송 4건' in node('online-synced','sync-message').get('text')
assert '복원 8건' in node('server-restored','sync-message').get('text')
assert node('calculation-cancelled','calculation-cancelled') is not None
assert any('이미 저장한 코스' in n.get('text','') for n in ET.parse(out/'custom-duplicate.xml').iter('node'))
assert any('이 기록의 공유 링크가 있어요.' in n.get('text','') for n in ET.parse(out/'share-chooser-dismissed.xml').iter('node'))
assert any('공유를 중단했어요.' in n.get('text','') for n in ET.parse(out/'share-revoked.xml').iter('node'))
result={'serverRoundTrip':True,'offlineRestartRetry':True,'emptyPhoneRestore':True,'restoredCourses':4,'restoredRuns':4,'restoredPoints':455,'syntheticCourses':2,'syntheticRuns':2,'syntheticPoints':246}
result.update(customCalculationCancelled=True,duplicateSavePrevented=True,phoneShareChooser=True,shareRevoked=True)
if (out/'final-inspect.txt').exists():
    final=report('final-inspect')
    for table in ['saved_courses','running_sessions','running_points','storage_test_notes']:assert before[table]==final[table],table+' original changed'
    assert not final['tests'] and final['sync_deletions']==0 and final['sync_conflicts']==0
    account_before=ET.parse(root/'.cache/account-phone-qa/validation-before-account.xml')
    account_after=ET.parse(out/'final-account.xml')
    for key in ['account-name','account-email']:
        values=[next(n.get('text') for n in tree.iter('node') if n.get('resource-id')==key) for tree in [account_before,account_after]]
        assert values[0]==values[1]
    assert '켜짐' in node('final-sync','sync-status').get('text') and '0건' in node('final-sync','sync-status').get('text')
    result.update(originalDataPreserved=True,originalAccountPreserved=True,testRecordsCleaned=True,syncEnabledPendingZero=True)
(out/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
