"""Real Expo Location callbacks via emulator GPS; emulator-5556 exclusively.
Preserves original SQLite before a fixture, never operates on a physical phone.
"""
import argparse
import hashlib
import importlib.util
import json
import math
import pathlib
import re
import sqlite3
import sys
import time

ROOT = pathlib.Path.cwd()
spec = importlib.util.spec_from_file_location('guidance_qa', ROOT / 'scripts/qa/guidance-emulator.py')
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)
OUT = ROOT / '.cache/course-gps-qa'
OUT.mkdir(exist_ok=True)
qa.OUT = OUT
adb = qa.adb
APP = qa.APP

def database(name):
    qa.snapshot(name)
    db = sqlite3.connect(OUT / name / 'running-art.db')
    db.row_factory = sqlite3.Row
    return db

def backup():
    target = OUT / 'original.db'
    if target.exists():
        raise RuntimeError('Original backup already exists; do not overwrite')
    adb('shell', 'am', 'force-stop', APP)
    conn = database('original')
    with sqlite3.connect(target) as dest:
        conn.backup(dest)
    conn.close()
    print('Original emulator database preserved', flush=True)

def seed():
    assert (OUT / 'original.db').exists()
    adb('shell', 'am', 'force-stop', APP)
    conn = database('before-seed')
    assert conn.execute('PRAGMA user_version').fetchone()[0] == 5
    assert conn.execute("SELECT count(*) FROM running_sessions WHERE status!='completed'").fetchone()[0] == 0
    assert conn.execute("SELECT count(*) FROM sync_accounts WHERE enabled=1").fetchone()[0] == 0, 'QA emulator must not sync fixture data'
    dest = sqlite3.connect(OUT / 'seeded.db')
    conn.backup(dest); conn.close()
    for entry in json.loads((OUT / 'fixtures.json').read_text(encoding='utf-8')):
        s = entry['snapshot']
        dest.execute('INSERT INTO saved_courses(id,name,source,shape,target_km,length_km,score,snapshot_json,snapshot_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
            (entry['id'], entry['label'], s['source'], s['shape'], s['targetKm'], s['lengthKm'], s['score'], entry['json'], entry['hash'], 1791010000000, 1791010000000))
    dest.commit(); dest.close()
    qa.install_database(OUT / 'seeded.db')
    print('Public OSM QA courses seeded; original data retained', flush=True)

def tap(key, scroll=True):
    key = {'confirm': '계속', 'save': '종료·저장', 'cancel': '취소'}.get(key, key)
    for _ in range(20 if scroll else 3):
        root = qa.ui()
        nodes = [n for n in root.iter('node') if key in (n.get('resource-id'), n.get('text'), n.get('content-desc'))]
        if nodes:
            n = nodes[0]
            x1, y1, x2, y2 = map(int, re.findall(r'\d+', n.get('bounds')))
            if n.get('enabled') == 'true' and y2-y1 >= 40 and y1 >= 120 and y2 < 2340:
                adb('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2)); time.sleep(.8); return
        if scroll:
            adb('shell', 'input', 'swipe', '1060', '2100', '1060', '1550', '300')
        time.sleep(.5)
    raise RuntimeError('Visible enabled control not found: ' + key)

def open_course(which):
    entry = json.loads((OUT / 'fixtures.json').read_text(encoding='utf-8'))[which]
    lng, lat = entry['snapshot']['route'][0]
    adb('shell', 'input', 'keyevent', '224'); adb('shell', 'wm', 'dismiss-keyguard')
    adb('shell', 'settings', 'put', 'secure', 'location_mode', '3')
    for permission in ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'ACCESS_BACKGROUND_LOCATION', 'POST_NOTIFICATIONS']:
        adb('shell', 'pm', 'grant', APP, 'android.permission.' + permission)
    adb('emu', 'geo', 'fix', str(lng), str(lat), '0', '10')
    adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'runningart:///run?courseId=' + entry['id'], APP)
    time.sleep(3)
    for _ in range(3):
        adb('emu', 'geo', 'fix', str(lng), str(lat), '0', '10'); time.sleep(1)
    print(json.dumps(qa.capture('ready-' + str(which)), ensure_ascii=False), flush=True)

def hav(a, b):
    rad = math.pi / 180
    h = math.sin((a[1]-b[1])*rad/2)**2 + math.cos(a[1]*rad)*math.cos(b[1]*rad)*math.sin((a[0]-b[0])*rad/2)**2
    return 6371000 * 2 * math.asin(min(1, math.sqrt(h)))

