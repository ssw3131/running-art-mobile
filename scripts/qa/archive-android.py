"""Archive release UI evidence on dedicated, offline synthetic emulators only."""
import importlib.util
import json
import pathlib
import re
import shutil
import sqlite3
import sys
import time

root=pathlib.Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('archive_ui_base',root/'scripts/qa/service-s0.py')
q=importlib.util.module_from_spec(spec);spec.loader.exec_module(q)
api=sys.argv[1]
assert api in ['36','29']
q.SERIAL='emulator-5590' if api=='36' else 'emulator-5592'
q.OUT=root/f'test-results/archive/android{api}';q.OUT.mkdir(parents=True,exist_ok=True)
assert q.adb('emu','avd','name').decode().splitlines()[0]=='RunPen_Archive'+api
manifest=json.loads((root/'.cache/archive-fixture/manifest.json').read_text())

def seek(key):
    for i in range(24):
        tree=q.capture('current')
        node=q.find(tree,key)
        tab=q.find(tree,'tab-home');bottom=int(re.findall(r'\d+',tab.get('bounds'))[1])-12 if tab is not None else 2040
        if node is not None:
            x1,y1,x2,y2=map(int,re.findall(r'\d+',node.get('bounds')))
            if y2-y1>=30 and 150<y1<y2<bottom:return tree
            if y2<600:
                q.shell('input','swipe','520','900','520','1400','600');continue
        q.shell('input','swipe','520','1400','520','900','600')
    raise RuntimeError('Not reached: '+key)
q.seek=seek
def has(tree,key):
    assert q.find(tree,key) is not None, 'Missing '+key
def absent(tree,key):
    assert q.find(tree,key) is None, 'Unexpected '+key
def launch():
    q.shell('am','start','-n',q.APP+'/.MainActivity');time.sleep(2)
    for _ in range(10):
        tree=q.capture('launch-ready')
        if q.find(tree,'service-home') is not None:return
        time.sleep(1)
    raise RuntimeError('Service home did not finish restoring')
def back():
    q.shell('input','keyevent','4');time.sleep(.8)
def link(path):
    q.shell('am','start','-W','-a','android.intent.action.VIEW','-d','runningart://'+path,q.APP);time.sleep(2)
def inspect_runs():
    q.shell('am','force-stop',q.APP)
    path=q.OUT/'synthetic-inspection.db'
    for suffix in ['-wal','-shm']:pathlib.Path(str(path)+suffix).unlink(missing_ok=True)
    path.write_bytes(q.adb('exec-out','cat',q.DB))
    wal=q.shell('sh','-c','if [ -f '+q.DB+'-wal ]; then cat '+q.DB+'-wal; fi')
    if wal:pathlib.Path(str(path)+'-wal').write_bytes(wal)
    con=sqlite3.connect(path);rows=con.execute('select id,status,course_id from running_sessions').fetchall();con.close()
    return rows
def seed_database(variant='running-art'):
    assert variant in ['running-art','paused','interrupted','deleted','empty']
    q.shell('am','force-stop',q.APP)
    q.adb('push',str(root/f'.cache/archive-fixture/{variant}.db'),'/data/local/tmp/archive-fixture.db')
    folder=q.DB.rsplit('/',1)[0]
    q.shell('mkdir','-p',folder)
    uid=q.shell('stat','-c','%u',f'/data/user/0/{q.APP}').decode().strip()
    q.shell('rm','-f',q.DB+'-wal',q.DB+'-shm')
    q.shell('cp','/data/local/tmp/archive-fixture.db',q.DB)
    q.shell('chown',uid+':'+uid,folder,q.DB)
    q.shell('chmod','660',q.DB)
    q.shell('restorecon','-R',folder)

mode=sys.argv[2]
if mode=='setup':
    q.adb('root');q.adb('wait-for-device')
    q.shell('settings','put','global','airplane_mode_on','1')
    q.shell('svc','wifi','disable');q.shell('svc','data','disable')
    q.shell('wm','size','1080x2160');q.shell('wm','density','480')
    q.shell('settings','put','system','font_scale','1.0')
    # Install a closed copy, so adb cannot lock Gradle's output APK on Windows.
    apk=root/'.cache/archive-apk-ui.apk'
    shutil.copyfile(root/'android/app/build/outputs/apk/release/app-release.apk',apk)
    q.adb('install','-r',str(apk),timeout=120)
    q.adb('install','-r',str(root/'.cache/archive-offline-auth/auth.apk'))
    q.adb('push',str(root/'.cache/running-qa/ui-dump.jar'),'/data/local/tmp/running-ui-dump.jar')
    launch();q.capture('guest-entry')
    q.shell('am','force-stop',q.APP)
    receipt=q.shell('am','instrument','-w','com.runningart.archiveoffline/.ArchiveOfflineAuth').decode()
    assert 'INSTRUMENTATION_CODE: 0' in receipt and 'failure=' not in receipt,receipt
    seed_database();launch()
    tree=q.capture('home-populated');has(tree,'service-home')
    print('Offline synthetic UI setup passed; not an Auth/API success')
