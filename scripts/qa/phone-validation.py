"""Explicit SM-S942N UI checks. No account credentials or private record exports."""
import importlib.util, json, pathlib, re, sys, time, xml.etree.ElementTree as ET
ROOT = pathlib.Path.cwd()
spec = importlib.util.spec_from_file_location('phone_base', ROOT/'scripts/qa/guidance-phone.py')
q = importlib.util.module_from_spec(spec); spec.loader.exec_module(q)
q.SERIAL = 'R3KL3019K7X'
OUT = ROOT/'.cache/phone-validation'; OUT.mkdir(exist_ok=True); q.OUT = OUT
adb = q.adb

def ui(name='screen'):
    return q.ui(name)

def capture(name):
    tree=ui(name); (OUT/(name+'.png')).write_bytes(adb('exec-out','screencap','-p'))
    safe=[n for n in q.describe(tree) if n['id'] not in ['account-name','account-email','profile-nickname']]
    print(json.dumps(safe,ensure_ascii=False),flush=True)
    return tree

def scroll(up=False): adb('shell','input','swipe','1055', '1450' if up else '2020','1055','2100' if up else '1640','400')

def find(key,tree=None):
    return next((n for n in (tree if tree is not None else ui()).iter('node') if key in (n.get('resource-id'),n.get('text'),n.get('content-desc'))),None)

def tap(key):
    for _ in range(14):
        n=find(key)
        if n is not None:
            x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds')))
            if n.get('enabled')=='true' and y2-y1>=20 and y1>=285 and y2<=2195:
                adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2));time.sleep(.5);return
        scroll()
    raise RuntimeError('Control unavailable: '+key)

def top():
    for _ in range(5):scroll(True)

def open_page(page):
    adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d','runningart:///'+page,q.APP);time.sleep(2)

def draw(kind):
    n=find('drawing-canvas');assert n is not None
    x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds')))
    path={'square':[(.18,.18),(.82,.18),(.82,.82),(.18,.82),(.18,.18)],'open':[(.18,.18),(.82,.18),(.82,.82)],'triangle':[(.5,.15),(.85,.85),(.15,.85),(.5,.15)]}[kind]
    pts=';'.join(f'{round(x1+x*(x2-x1))},{round(y1+y*(y2-y1))}' for x,y in path)
    result=adb('shell','uiautomator','runtest','/data/local/tmp/drawing-gesture.jar','/system/framework/android.test.base.jar','-c','DrawingGesture','-e','points',"'"+pts+"'")
    assert b'OK (1 test)' in result,result.decode(errors='replace')
    time.sleep(.5)

def drawing_flow():
    # Start on a fresh route-lab page after selecting the public Seoul sample.
    top(); tap('shape-custom')
    assert find('drawing-apply').get('enabled')=='false'
    draw('open'); assert find('drawing-invalid') is not None
    assert find('drawing-apply').get('enabled')=='false'
    tap('drawing-clear'); assert find('drawing-apply').get('enabled')=='false'
    draw('square'); assert find('drawing-valid') is not None; ui('drawing-square')
    tap('drawing-apply'); top(); tap('shape-heart'); assert find('selected-custom-shape') is None
    top(); tap('shape-custom'); assert find('drawing-valid') is not None; tap('drawing-apply')
    top(); tap('shape-custom'); draw('triangle'); tap('drawing-cancel')
    top(); tap('shape-custom'); ui('drawing-cancel-preserved'); tap('drawing-apply')
    print('PASS: phone empty/open/clear/square/builtin switch/cancel',flush=True)
    top(); tap('distance-3'); tap('calculate-route'); cancel_calculation()
    top(); tap('calculate-route'); print('Phone custom calculation started',flush=True)

