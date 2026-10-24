"""S2a real generation flow on the dedicated QA emulator, without product test hooks."""
import json
import re
import time
from home_states import seek_above


def drawing(q):
    q.seek('shape-custom'); q.tap('shape-custom')
    assert q.find(q.capture('s2a-drawing-empty'), 'drawing-apply').get('enabled') == 'false'
    canvas = q.find(q.capture('s2a-drawing-canvas'), 'drawing-canvas')
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', canvas.get('bounds')))
    points = ';'.join(f'{round(x1+x*(x2-x1))},{round(y1+y*(y2-y1))}'
                      for x, y in [(.2,.2),(.8,.2),(.8,.8),(.2,.8),(.2,.2)])
    result = q.shell('uiautomator', 'runtest', '/data/local/tmp/running-ui-dump.jar',
                     '/system/framework/android.test.base.jar', '-c', 'DrawingGesture', '-e', 'points', points)
    assert b'OK (1 test)' in result
    q.seek('drawing-apply'); q.tap('drawing-apply')
    q.seek('selected-custom-shape'); q.capture('s2a-drawing-applied')
    seek_above(q, 'shape-custom'); q.tap('shape-custom')
    q.seek('drawing-clear'); q.tap('drawing-clear'); q.tap('drawing-cancel')
    q.seek('shape-custom'); q.tap('shape-custom')
    q.seek('drawing-apply')
    assert q.find(q.capture('s2a-drawing-cancel-restored'), 'drawing-apply').get('enabled') == 'true'
    q.tap('drawing-apply'); seek_above(q, 'shape-star'); q.tap('shape-star')