elif mode=='capture':
    tree=q.capture(sys.argv[3]);print('\n'.join(n.get('text') or n.get('content-desc') or n.get('resource-id') or '' for n in q.nodes(tree)))
elif mode=='tap':
    if len(sys.argv)>4 and sys.argv[4]=='seek':seek(sys.argv[3])
    q.tap(sys.argv[3]);q.capture('after-tap')
elif mode=='back':back();q.capture('after-back')
elif mode=='seed':seed_database(sys.argv[3] if len(sys.argv)>3 else 'running-art');launch()
elif mode=='generation':
    seed_database();launch();q.tap('tab-courses')
    tree=q.capture('generation-permission')
    if q.find(tree,'Deny') is not None:q.tap('Deny')
    seek('distance-more');q.tap('distance-more');q.tap('distance-input')
    q.shell('input','text','20');back();q.tap('distance-apply')
    tree=q.capture('generation-20km');node=q.find(tree,'distance-value');assert node is not None and '20' in ''.join(n.get('text','') for n in node.iter())
    q.tap('tab-home');q.tap('tab-courses');tree=q.capture('generation-conditions-restored');has(tree,'distance-value')
    absent(tree,'generation-options');absent(tree,'route-diagnostics')
    (q.OUT/'generation-checks.json').write_text(json.dumps(['20km distance input and tab return preserve conditions','service does not expose device/offline calculation switches'],indent=2),encoding='utf8')
    print('20km input and service options verified; no online calculation claimed')
elif mode=='native':
    seed_database();q.shell('am','force-stop',q.APP)
    link('courses/'+manifest['courses'][1]['id']);time.sleep(8)
    has(q.capture('cold-detail-link'),'course-detail');q.tap('service-back')
    has(q.capture('cold-detail-back-list'),'archive-usage')
    link('courses/'+manifest['courses'][1]['id']);seek('course-export-gpx');q.tap('course-export-gpx');time.sleep(2)
    tree=q.capture('gpx-native-sheet')
    assert any(n.get('package') in ['android','com.android.intentresolver'] for n in q.nodes(tree)), 'Native share chooser missing'
    back();has(q.capture('gpx-cancel-detail'),'course-detail')
    files=q.shell('find',f'/data/user/0/{q.APP}/cache/course-exports','-type','f').decode().splitlines()
    assert files and b'<gpx' in q.shell('cat',files[-1])
    q.shell('am','force-stop',q.APP);link('courses/'+manifest['courses'][1]['id']);time.sleep(8);back()
    has(q.capture('cold-android-back-list'),'archive-usage')
    (q.OUT/'native-checks.json').write_text(json.dumps(['cold course link survives account restore','header and Android cold fallback to saved list','offline GPX bytes and native share cancellation'],ensure_ascii=False,indent=2),encoding='utf8')
    print('Cold links and offline GPX native sheet passed')
elif mode=='accessibility':
    seed_database();q.shell('cmd','uimode','night','yes');q.shell('settings','put','system','font_scale','1.4');launch()
    q.capture('dark-large-home');q.tap('tab-archive');q.capture('dark-large-saved')
    q.tap('완주 기록');q.capture('dark-large-finished');q.tap('run-row-'+manifest['runs'][-1]['id']);q.capture('dark-large-trophy')
    q.shell('settings','put','system','font_scale','1.0');q.shell('cmd','uimode','night','no')
    q.shell('am','force-stop',q.APP);launch();link('courses/'+manifest['courses'][3]['id']);q.capture('long-name-detail-final')
    time.sleep(22);q.capture('offline-course-path')
    q.tap('service-back');q.tap('tab-home');q.tap('usage-save');q.capture('usage-sheet')
    print('360dp dark/font1.4, long-name detail, offline route and usage sheet captured')
