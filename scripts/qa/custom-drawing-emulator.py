"""Only emulator-5556. Back up and restore existing SQLite, no phone or cloud writes."""
import hashlib, importlib.util, json, pathlib, re, sqlite3, sys, time

ROOT = pathlib.Path.cwd()
spec = importlib.util.spec_from_file_location('drawing_base', ROOT / 'scripts/qa/guidance-emulator.py')
q = importlib.util.module_from_spec(spec); spec.loader.exec_module(q)
OUT = ROOT / '.cache/custom-drawing-qa'; OUT.mkdir(exist_ok=True); q.OUT = OUT
adb, APP = q.adb, q.APP

def database(name):
    q.snapshot(name)
    db = sqlite3.connect(OUT / name / 'running-art.db'); db.row_factory = sqlite3.Row
    return db

def prepare():
    assert not (OUT / 'original.db').exists(), 'Never overwrite the original backup'
    adb('shell','am','force-stop',APP)
    db = database('before')
    assert db.execute("SELECT count(*) FROM running_sessions WHERE status!='completed'").fetchone()[0] == 0
    assert db.execute('SELECT count(*) FROM sync_accounts WHERE enabled=1').fetchone()[0] == 0
    with sqlite3.connect(OUT / 'original.db') as dest: db.backup(dest)
    db.close()
    adb('push',str(ROOT / '.cache/running-qa/ui-dump.jar'),'/data/local/tmp/running-ui-dump.jar')
    adb('push',str(OUT / 'drawing-gesture.jar'),'/data/local/tmp/drawing-gesture.jar')
    print('Emulator SQLite backed up; sync disabled',flush=True)

def open_page(page):
    adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d','runningart:///'+page,APP);time.sleep(3)

def top():
    for _ in range(5): adb('shell','input','swipe','1060','1420','1060','2200','130')

def nodes(): return list(q.ui().iter('node'))
def find(key): return next((n for n in nodes() if key in (n.get('resource-id'),n.get('text'),n.get('content-desc'))),None)
def tap(key):
    for _ in range(18):
        n = find(key)
        if n is not None:
            x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds')))
            if n.get('enabled')=='true' and y2-y1>=30 and y2<2340:
                adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2));time.sleep(.7);return
        adb('shell','input','swipe','1060','2140','1060','1780','150')
    raise RuntimeError('Missing control '+key)

def draw(kind='square'):
    canvas=find('drawing-canvas');assert canvas is not None
    x1,y1,x2,y2=map(int,re.findall(r'\d+',canvas.get('bounds')))
    path={'square':[(.18,.18),(.82,.18),(.82,.82),(.18,.82),(.18,.18)],
          'open':[(.18,.18),(.82,.18),(.82,.82)],
          'triangle':[(.5,.15),(.85,.85),(.15,.85),(.5,.15)]}[kind]
    points=';'.join(f'{round(x1+x*(x2-x1))},{round(y1+y*(y2-y1))}' for x,y in path)
    result=adb('shell','uiautomator','runtest','/data/local/tmp/drawing-gesture.jar','/system/framework/android.test.base.jar','-c','DrawingGesture','-e','points',"'"+points+"'")
    assert b'OK (1 test)' in result,result.decode(errors='replace')
    time.sleep(1)

