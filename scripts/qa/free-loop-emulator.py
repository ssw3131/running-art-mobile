"""Explicit emulator-5556 only. Preserve original application SQLite; never a phone."""
import argparse, hashlib, importlib.util, json, pathlib, re, sqlite3, subprocess, time
ROOT=pathlib.Path.cwd()
spec=importlib.util.spec_from_file_location('base',ROOT/'scripts/qa/guidance-emulator.py')
q=importlib.util.module_from_spec(spec);spec.loader.exec_module(q)
OUT=ROOT/'.cache/free-loop-qa';OUT.mkdir(exist_ok=True);q.OUT=OUT
adb=q.adb;APP=q.APP

def db_snapshot(name):
    q.snapshot(name)
    db=sqlite3.connect(OUT/name/'running-art.db');db.row_factory=sqlite3.Row
    return db

def backup():
    target=OUT/'original.db'
    if target.exists():raise RuntimeError('Do not replace the original backup')
    adb('shell','am','force-stop',APP)
    db=db_snapshot('original')
    assert db.execute("SELECT count(*) FROM running_sessions WHERE status!='completed'").fetchone()[0]==0
    assert db.execute("SELECT count(*) FROM sync_accounts WHERE enabled=1").fetchone()[0]==0,'Requires sync-disabled QA emulator'
    with sqlite3.connect(target) as dest:db.backup(dest)
    report={'version':db.execute('PRAGMA user_version').fetchone()[0], 'tables':{t:db.execute('SELECT count(*) FROM '+t).fetchone()[0] for t in ['saved_courses','running_sessions','running_points','storage_test_notes']}}
    db.close();print(json.dumps(report),flush=True)

def seed():
    f=json.loads((OUT/'fixture.json').read_text(encoding='utf-8'));s=f['snapshot']
    original=sqlite3.connect(OUT/'original.db');dest=sqlite3.connect(OUT/'seeded.db');original.backup(dest);original.close()
    dest.execute('INSERT INTO saved_courses(id,name,source,shape,target_km,length_km,score,snapshot_json,snapshot_hash,created_at,updated_at,owner_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
        (f['id'],f['name'],s['source'],s['shape'],s['targetKm'],s['lengthKm'],s['score'],f['json'],f['hash'],1791090000000,1791090000000,''))
    dest.commit();dest.close();q.install_database(OUT/'seeded.db');print('Public fixture seeded',flush=True)

def fix(point):adb('emu','geo','fix',str(point[0]),str(point[1]),'0','10')
def tap(key):
    for _ in range(18):
        tree=q.ui();nodes=[n for n in tree.iter('node') if key in (n.get('resource-id'),n.get('text'),n.get('content-desc'))]
        for n in nodes:
            x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds')))
            if n.get('enabled')=='true' and y2-y1>=35 and y1>=100 and y2<2340:
                adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2));time.sleep(.8);return
        adb('shell','input','swipe','1060','2100','1060','1750','180');time.sleep(.2)
    raise RuntimeError('No enabled control: '+key)

def top():
    for _ in range(5):adb('shell','input','swipe','1060','700','1060','2200','140')

def open_run(which):
    f=json.loads((OUT/'fixture.json').read_text(encoding='utf-8'));point=f[which][0]
    adb('shell','input','keyevent','224');adb('shell','wm','dismiss-keyguard')
    adb('shell','svc','wifi','enable');adb('shell','svc','data','enable')
    adb('shell','settings','put','secure','location_mode','3')
    for p in ['ACCESS_FINE_LOCATION','ACCESS_COARSE_LOCATION','ACCESS_BACKGROUND_LOCATION','POST_NOTIFICATIONS']:adb('shell','pm','grant',APP,'android.permission.'+p)
    fix(point);adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d','runningart:///run?courseId='+f['id'],APP);time.sleep(4)
    for _ in range(5):fix(point);time.sleep(1)
    top();q.capture('ready-'+which);tap('run-course-start');tap('계속')
    for _ in range(6):fix(point);time.sleep(1)
    db=db_snapshot('started-'+which);row=db.execute("SELECT status,guidance_json FROM running_sessions WHERE status!='completed'").fetchone();db.close()
    assert row and row['status']=='running';state=json.loads(row['guidance_json']);assert state['version']==2
    print(json.dumps({'start':which,'phase':state['phase']}),flush=True)

def hav(a,b):
    import math
    r=math.pi/180;h=math.sin((a[1]-b[1])*r/2)**2+math.cos(a[1]*r)*math.cos(b[1]*r)*math.sin((a[0]-b[0])*r/2)**2
    return 12742000*math.asin(min(1,math.sqrt(h)))