def helper(action,name):
    adb('shell','am','force-stop',q.APP)
    result=adb('shell','am','instrument','-w','-e','action',action,'com.runningart.authdigest/com.runningart.authdigest.PhoneValidation').decode()
    assert 'INSTRUMENTATION_CODE: 0' in result,result
    (OUT/(name+'.txt')).write_text(result,encoding='utf-8')
    if action=='export-custom':
        fixture=json.loads(re.search(r'INSTRUMENTATION_RESULT: fixture=(.*)',result).group(1))
        (OUT/'custom.json').write_text(json.dumps(fixture,ensure_ascii=False),encoding='utf-8')
        s=fixture['snapshot']; assert s['shape']=='custom' and s['schemaVersion']==3
        for x,y in [(-1,1),(1,1),(1,-1),(-1,-1)]:
            assert any(abs(p['x']-x)<.2 and abs(p['y']-y)<.2 for p in s['customTemplate'])
        print(json.dumps({'id':fixture['id'],'schema':3,'points':len(s['route']),'squarePreservedAfterCancel':True}))
    else:print(result,flush=True)

def fill(key,value):
    tap(key); adb('shell','input','keycombination','113','29'); adb('shell','input','text',value.replace(' ','%s')); adb('shell','input','keyevent','4');time.sleep(.5)

def save_custom():
    assert find('calculation-done') is not None
    tap('candidate-0'); fill('course-save-name','QA phone v3'); tap('course-save'); ui('custom-saved')
    tap('course-save'); assert any('이미 저장한 코스' in n.get('text','') for n in ui('custom-duplicate').iter('node'))
    helper('export-custom','custom-export')
    fixture=json.loads((OUT/'custom.json').read_text(encoding='utf-8'));open_page('courses/'+fixture['id']);capture('custom-reopened')

def offline_flow():
    fixture=json.loads((OUT/'fixture-summary.json').read_text())
    open_page('courses/'+fixture['customId']); fill('course-rename-input','QA phone v3 offline'); tap('course-rename')
    ui('offline-renamed'); open_page('account-sync')
    assert '4건' in find('sync-status').get('text'); ui('offline-pending-four')
    adb('shell','am','force-stop',q.APP); open_page('account-sync')
    assert '4건' in find('sync-status').get('text'); ui('offline-restarted-four')
    print('PASS: offline rename persisted and all 4 pending records survived process restart',flush=True)
    helper('inspect','offline-inspect')

def share_flow():
    fixture=json.loads((OUT/'fixture-summary.json').read_text())
    run=next(r for r in fixture['runs'] if r['name']=='QA phone v3')
    assert re.fullmatch(r'0505[a-f0-9]{28}',run['id'])
    open_page('runs/'+run['id'])
    assert find('run-course-result').get('text').startswith('QA phone v3 ·')
    tap('run-share-link'); ui('share-confirm');tap('android:id/button1');time.sleep(3)
    tree=ui('share-chooser'); (OUT/'share-chooser.png').write_bytes(adb('exec-out','screencap','-p'))
    text='\n'.join(n.get('text','')+' '+n.get('content-desc','') for n in tree.iter('node'))
    urls=re.findall(r'https://runpen-shared-runs\.ssw3131\.workers\.dev/#r/[a-f0-9]{64}',text)
    assert urls,'Chooser does not expose full fixture link'
    (OUT/'shared-link.json').write_text(json.dumps({'link':urls[0]}),encoding='utf-8')
    print('PASS: system share chooser opened with synthetic run link; no recipient selected',flush=True)
    adb('shell','input','keyevent','4');time.sleep(.7);ui('share-chooser-dismissed')
    assert any('이 기록의 공유 링크가 있어요.' in n.get('text','') for n in ui().iter('node'))
    print(urls[0],flush=True)

def cleanup_fixtures():
    fixture=json.loads((OUT/'fixture-summary.json').read_text())
    for run in fixture['runs']:
        open_page('runs/'+run['id']);assert find('run-course-result').get('text').startswith('QA phone ')
        tap('run-delete');tap('android:id/button1');print('Deleted synthetic run '+run['id'],flush=True)
    for ident in [fixture['courseId'],fixture['customId']]:
        open_page('courses/'+ident);assert find('course-title').get('text').startswith('QA phone ')
        tap('course-delete');tap('android:id/button1');print('Deleted synthetic course '+ident,flush=True)
    open_page('account-sync');tap('sync-now');print('Synthetic deletion synchronization requested',flush=True)

