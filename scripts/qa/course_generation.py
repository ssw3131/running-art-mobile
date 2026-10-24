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
    drawing(q)
    q.seek('route-diagnostics')
    tree = q.capture('s2a-before-grid')
    if q.find(tree, 'route-diagnostics').get('content-desc') == '개발 검증 정보':
        q.tap('route-diagnostics')
    q.seek('dataset-grid'); q.tap('dataset-grid')
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
    assert selected.startswith('2순위')
    q.tap('generation-detail')
    detail = q.capture('s2a-detail-top')
    assert q.find(detail, 'candidate-detail') is not None
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
    rows = q.query("SELECT id,name,length_km,snapshot_json,snapshot_hash FROM saved_courses WHERE name='S0_DRAFT'")
    assert len(rows) == 1
    saved = rows[0]
    assert format(saved['length_km'], '.2f') + ' km' in selected
    q.tap('course-save')
    assert q.query("SELECT count(*) AS n FROM saved_courses WHERE name='S0_DRAFT'")[0]['n'] == 1
    q.capture('s2a-saved')
    q.seek('candidate-export'); q.tap('candidate-export')
    chooser = q.capture('s2a-gpx-chooser')
    deadline = time.monotonic() + 20
    while not any(n.get('package') == 'com.android.intentresolver' for n in chooser.iter('node')) and time.monotonic() < deadline:
        time.sleep(.5)
        chooser = q.capture('s2a-gpx-chooser-ready')
    assert any(n.get('package') == 'com.android.intentresolver' for n in chooser.iter('node'))
    q.shell('input', 'keyevent', '4')
    q.seek('generation-saved-list'); q.tap('generation-saved-list')
    assert q.find(q.capture('s2a-archive-destination'), '저장한 코스') is not None
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
        q.seek('route-diagnostics'); q.tap('route-diagnostics'); q.seek('dataset-grid'); q.tap('dataset-grid')
        q.tap('calculate-route'); q.capture('s2a-large-confirm')
        # The fixed sheet footer is outside its body ScrollView.
        q.tap('generation-confirm-cancel')
        q.seek('shape-custom'); q.tap('shape-custom'); q.seek('drawing-cancel'); q.tap('drawing-cancel')
        assert q.find(q.capture('s2a-large-return'), 'calculate-route') is not None
        print('PASS: S2a 360dp/1.6 font shapes, confirmation and drawing cancel', flush=True)
    finally:
        q.shell('wm', 'density', '420'); q.shell('settings', 'put', 'system', 'font_scale', '1.0')
