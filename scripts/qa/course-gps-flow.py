"""Exercise current-location calculation, candidate/save, and GPS entry on emulator-5556."""
import importlib.util
import json
import pathlib
import time

spec = importlib.util.spec_from_file_location('behavior_qa', pathlib.Path.cwd() / 'scripts/qa/course-gps-behavior.py')
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)
q, adb = b.q, b.adb

def open_page(path):
    adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'runningart:///' + path, q.APP)
    time.sleep(3)

def fresh_course():
    db = q.database('flow-current')
    value = db.execute('SELECT * FROM saved_courses WHERE id NOT IN (?,?) ORDER BY created_at DESC LIMIT 1', ('d' * 32, 'e' * 32)).fetchone()
    count = db.execute('SELECT count(*) FROM saved_courses').fetchone()[0]
    db.close()
    return dict(value) if value else None, count

def flow_tap(key):
    # This screen has a full-width map above the scroll panel. Start gestures
    # below it so returning to the inputs cannot move the calculation center.
    for _ in range(4): adb('shell', 'input', 'swipe', '1060', '1450', '1060', '2200', '160')
    q.tap(key)

def main():
    db = q.database('flow-before')
    assert db.execute("SELECT count(*) FROM running_sessions WHERE status!='completed'").fetchone()[0] == 0
    assert db.execute('SELECT count(*) FROM saved_courses').fetchone()[0] == 2
    db.close()
    adb('shell', 'am', 'force-stop', q.APP)
    adb('shell', 'svc', 'wifi', 'enable'); time.sleep(5)
    origin = json.loads((q.ROOT / 'assets/route-lab/seoul.json').read_text())['origin']
    b.fix([origin['lng'], origin['lat']], 3)
    open_page('route-lab'); time.sleep(8)
    q.qa.capture('flow-conditions')
    flow_tap('distance-3'); flow_tap('distance-5'); flow_tap('shape-heart')
    flow_tap('calculate-route'); q.tap('cancel-route')
    assert any(n.get('resource-id') == 'calculation-cancelled' for n in q.qa.ui().iter('node'))
    flow_tap('calculate-route')
    started = time.monotonic()
    while time.monotonic() - started < 120:
        tree = q.qa.ui()
        if any(n.get('resource-id') == 'calculation-done' for n in tree.iter('node')): break
        if any(n.get('resource-id') == 'calculation-error' for n in tree.iter('node')):
            raise RuntimeError(q.qa.capture('flow-error'))
        time.sleep(2)
    else: raise RuntimeError('Calculation did not finish')
    finish_flow()

def finish_flow():
    flow_tap('candidate-1'); q.qa.capture('flow-candidate-selected')
    q.tap('course-save'); course, count = fresh_course(); assert course and count == 3
    q.tap('course-save')
    notices = q.qa.capture('flow-duplicate')
    assert any('이미 저장한 코스' in s for s in notices)
    assert fresh_course()[1] == count
    snapshot = json.loads(course['snapshot_json']); start = snapshot['route'][0]
    assert snapshot['source'] == 'osm' and snapshot['targetKm'] == 5 and snapshot['shape'] == 'heart'
    b.fix([start[0] + .003, start[1]], 2)
    q.tap('saved-course-run'); time.sleep(3)
    b.top()
    q.qa.capture('flow-start-outside')
    for _ in range(3): adb('shell', 'input', 'swipe', '1060', '2100', '1060', '850', '180')
    control = next(n for n in q.qa.ui().iter('node') if n.get('resource-id') == 'run-course-start')
    assert control.get('enabled') == 'false'
    b.fix(start, 5); b.tap('run-course-start'); q.tap('confirm'); b.fix(start, 5)
    db = q.database('flow-started')
    run = dict(db.execute("SELECT * FROM running_sessions WHERE status='running'").fetchone()); db.close()
    assert run['course_id'] == course['id'] and run['course_snapshot_json'] == course['snapshot_json']
    b.tap('run-finish'); q.tap('save'); q.qa.capture('flow-run-saved')
    open_page('courses/' + course['id']); b.tap('course-run')
    q.qa.capture('flow-detail-preparation')
    print(json.dumps({'status': 'passed', 'selectedCandidateRank': 2, 'courseId': course['id'], 'courseName': course['name'],
        'targetKm': snapshot['targetKm'], 'actualKm': snapshot['lengthKm'], 'score': snapshot['score'], 'courseCountAfterDuplicate': count}, ensure_ascii=False), flush=True)

if __name__ == '__main__':
    import sys
    if sys.argv[1:] == ['resume']: finish_flow()
    else: main()