def replay(which, seconds, speed, locked):
    entry = json.loads((OUT / 'fixtures.json').read_text(encoding='utf-8'))[which]
    route = entry['snapshot']['route']; cumulative = [0]
    for a, b in zip(route, route[1:]): cumulative.append(cumulative[-1]+hav(a, b))
    if locked:
        adb('shell', 'svc', 'wifi', 'disable')
        adb('shell', 'svc', 'data', 'disable')
        assert 'Active default network: none' in adb('shell', 'dumpsys', 'connectivity').decode(errors='replace'), 'Emulator is not offline'
        adb('shell', 'log', '-t', 'RunPenGpsGuidance', 'long_gps_begin')
        adb('shell', 'input', 'keyevent', '223')
    start = time.monotonic(); next_report = 0; samples = []; index = 0
    while time.monotonic()-start < seconds:
        elapsed = time.monotonic()-start; meters = min(cumulative[-1], elapsed*speed)
        while index < len(route)-2 and cumulative[index+1] < meters: index += 1
        frac = max(0, min(1, (meters-cumulative[index]) / max(.000001, cumulative[index+1]-cumulative[index])))
        p = [route[index][j] + (route[index+1][j]-route[index][j])*frac for j in range(2)]
        adb('emu', 'geo', 'fix', str(p[0]), str(p[1]), '0', '10')
        if elapsed >= next_report:
            conn = database('replay-current')
            row = conn.execute('SELECT id,status,course_outcome,point_count,distance_m,active_ms,guidance_json FROM running_sessions WHERE course_id=? ORDER BY started_at DESC LIMIT 1', (entry['id'],)).fetchone()
            conn.close(); assert row, 'No GPS session'
            state = json.loads(row['guidance_json'])
            power = adb('shell', 'dumpsys', 'power').decode(errors='replace')
            sample = { 'elapsed': round(elapsed, 1), 'status': row['status'], 'outcome': row['course_outcome'], 'points': row['point_count'], 'distance': row['distance_m'], 'progress': state['progress'],
                'asleep': 'mWakefulness=Asleep' in power or 'mWakefulness=Dozing' in power }
            samples.append(sample)
            (OUT / ('replay-' + str(which) + '.json')).write_text(json.dumps(samples, indent=2), encoding='utf-8')
            print(json.dumps(sample), flush=True)
            if locked:
                assert sample['asleep'], 'Display woke during locked test'
                assert sample['status'] == 'running', 'GPS recording stopped during locked test'
                if len(samples) > 1:
                    assert sample['points'] > samples[-2]['points'] + 4, 'GPS records did not advance'
                    assert sample['progress'] > samples[-2]['progress'] + 20, 'Guidance progress did not advance'
            next_report += 30
        time.sleep(.9)
    print('GPS replay elapsed ' + str(round(time.monotonic()-start, 1)), flush=True)
    if locked:
        logs = adb('logcat', '-d', '-s', 'RunPenGpsGuidance:I', '*:S').decode(errors='replace')
        (OUT / 'locked-voice.log').write_text(logs, encoding='utf-8')
        assert 'long_gps_begin' in logs and 'tts_done' in logs.split('long_gps_begin')[-1], 'No completed speech during lock'
        assert 'Active default network: none' in adb('shell', 'dumpsys', 'connectivity').decode(errors='replace')
        print('Locked GPS, guidance progression, and offline speech verified', flush=True)

def restore():
    qa.install_database(OUT / 'original.db')
    report = qa.snapshot('original-restored')
    original = json.loads((OUT / 'original.json').read_text())
    assert report == original
    print('Original emulator SQLite restored byte content per table', flush=True)

if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('command', choices=['backup','seed','open','tap','capture','snapshot','replay','restore'])
    p.add_argument('arg', nargs='?', default='screen'); p.add_argument('--seconds', type=int, default=60); p.add_argument('--speed', type=float, default=3); p.add_argument('--locked', action='store_true')
    args = p.parse_args()
    if args.command == 'backup': backup()
    elif args.command == 'seed': seed()
    elif args.command == 'open': open_course(int(args.arg))
    elif args.command == 'tap': tap(args.arg)
    elif args.command == 'capture': print(json.dumps(qa.capture(args.arg), ensure_ascii=False))
    elif args.command == 'snapshot': print(json.dumps(qa.snapshot(args.arg), ensure_ascii=False))
    elif args.command == 'replay': replay(int(args.arg), args.seconds, args.speed, args.locked)
    elif args.command == 'restore': restore()
