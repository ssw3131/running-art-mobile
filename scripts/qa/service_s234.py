"""S2b/c + S3 + S4 acceptance using only the isolated QA emulator."""
import json
import re
import time
from home_states import seek_above

def service_s234(q, launch):
    assert q.SERIAL.startswith('emulator-')
    q.tap('tab-courses');q.tap('조건 설정')
    seek_above(q,'shape-heart')
    for shape in ['dog','person','bone','turtle','icecream','strawberry','cloud','crown']:
        q.seek('shape-'+shape);q.tap('shape-'+shape)
        assert q.find(q.capture('s2b-selected-'+shape),'shape-'+shape).get('selected')=='true'
    seek_above(q,'distance-10');q.tap('distance-10');q.tap('calculate-route')
    q.capture('s2b-ten-km-confirm');q.tap('generation-confirm-cancel')
    q.seek('shape-image');q.tap('shape-image');q.capture('s2c-image-entry');q.tap('image-shape-pick')
    q.capture('s2c-system-picker');q.shell('input','keyevent','4');q.tap('image-shape-cancel')
    q.tap('tab-run')
    entry=json.loads((q.ROOT/'.cache/free-loop-qa/fixture.json').read_text(encoding='utf8'))
    lng,lat=entry['snapshot']['route'][0]
    def fix(n=3):
        for _ in range(n):q.adb('emu','geo','fix',str(lng),str(lat),'0','10');time.sleep(1)
    fix();q.seek('run-course-start');q.tap('run-course-start');q.tap('계속');fix(5)
    row=q.query("SELECT id,status,guidance_options_json FROM running_sessions WHERE status <> 'completed'")[0]
    run_id=row['id'];assert row['status']=='running';q.capture('s4-map')
    q.tap('run-guidance-settings');q.seek('run-guidance-mode');q.tap('run-guidance-mode')
    q.tap('러닝으로 돌아가기');fix();q.capture('s4-focus')
    q.tap('run-guidance-settings');q.seek('run-voice');q.tap('run-voice');q.seek('run-background');q.tap('run-background')
    options=json.loads(q.query(f"SELECT guidance_options_json FROM running_sessions WHERE id='{run_id}'")[0]['guidance_options_json'])
    assert options=={'voice':False,'background':False,'mode':'focus'}
    q.tap('run-background');q.seek('run-touch-lock');q.tap('run-touch-lock')
    n=q.find(q.capture('s4-touch-locked'),'run-touch-unlock');assert n is not None
    x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds')));x,y=str((x1+x2)//2),str((y1+y2)//2)
    q.shell('input','swipe',x,y,x,y,'1200');fix();assert q.find(q.capture('s4-touch-unlocked'),'run-pause') is not None
    q.tap('run-pause');assert q.query(f"SELECT status FROM running_sessions WHERE id='{run_id}'")[0]['status']=='paused'
    q.shell('am','force-stop',q.APP);launch();q.tap('tab-run');q.capture('s4-restored-paused')
    restored=json.loads(q.query(f"SELECT guidance_options_json FROM running_sessions WHERE id='{run_id}'")[0]['guidance_options_json'])
    assert restored=={'voice':False,'background':True,'mode':'focus'}
    q.tap('run-finish');q.tap('종료·저장');q.capture('s3-run-detail')
    before=q.query(f"SELECT * FROM running_sessions WHERE id='{run_id}'")[0]
    assert before['status']=='completed' and before['course_outcome']=='stopped'
    q.seek('run-rechallenge');q.tap('run-rechallenge');fix();q.seek('run-course-start')
    assert not q.query("SELECT id FROM running_sessions WHERE status <> 'completed'")
    q.tap('run-course-start');q.tap('계속');fix(4)
    newer=q.query("SELECT * FROM running_sessions WHERE status <> 'completed'")[0]
    assert newer['id']!=run_id and newer['course_outcome']=='active'
    assert q.query(f"SELECT * FROM running_sessions WHERE id='{run_id}'")[0]==before
    q.tap('run-finish');q.tap('종료·저장');launch('courses?view=runs');q.capture('s3-monthly-records')
    assert q.find(q.capture('s3-monthly-retry-record'),'run-row-'+run_id) is not None
    (q.OUT/'s234-result.json').write_text(json.dumps({'runId':run_id,'retryId':newer['id'],'oldRunUnchanged':True,'pickerCancel':True,'restoredOptions':restored}),encoding='utf8')
    q.tap('tab-home')
    print('PASS: S2b/c selectors/picker cancel, S4 map/focus/settings/touch lock/pause restoration and S3 separate retry/monthly records',flush=True)
