"""S2b/c + S3 + S4 acceptance using only the isolated QA emulator."""
import json
import re
import time
import struct
import subprocess
import zlib

def service_s234(q, launch):
    assert q.SERIAL.startswith('emulator-')
    def wait_fixed_control(key, capture, selected=False):
        # Fixed controls can be siblings of a scroll view. Observe them without
        # scrolling that unrelated view or tapping a tab to change the outcome.
        for _ in range(20):
            node=q.find(q.capture(capture),key)
            if node is not None and node.get('enabled')=='true' and (not selected or node.get('selected')=='true'):
                x1,y1,x2,y2=map(int,re.findall(r'\d+',node.get('bounds')))
                if x2>x1>=0 and y2>y1>=0:return
            time.sleep(.5)
        raise AssertionError('Fixed control not ready: '+key)
    # Earlier scenarios cold-start the app, clearing in-memory recommendations.
    # verify_home_result checks regeneration cancellation before those restarts;
    # this scenario enters the next input through the approved home CTA.
    q.tap('tab-home');q.seek('open-route-lab');q.tap('open-route-lab')
    q.seek('shape-heart')
    for shape in ['dog','crown']:
        q.seek('shape-'+shape);q.tap('shape-'+shape)
        assert q.find(q.capture('s2b-selected-'+shape),'shape-'+shape).get('selected')=='true'
    q.seek('distance-10');q.tap('distance-10');q.seek('calculate-route');q.tap('calculate-route')
    q.capture('s2b-ten-km-confirm');q.tap('generation-confirm-cancel')
    q.seek('shape-image');q.tap('shape-image');q.capture('s2c-image-entry');q.tap('image-shape-pick')
    q.capture('s2c-system-picker');q.shell('input','keyevent','4');q.tap('image-shape-cancel')
    image_acceptance(q)
    q.tap('tab-run')
    entry=json.loads((q.ROOT/'.cache/free-loop-qa/fixture.json').read_text(encoding='utf8'))
    lng,lat=entry['snapshot']['route'][0]
    def fix(n=3):
        for _ in range(n):q.adb('emu','geo','fix',str(lng),str(lat),'0','10');time.sleep(1)
    q.seek('run-saved-course-'+entry['id']);q.tap('run-saved-course-'+entry['id'])
    assert q.find(q.capture('s4-selected-course'),'run-saved-course-'+entry['id']).get('selected')=='true'
    wait_fixed_control('run-selected-start','s4-selected-start')
    q.tap('run-selected-start');q.tap('run-preparation-confirm')
    fix();wait_fixed_control('run-course-start','s4-start-ready');q.tap('run-course-start');q.tap('계속');fix(5)
    row=q.query("SELECT id,status,guidance_options_json FROM running_sessions WHERE status <> 'completed'")[0]
    run_id=row['id'];assert row['status']=='running';q.capture('s4-map')
    # Real accepted GPS samples, not the simulation screen or checkpoint path.
    # Move only the dedicated emulator; never any attached physical handset.
    for i in range(1,7):
        q.adb('emu','geo','fix',str(lng),str(lat+i*.00015),'0','10');time.sleep(2)
    recorded=q.query(f"SELECT count(*) n FROM running_points WHERE run_id='{run_id}'")[0]['n']
    assert recorded>=3, 'Accepted GPS samples did not reach storage'
    q.capture('s4-real-gps-colors')
    subprocess.run(['node',str(q.ROOT/'scripts/qa/live-route-colors.mjs'),str(q.OUT/'s4-real-gps-colors.png'),str(q.OUT/'s4-real-gps-colors.json')],check=True)

    q.seek('guidance-recenter');q.tap('guidance-recenter');q.seek('run-pause');q.capture('s4-map-controls')
    def wait_status(expected, target=run_id):
        for _ in range(20):
            state=q.query(f"SELECT status FROM running_sessions WHERE id='{target}'")[0]['status']
            if state==expected:return
            time.sleep(.5)
        raise AssertionError(f'Run status {state}, expected {expected}; see native control capture')
    q.tap('run-pause');wait_status('paused');q.capture('s4-map-paused')
    q.tap('run-start');q.tap('계속');fix(4);wait_status('running')
    q.tap('run-guidance-mode');fix();q.capture('s4-focus')
    q.tap('run-guidance-settings');q.seek('run-voice');q.tap('run-voice')
    assert q.find(q.capture('s4-settings-without-background-toggle'),'run-background') is None
    options=json.loads(q.query(f"SELECT guidance_options_json FROM running_sessions WHERE id='{run_id}'")[0]['guidance_options_json'])
    assert options=={'voice':False,'background':True,'mode':'focus'}
    q.seek('run-touch-lock-setting');q.tap('run-touch-lock-setting');q.tap('러닝으로 돌아가기')
    n=q.find(q.capture('s4-touch-locked'),'run-touch-unlock');assert n is not None
    x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds')));x,y=str((x1+x2)//2),str((y1+y2)//2)
    q.shell('input','swipe',x,y,x,y,'1200');fix();assert q.find(q.capture('s4-touch-unlocked'),'run-pause') is not None
    unlocked=json.loads(q.query(f"SELECT guidance_options_json FROM running_sessions WHERE id='{run_id}'")[0]['guidance_options_json'])
    assert unlocked['touchLock'] is False, 'Unlocking must also clear the stored lock setting'
    q.tap('run-pause');wait_status('paused')
    # Explicitly enable the lock again on the paused run before cold recovery.
    q.tap('run-guidance-settings');q.seek('run-touch-lock-setting');q.tap('run-touch-lock-setting');q.tap('러닝으로 돌아가기')
    assert q.find(q.capture('s4-paused-lock-before-restart'),'run-touch-unlock') is not None
    q.shell('am','force-stop',q.APP);launch();q.tap('tab-run');q.capture('s4-restored-paused')
    restored=json.loads(q.query(f"SELECT guidance_options_json FROM running_sessions WHERE id='{run_id}'")[0]['guidance_options_json'])
    assert restored=={'voice':False,'background':True,'mode':'focus','touchLock':True}
    n=q.find(q.capture('s4-restored-lock'),'run-touch-unlock')
    x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds')));x,y=str((x1+x2)//2),str((y1+y2)//2)
    q.shell('input','swipe',x,y,x,y,'1200')
    # Input injection finishes before the JS release handler and SQLite write.
    # The resume control is enabled again only after the settings action settles.
    wait_fixed_control('run-start','s4-restored-unlocked')
    assert q.find(q.capture('s4-restored-unlocked'),'run-touch-unlock') is None
    unlocked=json.loads(q.query(f"SELECT guidance_options_json FROM running_sessions WHERE id='{run_id}'")[0]['guidance_options_json'])
    assert unlocked['touchLock'] is False, f'Unlock setting was not saved: {unlocked}'
    q.tap('run-finish');q.tap('종료·저장');wait_fixed_control('저장 코스','s3-stopped-destination',selected=True)
    launch('runs/'+run_id);q.seek('run-rechallenge');q.capture('s3-run-detail')
    before=q.query(f"SELECT * FROM running_sessions WHERE id='{run_id}'")[0]
    assert before['status']=='completed' and before['course_outcome']=='stopped'
    q.seek('run-rechallenge');q.tap('run-rechallenge');q.tap('run-preparation-confirm');fix();wait_fixed_control('run-course-start','s3-retry-start-ready')
    assert not q.query("SELECT id FROM running_sessions WHERE status <> 'completed'")
    q.tap('run-course-start');q.tap('계속');fix(4)
    newer=q.query("SELECT * FROM running_sessions WHERE status <> 'completed'")[0]
    assert newer['id']!=run_id and newer['course_outcome']=='active'
    assert q.query(f"SELECT * FROM running_sessions WHERE id='{run_id}'")[0]==before
    # A retry is a new run and uses the saved defaults, including touch lock.
    # Unlocking the earlier run does not overwrite these account defaults.
    retry_options=json.loads(newer['guidance_options_json'])
    defaults=json.loads(q.query(f"SELECT preferences_json FROM account_preferences WHERE owner_id='{q.OWNER}'")[0]['preferences_json'])['guidance']
    assert retry_options==defaults, 'The new run must inherit the saved guidance defaults'
    lock=q.find(q.capture('s3-retry-default-lock'),'run-touch-unlock')
    assert (lock is not None)==bool(retry_options.get('touchLock',False))
    if lock is not None:
        x1,y1,x2,y2=map(int,re.findall(r'\d+',lock.get('bounds')));x,y=str((x1+x2)//2),str((y1+y2)//2)
        q.shell('input','swipe',x,y,x,y,'1200')
        wait_fixed_control('run-pause','s3-retry-unlocked')
        assert q.find(q.capture('s3-retry-unlocked'),'run-touch-unlock') is None
        retry_unlocked=json.loads(q.query(f"SELECT guidance_options_json FROM running_sessions WHERE id='{newer['id']}'")[0]['guidance_options_json'])
        assert retry_unlocked['touchLock'] is False, f'Retry unlock setting was not saved: {retry_unlocked}'
    q.tap('run-finish');q.tap('종료·저장');wait_status('completed',newer['id'])
    wait_fixed_control('저장 코스','s3-retry-stopped-destination',selected=True)
    launch('runs/'+newer['id']);q.seek('run-rechallenge')
    assert q.find(q.capture('s3-retry-finished'),'run-rechallenge') is not None
    launch('courses?view=runs');q.capture('s3-monthly-records')
    assert q.find(q.capture('s3-stopped-excluded'),'run-row-'+run_id) is None
    assert q.query(f"SELECT count(*) n FROM running_sessions WHERE id='{run_id}' AND course_outcome='stopped'")[0]['n']==1
    (q.OUT/'s234-result.json').write_text(json.dumps({'runId':run_id,'retryId':newer['id'],'oldRunUnchanged':True,'pickerCancel':True,'restoredOptions':restored,'retryOptions':retry_options}),encoding='utf8')
    q.tap('tab-home')
    print('PASS: S2b/c selectors/picker cancel, S4 map/focus/settings/touch lock/pause restoration and S3 separate retry/monthly records',flush=True)

def image_acceptance(q):
    """Exercise Android's real picker/crop/manipulator with a generated square."""
    def chunk(kind,data):
        return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    raw=b''.join(b'\0'+b''.join(bytes((0,0,0) if 40<x<216 and 40<y<216 else (255,255,255)) for x in range(256)) for y in range(256))
    png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',256,256,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')
    fixture=q.OUT/'contour-qa.png';fixture.write_bytes(png)
    path='/sdcard/Pictures/runpen-contour-qa.png'
    try:
        q.adb('push',str(fixture),path)
        q.shell('am','broadcast','-a','android.intent.action.MEDIA_SCANNER_SCAN_FILE','-d','file://'+path)
        q.seek('shape-image');q.tap('shape-image');q.tap('image-shape-pick')
        photos=[]
        for _ in range(5):
            tree=q.capture('s2c-positive-picker')
            photos=[n.get('content-desc') for n in tree.iter('node') if n.get('content-desc','').startswith('Photo taken on')]
            if photos:break
            time.sleep(1)
        assert len(photos)==1, 'Dedicated QA picker must contain only the generated image'
        q.tap(photos[0]);q.capture('s2c-native-crop');q.tap(q.APP+':id/crop_image_menu_crop')
        for _ in range(5):
            tree=q.capture('s2c-contour-preview');apply=q.find(tree,'image-shape-apply')
            if apply is not None and apply.get('enabled')=='true':break
            time.sleep(1)
        assert apply is not None and apply.get('enabled')=='true','Real native image did not produce a usable contour'
        assert q.find(tree,'image-shape-edit') is not None
        q.tap('image-shape-apply');q.capture('s2c-applied-outline');q.seek('calculate-route');q.tap('calculate-route')
        q.capture('s2c-outline-confirm');q.tap('generation-confirm-cancel')
    finally:
        q.shell('content','delete','--uri','content://media/external/images/media','--where',"_display_name='runpen-contour-qa.png'")
        q.shell('rm','-f',path)