elif mode=='recovery':
    checks=[]
    for variant in ['paused','interrupted']:
        seed_database(variant);launch();link('courses/'+manifest[variant]['courseId'])
        seek('course-run');has(q.capture(variant+'-detail-actions'),'이 코스 러닝 이어하기');q.tap('course-run')
        tree=q.capture(variant+'-run-restored');has(tree,'run-start')
        rows=inspect_runs();assert any(row[0]==manifest[variant]['id'] and row[1]==variant for row in rows);assert len(rows)==6
        launch();q.tap('tab-run');has(q.capture(variant+'-restart'),'run-start')
        checks.append(variant+': same session persists, no automatic resume or new run')
    link('courses/'+manifest['courses'][1]['id']);seek('course-run');q.tap('course-run');has(q.capture('other-active-conflict'),'진행 중인 러닝이 있어요');q.tap('취소')
    checks.append('different course active run conflict')
    seed_database('deleted');launch();run=manifest['runs'][-1];link('courses/'+run['courseId']+'?runId='+run['id'])
    seek('course-save');tree=q.capture('deleted-source-copy');has(tree,'course-save');absent(tree,'course-run')
    q.tap('course-save');time.sleep(16);tree=q.capture('offline-save-blocked');has(tree,'course-save');has(tree,'course-detail-error')
    checks.append('deleted source remains read-only until explicit save; offline new save blocked')
    seed_database('empty');launch();q.tap('tab-archive');has(q.capture('empty-saved'),'courses-empty');q.tap('완주 기록');has(q.capture('empty-finished'),'runs-empty')
    checks.append('empty saved and finished states')
    (q.OUT/'recovery-checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(checks,ensure_ascii=False))
elif mode=='extended':
    checks=[]
    q.tap('tab-archive');q.tap('저장 코스')
    key='course-row-'+manifest['courses'][0]['id']
    if q.find(q.capture('page-check'),key) is None:seek('더 보기');q.tap('더 보기')
    seek(key)
    tree=q.capture('saved-last-page');has(tree,'미완주');before=q.find(tree,key).get('bounds')
    q.tap(key);q.capture('unfinished-detail-top');seek('course-run');tree=q.capture('unfinished-detail-actions');has(tree,'이 코스 러닝 이어하기')
    q.tap('course-run');tree=q.capture('stopped-new-challenge');has(tree,'이전 러닝은 종료되어 새 도전으로 시작합니다.');q.tap('취소')
    q.tap('service-back');tree=q.capture('saved-scroll-restored');assert q.find(tree,key).get('bounds')==before
    checks.append('34-course pagination, unfinished stopped label, new-challenge notice, exact list scroll restoration')
    long='course-row-'+manifest['courses'][3]['id'];seek(long);q.tap(long);q.capture('long-name-detail');q.tap('service-back')
    q.tap('tab-home');run=manifest['runs'][-1];seek('home-run-'+run['id']);q.tap('home-run-'+run['id']);has(q.capture('home-course-detail'),'course-detail');q.tap('service-back');has(q.capture('detail-back-home'),'service-home')
    checks.append('long name and home linked course direct detail/back')
    (q.OUT/'extended-checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(checks,ensure_ascii=False))
elif mode=='check':
    checks=[]
    q.tap('tab-home')
    q.tap('home-more-runs');tree=q.capture('more-runs-to-saved');has(tree,'저장 코스');has(tree,'archive-usage');has(tree,'service-back');checks.append('home recent-run more opens saved courses')
    q.tap('service-back');tree=q.capture('more-back-home');has(tree,'service-home');checks.append('header returns to home')
    q.tap('home-more-courses');tree=q.capture('more-courses-to-saved');has(tree,'archive-usage');back();has(q.capture('android-back-home'),'service-home');checks.append('home recent-saved more and Android back')
    q.tap('tab-archive');tree=q.capture('saved-list');has(tree,'archive-usage')
    q.tap('완주 기록');tree=q.capture('finished-list');has(tree,'완주 기록');checks.append('completed tab renders')
    for run in manifest['runs']:
        if run['outcome']=='finished':has(tree,'run-row-'+run['id'])
        else:absent(tree,'run-row-'+run['id'])
    checks.append('only 3 completed course records; stopped/free excluded')
    first=next(r for r in manifest['runs'] if r['outcome']=='finished')
    q.tap('run-row-'+first['id']);tree=q.capture('first-badge');has(tree,'completion-first-badge');checks.append('first completion badge')
    back();has(q.capture('record-back-list'),'완주 기록')
    last=manifest['runs'][-1];q.tap('run-row-'+last['id']);tree=q.capture('later-trophy');has(tree,'completion-trophy');back();checks.append('repeat completion trophy')
    q.tap('저장 코스');tree=q.capture('saved-tab-restored');has(tree,'archive-usage')
    checks.append('saved tab restored')
    (q.OUT/'checks.json').write_text(json.dumps({'fixture':'synthetic offline only','api':api,'checks':checks},ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps(checks,ensure_ascii=False))
else:raise RuntimeError('Unknown mode')