def cancel_flow():
    open_page('route-lab');top();tap('route-diagnostics');tap('sample-seoul-gangnam');top();tap('shape-custom')
    draw('square');tap('drawing-apply');top();tap('distance-3');tap('calculate-route')
    cancel_calculation()

def cancel_calculation():
    response=adb('shell','uiautomator','runtest','/data/local/tmp/drawing-gesture.jar','/system/framework/android.test.base.jar','-c','DrawingGesture','-e','click','cancel-route')
    assert b'OK (1 test)' in response,response.decode(errors='replace')
    assert find('calculation-cancelled') is not None;ui('calculation-cancelled')
    print('PASS: phone custom drawing calculation cancelled through native UI button',flush=True)

def finish_device():
    verified=json.loads((OUT/'verification.json').read_text())
    assert verified.get('originalDataPreserved') and verified.get('originalAccountPreserved') and verified.get('testRecordsCleaned')
    helper('cleanup-backups','backup-cleanup')
    assert b'Success' in adb('uninstall','com.runningart.authdigest')
    # Exact QA paths only. Never touch user files or app data here.
    temporary=['/sdcard/runpen-share-ui.xml','/sdcard/runpen-share-screen.png','/data/local/tmp/runpen-phone-ui.xml','/data/local/tmp/running-qa.xml','/data/local/tmp/running-ui-dump.jar','/data/local/tmp/drawing-gesture.jar','/data/local/tmp/runpen-phone-fixture.json']
    adb('shell','rm','-f',*temporary)
    for path in temporary:
        assert adb('shell','sh','-c',"'if [ -e "+path+" ]; then echo EXISTS; fi'").strip()!=b'EXISTS'
    open_page('account')
    package=adb('shell','pm','path',q.APP).decode().strip().removeprefix('package:')
    assert package.startswith('/data/app/') and package.endswith('/base.apk') and '\n' not in package
    digest=adb('shell','sha256sum',package).decode().split()[0]
    assert digest=='427902bff967b436198e814e4e114de8430a5c2cb72389a282ba0cffe2faa7b9'
    network={key:adb('shell','settings','get','global',key).decode().strip() for key in ['wifi_on','mobile_data','airplane_mode_on']}
    assert network=={'wifi_on':'1','mobile_data':'1','airplane_mode_on':'0'}
    services=adb('shell','dumpsys','activity','services',q.APP).decode()
    assert '(nothing)' in services
    assert not adb('shell','pm','list','packages','com.runningart.authdigest').strip()
    final={'apkSha256':digest,'networkRestored':True,'helperRemoved':True,'qaFilesRemoved':True,'appServicesNone':True}
    (OUT/'device-final.json').write_text(json.dumps(final,indent=2),encoding='utf-8');print(json.dumps(final),flush=True)

if __name__=='__main__':
    action=sys.argv[1]; value=sys.argv[2] if len(sys.argv)>2 else 'screen'
    if action=='prepare':
        for src,name in [('running-qa/ui-dump.jar','running-ui-dump.jar'),('custom-drawing-qa/drawing-gesture.jar','drawing-gesture.jar')]:
            adb('push',str(ROOT/'.cache'/src),'/data/local/tmp/'+name)
    elif action=='open':open_page(value);capture('opened-'+value.replace('/','-'))
    elif action=='tap':tap(value)
    elif action=='capture':capture(value)
    elif action=='top':top()
    elif action=='draw':draw(value)
    elif action=='scroll':scroll()
    elif action=='drawing-flow':drawing_flow()
    elif action=='save-custom':save_custom()
    elif action=='helper':helper(value,sys.argv[3] if len(sys.argv)>3 else value)
    elif action=='fill':fill(value,sys.argv[3])
    elif action=='offline-flow':offline_flow()
    elif action=='share-flow':share_flow()
    elif action=='cleanup-fixtures':cleanup_fixtures()
    elif action=='cancel-flow':cancel_flow()
    elif action=='finish-device':finish_device()
    else:raise ValueError(action)
