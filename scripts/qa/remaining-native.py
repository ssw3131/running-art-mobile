"""Native UI verification restricted to the approved disposable account."""
import importlib.util, json, pathlib, re, sys, time
ROOT=pathlib.Path.cwd()
spec=importlib.util.spec_from_file_location('base', ROOT/'scripts/qa/guidance-phone.py')
q=importlib.util.module_from_spec(spec); spec.loader.exec_module(q)
q.SERIAL=sys.argv[1]; assert q.SERIAL in ['R3KL3019K7X','emulator-5556']
q.OUT=ROOT/'.cache/remaining-qa'; app=q.APP
tag='phone' if q.SERIAL=='R3KL3019K7X' else 'emulator'
def find(key, tree=None):
    return next((n for n in (tree if tree is not None else q.ui()).iter('node') if key in (n.get('resource-id'),n.get('text'),n.get('content-desc'))),None)
def capture(name):
    tree=q.ui(tag+'-'+name); q.evidence(tag+'-'+name,'.png').write_bytes(q.adb('exec-out','screencap','-p')); return tree
def page(path):
    q.adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d','runningart:///'+path,app); time.sleep(1.5)
def scroll(up=False): q.adb('shell','input','swipe','1035','750' if up else '2010','1035','1950' if up else '850','400')
def tap(key):
    for _ in range(8):
        n=find(key)
        if n is not None:
            x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds')))
            if n.get('enabled')=='true' and y1>=280 and y2<=2195 and y2-y1>=25:
                q.adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2));time.sleep(.7);return
        scroll()
    raise RuntimeError('Unavailable control: '+key)
def fixture():
    page('account'); tree=capture('fixture-guard')
    email=find('account-email',tree)
    expected=json.loads((ROOT/'.cache/account-expansion/fixtures.private.json').read_text())[0]['email']
    assert re.fullmatch(r'runpen-photo-\d+-b@example\.invalid',expected)
    assert email is not None and email.get('text')==expected,'Not the approved temporary account'
def fill(key,value):
    tap(key);q.adb('shell','input','keycombination','113','29');q.adb('shell','input','text',value.replace(' ','%s'));q.adb('shell','input','keyevent','4')
action=sys.argv[2]
if action=='sync':
    fixture();page('account-sync')
    if find('sync-enable') is not None:tap('sync-enable');q.tap('android:id/button1')
    else:tap('sync-now')
    time.sleep(3);tree=capture('synced')
    print(find('sync-status',tree).get('text'),flush=True)
elif action=='profile-conflict':
    fixture();tap('edit-profile');tap('profile-initials-picture');tap('profile-save');time.sleep(3)
    tree=capture('profile-conflict');n=find('profile-message',tree)
    print(n.get('text') if n is not None else 'No profile error visible',flush=True)
elif action=='rename':
    fixture();f=json.loads((q.OUT/'sync-fixture.json').read_text());c=f['courses'][int(sys.argv[3])]
    page('courses/'+c['id']);assert find('course-title').get('text').startswith('QA remaining ')
    fill('course-rename-input',sys.argv[4]);tap('course-rename');capture('renamed-'+str(sys.argv[3]))
    print('Synthetic course renamed through UI',flush=True)
elif action=='resolve':
    fixture();f=json.loads((q.OUT/'sync-fixture.json').read_text());c=f['courses'][int(sys.argv[3])]
    choice=sys.argv[4];assert choice in ['local','remote']
    page('account-sync');tap('sync-'+choice+'-'+c['id']);q.tap('android:id/button1');time.sleep(3)
    capture('resolved-'+choice);page('courses/'+c['id']);tree=capture('resolved-course-'+choice)
    print(find('course-title',tree).get('text'),flush=True)
elif action=='delete-course':
    fixture();f=json.loads((q.OUT/'sync-fixture.json').read_text());c=f['courses'][int(sys.argv[3])]
    page('courses/'+c['id']);assert find('course-title').get('text').startswith('QA remaining ')
    tap('course-delete');q.tap('android:id/button1');capture('deleted-course-'+str(sys.argv[3]))
    print('Synthetic course deleted through UI',flush=True)
elif action=='withdraw':
    fixture();page('account-withdraw');capture('withdraw-before')
    tap('withdraw-confirm');tree=capture('withdraw-confirm')
    assert find('RunPen에서 탈퇴할까요?',tree) is not None
    assert find('탈퇴하고 기기 기록 보관',tree) is not None
    q.tap('android:id/button1');time.sleep(3);capture('withdraw-result')
    print('Approved fixture withdrawal requested through native UI',flush=True)
elif action=='photo-offline':
    fixture();tap('edit-profile');tap('profile-initials-picture')
    previous={k:q.adb('shell','settings','get','global',k).decode().strip() for k in ['wifi_on','mobile_data']}
    try:
        q.adb('shell','svc','wifi','disable');q.adb('shell','svc','data','disable');tap('profile-save')
        deadline=time.monotonic()+45
        while time.monotonic()<deadline:
            tree=q.ui();n=find('profile-message',tree)
            if n is not None and '저장하지 못' in n.get('text'):break
            time.sleep(2)
        else:raise RuntimeError('Offline profile error did not settle')
        capture('photo-offline-error');print('PASS: offline save reports failure and keeps editor',flush=True)
    finally:
        q.adb('shell','svc','wifi','enable' if previous['wifi_on']=='1' else 'disable')
        q.adb('shell','svc','data','enable' if previous['mobile_data']=='1' else 'disable')
    tap('profile-cancel');tree=capture('photo-cancel-confirm')
    assert find('편집을 취소할까요?',tree) is not None
    q.tap('android:id/button1');time.sleep(2);capture('photo-offline-cancelled')
elif action=='withdraw-resume':
    fixture();page('account-withdraw');assert find('withdraw-resume') is not None
    tap('withdraw-resume');time.sleep(4);tree=capture('withdraw-complete')
    n=find('withdraw-message',tree);print(n.get('text') if n is not None else 'Withdrawal result pending',flush=True)
elif action=='cleanup-guests':
    page('account');assert find('google-sign-in') is not None,'Cleanup only after withdrawal signed out'
    f=json.loads((q.OUT/'sync-fixture.json').read_text())
    for c in f['courses']:
        page('courses/'+c['id']);assert find('course-title').get('text').startswith('QA remaining ')
        capture('guest-course-'+c['id']);tap('course-delete');q.tap('android:id/button1')
    page('runs/'+f['run']);assert any('QA remaining keep' in n.get('text','') for n in q.ui().iter('node'))
    capture('guest-run');tap('run-delete');q.tap('android:id/button1');capture('guests-cleaned')
    print('PASS: retained synthetic guest courses/run reopened and deleted through native UI',flush=True)
elif action=='capture':
    tree=capture(sys.argv[3]); print(json.dumps([n for n in q.describe(tree) if n['id'] in ['sync-status','sync-message','profile-message','withdraw-message','course-title'] or '충돌' in n['text']],ensure_ascii=False),flush=True)
elif action=='page': page(sys.argv[3]);capture(sys.argv[4])
elif action=='tap':
    assert sys.argv[3] not in ['withdraw-confirm','withdraw-resume'], 'Use the guarded withdrawal action'
    tap(sys.argv[3]);capture(sys.argv[4])
else:raise ValueError('Unknown action')
