"""Figma course input and real-route checks on the dedicated QA emulator."""
import json
import base64
import re
import time


def text(q, key, value):
    q.seek(key); q.tap(key)
    result = q.shell('uiautomator', 'runtest', '/data/local/tmp/running-ui-dump.jar',
                     '/system/framework/android.test.base.jar', '-c', 'DrawingGesture',
                     '-e', 'input', key, '-e', 'utf8', base64.b64encode(value.encode('utf8')).decode('ascii'))
    assert b'OK (1 test)' in result


def distance(q, value):
    q.seek('distance-more'); q.tap('distance-more')
    text(q, 'distance-input', str(value)); q.tap('distance-apply')


def inputs(q):
    q.tap('tab-courses'); q.seek('distance-more'); q.tap('distance-more')
    for value in ['0', '21', '40', '11.5']:
        text(q, 'distance-input', value); q.tap('distance-apply')
        assert q.find(q.capture('figma-invalid-' + value.replace('.', '-')), '11~20km 사이의 정수를 입력해 주세요.') is not None
    text(q, 'distance-input', '20'); q.tap('distance-apply')
    assert '20' in q.find(q.capture('figma-distance-20'), 'distance-value').get('text')
    q.tap('distance-more'); text(q, 'distance-input', '15'); q.tap('distance-cancel')
    assert '20' in q.find(q.capture('figma-distance-cancel'), 'distance-value').get('text')
    q.seek('distance-slider')
    slider = q.find(q.capture('figma-slider-before'), 'distance-slider')
    x1,y1,x2,y2 = map(int,re.findall(r'\d+',slider.get('bounds')))
    y = (y1+y2)//2
    q.shell('input','swipe',str(x1+2),str(y),str(x2-2),str(y),'800')
    assert '10' in q.find(q.capture('figma-slider-drag'), 'distance-value').get('text')
    q.tap('distance-1')
    assert '1' in q.find(q.capture('figma-slider-one'), 'distance-value').get('text')
    for shape in ['heart','crown','whale','cat','dog']:
        q.seek('shape-'+shape); q.capture('figma-shape-'+shape)
    q.seek('distance-slider'); q.tap('distance-5')
    print('PASS: Figma numeric range/cancel, actual slider drag/ticks, shape icons',flush=True)


def real_course(q):
    q.tap('tab-courses'); q.seek('route-diagnostics')
    if q.find(q.capture('figma-real-options'), 'route-diagnostics').get('content-desc') == '개발 검증 정보':
        q.tap('route-diagnostics')
    q.seek('dataset-seoul'); q.tap('dataset-seoul')
    q.seek('sample-busan-cityhall'); q.tap('sample-busan-cityhall')
    q.seek('place-search-input'); text(q,'place-search-input','부산시청')
    q.shell('input','keyevent','4'); q.tap('place-search-submit')
    for _ in range(12):
        tree=q.capture('figma-place-search')
        if q.find(tree,'place-result-0') is not None: break
        time.sleep(1)
    else: raise RuntimeError('Korean place search returned no result')
    q.tap('place-result-0'); q.capture('figma-place-selected')
    # Use the public benchmark center so the device result is reproducible.
    q.seek('sample-busan-cityhall'); q.tap('sample-busan-cityhall')
    distance(q,11)
    assert '11' in q.find(q.capture('figma-distance-11'),'distance-value').get('text')
    distance(q,20); q.seek('shape-whale'); q.tap('shape-whale')
    q.tap('calculate-route'); q.capture('figma-real-confirm'); q.tap('generation-confirm')
    started=time.monotonic()
    while time.monotonic()-started<240:
        tree=q.capture('figma-real-progress')
        if q.find(tree,'calculation-done') is not None: break
        if q.find(tree,'calculation-error') is not None: raise RuntimeError('Real route calculation failed')
        time.sleep(2)
    else: raise RuntimeError('Real route calculation exceeded 240 seconds')
    q.seek('candidate-0'); selected=q.find(q.capture('figma-real-results'),'candidate-0').get('content-desc')
    assert '유사도' in selected and '예상 러닝 시간' in selected
    cards=[]
    for index in range(5):
        key='candidate-'+str(index); q.seek(key)
        card=q.find(q.capture('figma-card-'+str(index)),key).get('content-desc')
        assert '유사도' in card and '예상 러닝 시간' in card
        cards.append(card)
    percentages=[int(re.search(r'유사도 (\d+)%',card).group(1)) for card in cards]
    assert percentages==sorted(percentages,reverse=True)
    q.tap('generation-regenerate'); q.capture('figma-regenerate-confirm'); q.tap('generation-confirm-cancel')
    q.tap('generation-run'); q.capture('figma-unsaved-run-detail')
    q.seek('saved-course-run', allow_disabled=True)
    assert q.find(q.capture('figma-save-required'),'saved-course-run').get('enabled')=='false'
    text(q,'course-save-name','FIGMA_WHALE_20'); q.shell('input','keyevent','4')
    q.seek('course-save'); q.tap('course-save')
    saved=q.query("SELECT id,snapshot_json,length_km FROM saved_courses WHERE name='FIGMA_WHALE_20'")
    assert len(saved)==1
    snapshot=json.loads(saved[0]['snapshot_json'])
    assert snapshot['schemaVersion']==4 and snapshot['shape']=='whale' and snapshot['targetKm']==20
    assert 15<=snapshot['lengthKm']<=20
    assert snapshot['route'][0]==snapshot['route'][-1]
    q.seek('saved-course-run'); q.tap('saved-course-run')
    # API29 can expose an empty hierarchy while the tab transition is mounting.
    # Wait for both the selected tab and the saved course, preserving each frame.
    for attempt in range(8):
        tree=q.capture('figma-run-ready-'+str(attempt))
        tab=q.find(tree,'tab-run')
        if tab is not None and tab.get('selected')=='true' and any(
                'FIGMA_WHALE_20' in n.get('text','') for n in tree.iter('node')): break
        time.sleep(.5)
    else: raise RuntimeError('Saved course running preparation did not become ready')
    q.capture('figma-saved-running-preparation')
    (q.OUT/'figma-real-result.json').write_text(json.dumps({'saved':saved[0], 'card':selected,'cards':cards,'saveRequired':True},ensure_ascii=False,indent=2),encoding='utf8')
    print('PASS: actual Korean search, Figma whale 20km, metrics, regenerate cancel, v4 save gate and running preparation',flush=True)