def replay(which,locked=False):
    f=json.loads((OUT/'fixture.json').read_text(encoding='utf-8'));route=f[which];c=[0]
    for a,b in zip(route,route[1:]):c.append(c[-1]+hav(a,b))
    if locked:
        adb('shell','svc','wifi','disable');adb('shell','svc','data','disable');adb('shell','input','keyevent','223')
    started=time.monotonic();report_at=0;index=0;samples=[];m=0;dwell=0
    while dwell<10:
        elapsed=time.monotonic()-started
        while index<len(route)-2 and c[index+1]<m:index+=1
        t=max(0,min(1,(m-c[index])/max(.001,c[index+1]-c[index])));fix([route[index][j]+(route[index+1][j]-route[index][j])*t for j in range(2)])
        if elapsed>=report_at:
            db=db_snapshot('current');row=db.execute('SELECT status,course_outcome,distance_m,active_ms,guidance_json FROM running_sessions WHERE course_id=? ORDER BY started_at DESC LIMIT 1',(f['id'],)).fetchone();db.close()
            s=json.loads(row['guidance_json']);sample={'elapsed':round(elapsed,1),'status':row['status'],'phase':s['phase'],'progress':round(s['progress'],1),'direction':s['direction'],'distance':row['distance_m']};samples.append(sample);print(json.dumps(sample),flush=True);report_at+=20
        if m>=c[-1]:dwell+=1
        m=min(c[-1],m+4);time.sleep(1)
    db=db_snapshot('finished-'+which);row=db.execute('SELECT status,course_outcome,guidance_json FROM running_sessions WHERE course_id=? ORDER BY started_at DESC LIMIT 1',(f['id'],)).fetchone();db.close()
    (OUT/('replay-'+which+'.json')).write_text(json.dumps({'locked':locked,'samples':samples,'final':dict(row)},indent=2))
    s=json.loads(row['guidance_json']);assert row['status']=='paused' and row['course_outcome']=='arrival-pending',dict(row)
    assert s['direction']==(1 if which=='forward' else -1)
    adb('shell','input','keyevent','224');adb('shell','wm','dismiss-keyguard');time.sleep(2);top();q.capture('arrived-'+which)
    print('Arrival confirmed: '+which,flush=True)

def finish_run():
    tap('run-finish');tap('종료·저장');time.sleep(2);q.capture('result')

def active(name):
    db=db_snapshot(name);row=db.execute("SELECT * FROM running_sessions WHERE status!='completed' ORDER BY started_at DESC LIMIT 1").fetchone();db.close()
    if not row:raise RuntimeError('No active run')
    return dict(row),json.loads(row['guidance_json'])

def drive(path,step=4):
    cumulative=[0]
    for a,b in zip(path,path[1:]):cumulative.append(cumulative[-1]+hav(a,b))
    index=0;m=0
    while m<cumulative[-1]:
        while index<len(path)-2 and cumulative[index+1]<m:index+=1
        t=(m-cumulative[index])/max(.0001,cumulative[index+1]-cumulative[index]);fix([path[index][j]+(path[index+1][j]-path[index][j])*t for j in range(2)])
        m+=step;time.sleep(1)
    for _ in range(6):fix(path[-1]);time.sleep(1)

def approach_flow():
    f=json.loads((OUT/'fixture.json').read_text(encoding='utf-8'));a=json.loads((OUT/'approach.json').read_text(encoding='utf-8'));point=a['position']
    adb('shell','input','keyevent','224');adb('shell','wm','dismiss-keyguard');adb('shell','svc','wifi','enable');adb('shell','svc','data','enable')
    fix(point);adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d','runningart:///run?courseId='+f['id'],APP);time.sleep(4)
    for _ in range(5):fix(point);time.sleep(1)
    top();tap('run-prepare-path');time.sleep(5);q.capture('approach-ready');tap('run-course-start');tap('계속')
    for _ in range(6):fix(point);time.sleep(1)
    row,s=active('approach-started');assert s['phase']=='approach' and s['navigation'];path=s['navigation']['path'];print(json.dumps({'phase':s['phase'],'pathM':s['navigation']['distanceM']}),flush=True)
    # Record a prefix, prove access is GPS distance but not lap progress.
    drive(path[:3]);row,s=active('approach-prefix');assert row['distance_m']>5 and s['progress']==0
    drive(path[2:]);row,s=active('joined');assert s['phase']=='direction',s
    # Pick the original course direction from this join, then interrupt off-course.
    course=f['snapshot']['route'];c=[0]
    for x,y in zip(course,course[1:]):c.append(c[-1]+hav(x,y))
    m=a['plan']['targetM'];lap=[]
    for delta in range(0,45,4):
        at=(m+delta)%c[-1];i=0
        while i<len(course)-2 and c[i+1]<at:i+=1
        t=(at-c[i])/max(.00001,c[i+1]-c[i]);lap.append([course[i][j]+(course[i+1][j]-course[i][j])*t for j in range(2)])
    drive(lap);row,s=active('before-interruption');assert s['phase']=='lap';before=s['progress']
    adb('shell','am','force-stop',APP);fix(point);time.sleep(2)
    adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d','runningart:///run',APP);time.sleep(4)
    for _ in range(4):fix(point);time.sleep(1)
    row,s=active('interrupted');assert row['status']=='interrupted' and s['progress']==before
    tap('run-start');tap('계속')
    for _ in range(12):fix(point);time.sleep(1)
    row,s=active('return-route');assert s['phase']=='return' and s['navigation'] and s['progress']==before
    return_path=s['navigation']['path'];top();q.capture('return-guidance');drive(return_path)
    row,s=active('returned');assert s['phase']=='lap' and abs(s['progress']-before)<1
    (OUT/'approach-recovery.json').write_text(json.dumps({'accessDistance':a['plan']['distanceM'],'progressBefore':before,'progressAfter':s['progress'],'recordedDistance':row['distance_m'],'returnPoints':len(return_path),'checkpointVersion':s['version']},indent=2))
    top();q.capture('returned');finish_run();print('Access, interruption and shortest return passed',flush=True)