def flow():
    adb('shell','am','force-stop',APP)
    adb('shell','input','keyevent','224');adb('shell','wm','dismiss-keyguard')
    for permission in ['ACCESS_FINE_LOCATION','ACCESS_COARSE_LOCATION','ACCESS_BACKGROUND_LOCATION','POST_NOTIFICATIONS']:
        adb('shell','pm','grant',APP,'android.permission.'+permission)
    origin=json.loads((ROOT/'assets/route-lab/seoul.json').read_text())['origin']
    adb('emu','geo','fix',str(origin['lng']),str(origin['lat']),'0','10')
    open_page('route-lab');time.sleep(5)
    tap('shape-custom');q.capture('drawing-empty')
    assert find('drawing-apply').get('enabled')=='false'
    draw('open');q.capture('drawing-open-rejected');assert find('drawing-invalid') is not None
    assert find('drawing-apply').get('enabled')=='false'
    tap('drawing-clear');assert find('drawing-apply').get('enabled')=='false'
    draw();q.capture('drawing-square');assert find('drawing-valid') is not None
    print('Touch input: empty/open/clear/closed passed',flush=True)
    tap('drawing-apply');assert find('selected-custom-shape') is not None
    top();tap('shape-custom');draw('triangle');tap('drawing-cancel')
    top();tap('shape-custom');q.capture('drawing-cancel-preserved');tap('drawing-apply')
    top();tap('distance-3');tap('calculate-route');tap('cancel-route')
    assert find('calculation-cancelled') is not None
    top();tap('calculate-route')
    started=time.monotonic()
    while time.monotonic()-started<150:
        if find('calculation-done') is not None:break
        if find('calculation-error') is not None:raise RuntimeError(q.capture('calculation-error'))
        time.sleep(2)
    else:raise RuntimeError('Calculation timeout')
    calculation_seconds=round(time.monotonic()-started,1)
    print('Custom road calculation finished',flush=True)
    tap('candidate-0');q.capture('custom-candidate');tap('course-save')
    db=database('saved');row=db.execute("SELECT * FROM saved_courses WHERE shape='custom' ORDER BY created_at DESC LIMIT 1").fetchone();assert row
    snapshot=json.loads(row['snapshot_json']);db.close()
    assert snapshot['schemaVersion']==3 and snapshot['shape']=='custom' and snapshot['source']=='osm'
    # Cancelled triangle did not replace the committed square.
    for x,y in [(-1,1),(1,1),(1,-1),(-1,-1)]:
        assert any(abs(p['x']-x)<.2 and abs(p['y']-y)<.2 for p in snapshot['customTemplate']),snapshot['customTemplate']
    assert snapshot['roadSegments'] and snapshot['route'][0]==snapshot['route'][-1]
    tap('course-save');assert any('이미 저장한 코스' in n.get('text','') for n in nodes())
    (OUT/'selected.json').write_text(json.dumps(dict(row),ensure_ascii=False),encoding='utf-8')
    adb('shell','am','force-stop',APP);open_page('courses/'+row['id']);q.capture('saved-reopened')
    assert any('직접 그린 도형' in n.get('text','') for n in nodes())
    start=snapshot['route'][0];adb('emu','geo','fix',str(start[0]),str(start[1]),'0','10')
    tap('course-run')
    for _ in range(5): adb('emu','geo','fix',str(start[0]),str(start[1]),'0','10');time.sleep(1)
    q.capture('custom-run-ready');tap('run-course-start');tap('계속')
    for _ in range(4):adb('emu','geo','fix',str(start[0]),str(start[1]),'0','10');time.sleep(1)
    db=database('running');run=db.execute("SELECT * FROM running_sessions WHERE status='running'").fetchone();assert run and run['course_id']==row['id']
    assert json.loads(run['course_snapshot_json'])==snapshot;db.close()
    q.capture('custom-run-started');tap('run-finish');tap('종료·저장')
    db=database('completed');assert db.execute('SELECT status FROM running_sessions WHERE id=?',(run['id'],)).fetchone()[0]=='completed';db.close()
    report={'status':'passed','courseId':row['id'],'shape':'custom','templatePoints':len(snapshot['customTemplate']),
        'routePoints':len(snapshot['route']),'actualKm':snapshot['lengthKm'],'calculationSecondsObserved':calculation_seconds,'runId':run['id']}
    (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report),flush=True)

def restore():
    assert (OUT/'original.db').exists()
    q.install_database(OUT/'original.db');after=q.snapshot('restored')
    before=json.loads((OUT/'before.json').read_text())
    assert after==before,'Original SQLite content mismatch'
    for name in ['running-ui-dump.jar','drawing-gesture.jar','running-qa.xml']:
        adb('shell','rm','-f','/data/local/tmp/'+name)
    print('Original SQLite table counts and content hashes restored',flush=True)

if __name__=='__main__': {'prepare':prepare,'flow':flow,'restore':restore}[sys.argv[1]]()