def generation_flow(q):
    q.tap('tab-courses')
    # Exercise native gesture arbitration inside the real vertical ScrollView.
    seek_above(q, 'distance-value')
    q.tap('distance-3')
    slider = q.find(q.capture('s2a-slider-before'), 'distance-slider')
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', slider.get('bounds')))
    assert y2-y1 >= 100, 'The full 48dp slider must be visible for gesture checks'
    y = (y1+y2)//2
    q.shell('input', 'swipe', str(x1+3), str(y), str(x2-3), str(y), '800')
    assert q.find(q.capture('s2a-slider-horizontal'), 'distance-10').get('selected') == 'true'
    q.tap('distance-3')
    q.shell('input', 'swipe', str((x1+x2)//2), str(y), str((x1+x2)//2), str(y-250), '600')
    moved = q.find(q.capture('s2a-slider-vertical'), 'distance-slider')
    assert moved is None or int(re.findall(r'\d+', moved.get('bounds'))[1]) < y1-40, 'Vertical gesture must scroll the page'
    seek_above(q, 'distance-value')
    assert q.find(q.capture('s2a-slider-distance-preserved'), 'distance-3').get('selected') == 'true'
    drawing(q)
    # Public fixture roads come from the isolated compute backend, never from
    # a hidden development switch in the production service UI.
    q.seek('distance-7'); q.tap('distance-7'); q.tap('calculate-route')
    q.capture('s2a-confirm-cancel-before')
    q.tap('generation-confirm-cancel')
    assert q.find(q.capture('s2a-confirm-cancelled'), 'calculation-running') is None
    q.tap('calculate-route'); q.tap('generation-confirm')
    q.tap('tab-home'); q.tap('tab-courses')
    assert q.find(q.capture('s2a-calculation-after-blur'), 'calculation-cancelled') is not None
    q.tap('generation-edit-footer'); q.seek('distance-3'); q.tap('distance-3')
    q.tap('calculate-route'); q.capture('s2a-confirm'); q.tap('generation-confirm')
    for _ in range(30):
        tree = q.capture('s2a-progress')
        if q.find(tree, 'calculation-done') is not None: break
        time.sleep(1)
    else: raise RuntimeError('Generation did not finish')
    q.capture('s2a-result-map')
    q.seek('generation-target-toggle'); q.tap('generation-target-toggle')
    assert q.find(q.capture('s2a-target-off'), 'generation-target-toggle').get('checked') == 'false'
    q.tap('generation-target-toggle')
    q.seek('candidate-1'); q.tap('candidate-1')
    selected = q.find(q.capture('s2a-selected'), 'candidate-1').get('content-desc')
    assert selected.startswith('유사도 ') and '예상 러닝 시간 약' in selected
    q.tap('generation-detail')
    detail = q.capture('s2a-detail-top')
    assert q.find(detail, 'course-detail') is not None
    q.seek('course-save-name'); q.tap('course-save-name')
    q.shell('input', 'keycombination', '113', '29'); q.shell('input', 'text', 'S0_DRAFT')
    tree = q.capture('s2a-name-keyboard')
    assert q.find(tree, 'course-save-name').get('text') == 'S0_DRAFT'
    input_bottom = int(re.findall(r'\d+', q.find(tree, 'course-save-name').get('bounds'))[3])
    display = q.shell('dumpsys', 'window', 'displays').decode()
    keyboard_tops = [int(y) for y in re.findall(r'type=ime frame=\[\d+,(\d+)\]\[\d+,\d+\][^\r\n]*visible=true', display)]
    assert keyboard_tops and input_bottom < min(keyboard_tops), 'Candidate name is obscured by keyboard'
    q.shell('input', 'keyevent', '4')
    q.tap('tab-account'); q.tap('tab-courses'); q.tap('generation-detail')
    q.seek('course-save-name')
    assert q.find(q.capture('s2a-name-restored'), 'course-save-name').get('text') == 'S0_DRAFT'
    q.seek('course-save'); q.tap('course-save')
    deadline = time.monotonic() + 20
    while True:
        rows = q.query("SELECT id,name,length_km,snapshot_json,snapshot_hash FROM saved_courses WHERE name='S0_DRAFT'")
        if rows: break
        assert time.monotonic() < deadline, 'Server-confirmed course save did not finish'
        time.sleep(.3)
    assert len(rows) == 1
    saved = rows[0]
    assert format(saved['length_km'], '.2f') + ' km' in selected
    assert q.find(q.capture('s2a-save-state-transition'), 'course-save') is None
    assert q.query("SELECT count(*) AS n FROM saved_courses WHERE name='S0_DRAFT'")[0]['n'] == 1
    q.capture('s2a-saved')
    q.seek('course-export-gpx'); q.tap('course-export-gpx')
    chooser = q.capture('s2a-gpx-chooser')
    deadline = time.monotonic() + 20
    while not any(n.get('package') == 'com.android.intentresolver' for n in chooser.iter('node')) and time.monotonic() < deadline:
        time.sleep(.5)
        chooser = q.capture('s2a-gpx-chooser-ready')
    assert any(n.get('package') == 'com.android.intentresolver' for n in chooser.iter('node'))
    q.shell('input', 'keyevent', '4')
    q.tap('service-back'); q.tap('tab-archive')
    # Bottom-tab navigation preserves the last archive tab (the preceding
    # navigation test deliberately selected completed records). Choose saved
    # courses explicitly before verifying the newly saved item.
    q.tap('저장 코스')
    assert q.find(q.capture('s2a-archive-destination'), '저장 코스').get('selected') == 'true'
    q.seek('course-row-'+saved['id']);q.tap('course-row-'+saved['id'])
    assert q.find(q.capture('s2a-saved-reopened'),'course-save') is None
    q.tap('service-back')
    assert q.query("SELECT snapshot_hash FROM saved_courses WHERE id='" + saved['id'] + "'")[0]['snapshot_hash'] == saved['snapshot_hash']
    (q.OUT / 's2a-result.json').write_text(json.dumps({
        'selected': selected, 'savedId': saved['id'], 'snapshotHash': saved['snapshot_hash'],
        'confirmationCancel': True, 'blurCancellation': True, 'duplicateSave': False, 'restoredName': True,
        'targetToggle': True, 'gpxChooser': True}, indent=2), encoding='utf8')
    q.tap('tab-courses')
    print('PASS: S2a confirmation, cancellation, actual calculation, target toggle, selection/detail, name restoration, explicit save/GPX/archive', flush=True)


def scaled_generation(q, launch):
    try:
        q.shell('wm', 'density', '480'); q.shell('settings', 'put', 'system', 'font_scale', '1.6')
        launch(); q.tap('tab-courses'); q.seek('shape-star'); q.capture('s2a-large-shapes')
        q.tap('calculate-route'); q.capture('s2a-large-confirm')
        # The fixed sheet footer is outside its body ScrollView.
        q.tap('generation-confirm-cancel')
        q.seek('shape-custom'); q.tap('shape-custom'); q.seek('drawing-cancel'); q.tap('drawing-cancel')
        assert q.find(q.capture('s2a-large-return'), 'calculate-route') is not None
        print('PASS: S2a 360dp/1.6 font shapes, confirmation and drawing cancel', flush=True)
    finally:
        q.shell('wm', 'density', '420'); q.shell('settings', 'put', 'system', 'font_scale', '1.0')