def restore():
    adb('shell','am','force-stop',APP);q.install_database(OUT/'original.db');actual=q.snapshot('restored')
    expected=json.loads((OUT/'original.json').read_text(encoding='utf-8'));assert actual==expected,(actual,expected)
    adb('shell','svc','wifi','enable');adb('shell','svc','data','enable')
    print('Original table hashes restored',flush=True)

def generate():
    db=db_snapshot('generation-before');before=db.execute('SELECT count(*) FROM saved_courses').fetchone()[0]
    assert db.execute("SELECT count(*) FROM running_sessions WHERE status!='completed'").fetchone()[0]==0;db.close()
    adb('shell','svc','wifi','enable');adb('shell','svc','data','enable')
    adb('shell','am','force-stop',APP)
    adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d','runningart:///route-lab',APP);time.sleep(6)
    def flow_tap(key):
        # Gestures stay in the lower panel so the map center remains unchanged.
        for _ in range(5):adb('shell','input','swipe','1060','1450','1060','2200','160')
        tap(key)
    flow_tap('route-diagnostics');flow_tap('sample-seoul-gangnam');flow_tap('distance-5');flow_tap('shape-heart')
    flow_tap('calculate-route');tap('cancel-route');time.sleep(1)
    adb('shell','input','swipe','1060','2150','1060','1750','180')
    assert any(n.get('resource-id')=='calculation-cancelled' for n in q.ui().iter('node'))
    flow_tap('calculate-route');started=time.monotonic()
    adb('shell','input','swipe','1060','2150','1060','1750','180')
    while time.monotonic()-started<180:
        tree=q.ui();ids=[n.get('resource-id') for n in tree.iter('node')]
        if 'calculation-done' in ids:break
        if 'calculation-error' in ids:raise RuntimeError(q.capture('generation-error'))
        time.sleep(2)
    else:raise RuntimeError('Calculation timeout')
    elapsed=time.monotonic()-started
    flow_tap('candidate-1');candidate_text=q.capture('generation-candidate')
    assert '계산 중심 37.49790, 127.02760' in candidate_text
    tap('course-save')
    db=db_snapshot('generation-saved');row=db.execute('SELECT * FROM saved_courses ORDER BY created_at DESC LIMIT 1').fetchone()
    count=db.execute('SELECT count(*) FROM saved_courses').fetchone()[0];db.close()
    assert count in [before,before+1] and row
    course=json.loads(row['snapshot_json']);assert course['schemaVersion']==2 and course['route'][0]==course['route'][-1]
    assert len(course['roadSegments'])==len(course['route'])-1 and all(r['bidirectional'] for r in course['roadSegments'])
    tap('course-save');assert any('이미 저장한 코스' in x for x in q.capture('generation-duplicate'))
    db=db_snapshot('generation-duplicate');assert db.execute('SELECT count(*) FROM saved_courses').fetchone()[0]==count;db.close()
    flow_tap('saved-course-run');time.sleep(3)
    assert '코스 러닝 준비' in q.capture('generation-preparation')
    report={'schemaVersion':course['schemaVersion'],'routePoints':len(course['route']),'roadSegments':len(course['roadSegments']),'lengthKm':course['lengthKm'],'score':course['score'],'targetKm':course['targetKm'],'selectedRank':2,'elapsedSeconds':elapsed,'courseCount':count}
    (OUT/'generation.json').write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['backup','seed','open','replay','finish','restore','capture','approach','generate']);p.add_argument('--direction',default='forward',choices=['forward','reverse']);p.add_argument('--locked',action='store_true');a=p.parse_args()
    if a.action=='backup':backup()
    elif a.action=='seed':seed()
    elif a.action=='open':open_run(a.direction)
    elif a.action=='replay':replay(a.direction,a.locked)
    elif a.action=='finish':finish_run()
    elif a.action=='restore':restore()
    elif a.action=='approach':approach_flow()
    elif a.action=='generate':generate()
    else:print(json.dumps(q.capture('screen'),ensure_ascii=False))
