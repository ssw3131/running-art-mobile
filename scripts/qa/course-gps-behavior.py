"""Post-lock UI/recovery/detour checks on the isolated emulator QA run."""
import importlib.util
import json
import math
import pathlib
import time

spec = importlib.util.spec_from_file_location('course_qa', pathlib.Path.cwd() / 'scripts/qa/course-gps-emulator.py')
q = importlib.util.module_from_spec(spec)
spec.loader.exec_module(q)
adb = q.adb

def row(name):
    db = q.database(name)
    value = db.execute("SELECT * FROM running_sessions WHERE course_id=? ORDER BY started_at DESC LIMIT 1", ('e' * 32,)).fetchone()
    db.close()
    assert value, 'Start the long QA course first'
    value = dict(value)
    value['guide'] = json.loads(value['guidance_json'])
    value['options'] = json.loads(value['guidance_options_json'])
    return value

def top():
    for _ in range(3): adb('shell', 'input', 'swipe', '1060', '750', '1060', '2100', '160')

def tap(key):
    top(); q.tap(key)

def fix(p, seconds=1):
    until = time.monotonic() + seconds
    while time.monotonic() < until:
        adb('emu', 'geo', 'fix', str(p[0]), str(p[1]), '0', '10')
        time.sleep(.9)

def open_run():
    adb('shell', 'input', 'keyevent', '224'); adb('shell', 'wm', 'dismiss-keyguard')
    adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'runningart:///run', q.APP)
    time.sleep(3)

def continue_arrival():
    q.open_course(0); tap('run-course-start'); q.tap('confirm')
    start = json.loads((q.OUT / 'fixtures.json').read_text(encoding='utf-8'))[0]['snapshot']['route'][0]
    tap('run-guidance-mode'); fix(start, 3); top()
    q.qa.capture('final-turn-distance-visible')
    assert any(n.get('resource-id') == 'run-turn-distance' for n in q.qa.ui().iter('node'))
    q.replay(0, 70, 4, False)
    db = q.database('continue-arrival')
    arrival = dict(db.execute('SELECT * FROM running_sessions WHERE course_id=? ORDER BY started_at DESC LIMIT 1', ('d' * 32,)).fetchone()); db.close()
    assert arrival['status'] == 'paused' and arrival['course_outcome'] == 'arrival-pending'
    top(); q.qa.capture('continue-arrival-visible')
    tap('run-start'); q.tap('confirm')
    fix(json.loads(arrival['course_snapshot_json'])['route'][-1], 8)
    db = q.database('continue-stationary')
    resumed = dict(db.execute('SELECT * FROM running_sessions WHERE id=?', (arrival['id'],)).fetchone()); db.close()
    assert resumed['status'] == 'running' and resumed['course_outcome'] == 'active'
    tap('run-finish'); q.tap('save')
    db = q.database('continue-saved')
    completed = dict(db.execute('SELECT * FROM running_sessions WHERE id=?', (arrival['id'],)).fetchone()); db.close()
    assert completed['status'] == 'completed' and completed['course_outcome'] == 'stopped'
    print('Arrival continued at the same coordinate without automatic re-pause; manual stop preserved', flush=True)

def main():
    samples = json.loads((q.OUT / 'replay-1.json').read_text())
    assert samples[-1]['elapsed'] >= 1800 and all(s['asleep'] and s['status'] == 'running' for s in samples)
    before = row('long-final')
    assert before['status'] == 'running'
    anchor = before['guide']['current']
    open_run(); top(); q.qa.capture('long-visible')
    tap('run-guidance-mode')
    assert row('focus')['options']['mode'] == 'focus'
    top(); q.qa.capture('focus-visible')
    tap('run-voice'); assert not row('voice-off')['options']['voice']
    tap('run-voice'); assert row('voice-on')['options']['voice']
    tap('run-background')
    adb('shell', 'input', 'keyevent', '3'); time.sleep(3)
    paused = row('background-disabled')
    assert paused['status'] == 'paused'
    open_run(); assert row('background-return')['status'] == 'paused'
    tap('run-background'); tap('run-start'); q.tap('confirm'); fix(anchor, 5)
    resumed = row('resumed')
    assert resumed['status'] == 'running'
    assert resumed['guide']['progress'] - before['guide']['progress'] < 5
    adb('shell', 'am', 'force-stop', q.APP)
    stopped = row('force-stop-stored')
    time.sleep(3); open_run()
    recovered = row('force-stop-recovered')
    assert recovered['status'] == 'interrupted'
    assert recovered['point_count'] == stopped['point_count']
    assert recovered['active_ms'] == stopped['active_ms']
    assert recovered['guide']['progress'] == stopped['guide']['progress']
    top(); q.qa.capture('interrupted-visible')
    # Moving while stopped does not skip the missing course after explicit resume.
    anchor = recovered['guide']['current']
    far = [anchor[0] + 150 / (111195 * math.cos(math.radians(anchor[1]))), anchor[1]]
    fix(far, 2); tap('run-start'); q.tap('confirm'); fix(far, 7)
    outside = row('resume-outside')
    assert outside['status'] == 'running' and outside['guide']['rejoin']
    assert outside['guide']['progress'] == recovered['guide']['progress']
    top(); q.qa.capture('resume-outside-visible')
    fix(anchor, 8)
    joined = row('resume-rejoined')
    assert not joined['guide']['rejoin'] and not joined['guide']['off']
    # Choose the direction farthest from the nearby course window.
    route = json.loads(joined['course_snapshot_json'])['route']; cumulative = [0]
    for a, b in zip(route, route[1:]): cumulative.append(cumulative[-1] + q.hav(a, b))
    near = [p for p, m in zip(route, cumulative) if joined['guide']['progress'] - 30 <= m <= joined['guide']['progress'] + 200]
    scale = 111195 * math.cos(math.radians(anchor[1]))
    choices = [[anchor[0] + 80 * math.cos(i * math.pi/8) / scale, anchor[1] + 80 * math.sin(i * math.pi/8) / 111195] for i in range(16)]
    detour = max(choices, key=lambda p: min(q.hav(p, n) for n in near))
    for i in range(1, 22): fix([anchor[j] + (detour[j] - anchor[j]) * i/21 for j in range(2)])
    fix(detour, 7)
    off = row('off-route')
    assert off['guide']['off'] and any(e.startswith('off-') for e in off['guide']['emitted'])
    top(); q.qa.capture('off-route-visible')
    for i in range(20, -1, -1): fix([anchor[j] + (detour[j] - anchor[j]) * i/21 for j in range(2)])
    fix(anchor, 8)
    returned = row('returned')
    assert not returned['guide']['off'] and any(e.startswith('returned-') for e in returned['guide']['emitted'])
    logs = adb('logcat', '-d', '-s', 'RunPenGpsGuidance:I', '*:S').decode(errors='replace')
    (q.OUT / 'postflight-voice.log').write_text(logs, encoding='utf-8')
    assert 'vibration id=off-' in logs and 'tts_done id=returned-' in logs
    tap('run-finish'); q.tap('save')
    completed = row('long-saved')
    assert completed['status'] == 'completed' and completed['course_outcome'] == 'stopped'
    q.qa.capture('long-saved-visible')
    print(json.dumps({'status': 'passed', 'longPoints': before['point_count'], 'longDistanceM': before['distance_m'],
        'longActiveMs': before['active_ms'], 'offRouteEpisode': off['guide']['episode'],
        'finalOutcome': completed['course_outcome']}, ensure_ascii=False), flush=True)

if __name__ == '__main__':
    import sys
    if sys.argv[1:] == ['continue']: continue_arrival()
    else: main()
