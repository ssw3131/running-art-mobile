"""S0 navigation evidence on RunningArt_UI_QA only. No physical device access."""
import hashlib
import json
import pathlib
import re
import shlex
import subprocess
import sys
import time
import uuid
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[2]
ADB = ROOT / '.tools/android-sdk/platform-tools/adb.exe'
OUT = ROOT / '.cache/service-s0-20261012'
SERIAL = 'emulator-5558'
APP = 'com.runningart.mobile.dev'
OWNER = '10000000-0000-4000-8000-000000000001'
DB = f'/data/user/0/{APP}/files/SQLite/running-art.db'
OUT.mkdir(parents=True, exist_ok=True)


def adb(*args, timeout=45):
    p = subprocess.run([str(ADB), '-s', SERIAL, *args], capture_output=True, timeout=timeout)
    if p.returncode:
        raise RuntimeError(p.stderr.decode(errors='replace') + p.stdout.decode(errors='replace'))
    return p.stdout


def shell(*args, **kwargs):
    return adb('shell', shlex.join(args), **kwargs)


def capture(name):
    assert re.fullmatch(r'[a-z0-9-]+', name)
    for attempt in range(3):
        token = uuid.uuid4().hex
        command = ('uiautomator', 'runtest', '/data/local/tmp/running-ui-dump.jar', '/system/framework/android.test.base.jar', '-e', 'runpenDumpToken', token, '-c', 'RunningUiDump')
        process = subprocess.run([str(ADB), '-s', SERIAL, 'shell', shlex.join(command)], capture_output=True, timeout=45)
        result = (process.stdout + process.stderr).decode(errors='replace')
        readiness = re.search(r'RUNPEN_DUMP_ATTEMPTS=(\d+)', result)
        if (readiness and int(readiness.group(1)) > 1) or 'No fresh UI hierarchy' in result:
            with (OUT / 'ui-dump-readiness.jsonl').open('a', encoding='utf8') as log:
                log.write(json.dumps({'capture': name, 'connectionAttempt': attempt + 1,
                    'rootAttempts': int(readiness.group(1)) if readiness else None,
                    'freshHierarchy': 'OK (1 test)' in result and 'FAILURES!!!' not in result}) + '\n')
        if 'OK (1 test)' in result and 'FAILURES!!!' not in result:
            # API 29 may return a nonzero shell exit after the test has finished.
            # Require a fresh per-call device receipt as well as JUnit success;
            # an old XML, partial run, offline emulator or helper failure fails.
            receipt = shell('cat', '/data/local/tmp/running-qa.token').decode().strip()
            if receipt != token:
                raise RuntimeError('UI dump receipt is missing or stale')
            if process.returncode:
                with (OUT / 'ui-dump-transport.jsonl').open('a', encoding='utf8') as log:
                    log.write(json.dumps({'capture': name, 'exitCode': process.returncode, 'token': token, 'output': result}) + '\n')
            break
        if 'No fresh UI hierarchy' not in result or attempt == 2:
            raise RuntimeError(result)
        time.sleep(1)
    raw = shell('cat', '/data/local/tmp/running-qa.xml')
    (OUT / f'{name}.xml').write_bytes(raw)
    (OUT / f'{name}.png').write_bytes(adb('exec-out', 'screencap', '-p'))
    return ET.fromstring(raw)


def nodes(tree):
    return list(tree.iter('node'))


def find(tree, key):
    return next((n for n in nodes(tree) if key in (n.get('resource-id'), n.get('text'), n.get('content-desc'))), None)


def tap(key):
    if key in ['home-more-courses', 'home-more-runs']:
        seek(key)
    tree = capture('current')
    n = find(tree, key)
    if n is None:
        raise RuntimeError('Missing control: ' + key)
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', n.get('bounds')))
    assert n.get('enabled') == 'true' and x2 > x1 and y2 > y1, n.attrib
    shell('input', 'tap', str((x1+x2)//2), str((y1+y2)//2))
    time.sleep(.7)


def seek(key):
    for _ in range(16):
        tree = capture('current')
        n = find(tree, key)
        tab = find(tree, 'tab-home')
        bottom = int(re.findall(r'\d+', tab.get('bounds'))[1]) - 29 if tab is not None else 2335
        if n is not None:
            _, y1, _, y2 = map(int, re.findall(r'\d+', n.get('bounds')))
            if 150 < y1 < y2 <= bottom and y2-y1 >= 40:
                return
        shell('input', 'swipe', '1000', '1930', '1000', '1040', '350')
    raise RuntimeError('Control not reached: ' + key)


def query(sql):
    return json.loads(shell('sqlite3', '-json', DB, sql).decode() or '[]')


def snapshot(name):
    tables = query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    result = {}
    for table in tables:
        name_ = table['name']
        assert re.fullmatch(r'[a-zA-Z_]+', name_)
        rows = query(f'SELECT * FROM {name_}')
        encoded = sorted(json.dumps(row, sort_keys=True, ensure_ascii=False) for row in rows)
        result[name_] = {'count': len(rows), 'hash': hashlib.sha256('\n'.join(encoded).encode()).hexdigest()}
    (OUT / f'{name}.json').write_text(json.dumps(result, indent=2), encoding='utf8')
    print(json.dumps(result))
    return result


def seed():
    assert not query('SELECT id FROM saved_courses')
    assert not query('SELECT owner_id FROM sync_accounts WHERE enabled=1')
    entry = json.loads((ROOT / '.cache/course-gps-qa/fixtures.json').read_text(encoding='utf8'))[0]
    s = entry['snapshot']
    def literal(v):
        return "'" + str(v).replace("'", "''") + "'"
    values = [entry['id'], entry['label'], s['source'], s['shape'], s['targetKm'], s['lengthKm'], s['score'], entry['json'], entry['hash'], 1791010000000, 1791010000000, OWNER]
    sql = 'INSERT INTO saved_courses(id,name,source,shape,target_km,length_km,score,snapshot_json,snapshot_hash,created_at,updated_at,owner_id) VALUES(' + ','.join(map(literal, values)) + ');'
    sql += "INSERT INTO storage_test_notes(content,created_at,updated_at) VALUES('S0 preservation fixture',1791010000000,1791010000000);"
    p = subprocess.run([str(ADB), '-s', SERIAL, 'shell', shlex.join(['sqlite3', DB])], input=sql.encode(), capture_output=True)
    assert p.returncode == 0, p.stderr.decode()
    assert query('SELECT count(*) AS n FROM saved_courses')[0]['n'] == 1
    snapshot('seeded-before-update')


def navigation():
    tap('tab-courses')
    before = capture('center-before-tab')
    for _ in range(15):
        if find(before, 'route-location-loading') is None:
            break
        time.sleep(1)
        before = capture('center-before-tab')
    assert find(before, 'route-location-loading') is None, 'Initial location has not settled'
    center = find(before, 'selected-center').get('text')
    adb('emu', 'geo', 'fix', '127', '37', '0', '10')
    tap('tab-home'); tap('tab-courses')
    assert find(capture('center-after-tab'), 'selected-center').get('text') == center
    seek('distance-3'); tap('distance-3'); seek('shape-star'); tap('shape-star')
    def draft(name):
        seek('distance-3')
        assert find(capture(name + '-distance'), 'distance-3').get('selected') == 'true', name
        seek('shape-star')
        assert find(capture(name), 'shape-star').get('selected') == 'true', name
    draft('draft-before')
    tap('tab-account'); tap('service-menu'); tap('service-back'); tap('tab-courses')
    draft('draft-after-menu-back')
    tap('service-menu'); seek('support-about'); tap('support-about')
    seek('코스 생성하러 가기'); tap('코스 생성하러 가기')
    draft('draft-after-menu-link')
    tap('tab-archive'); seek('course-row-' + 'd'*32); tap('course-row-' + 'd'*32)
    capture('course-detail'); tap('service-back'); tap('tab-courses')
    draft('draft-after-detail')
    shell('input', 'keyevent', '4')
    assert find(capture('system-back-home'), 'service-home') is not None
    tap('home-more-runs')
    assert find(capture('archive-runs'), 'runs-refresh') is not None
    tap('tab-account'); tap('tab-archive')
    assert find(capture('archive-view-after-tab'), 'runs-refresh') is not None
    tap('tab-courses'); draft('draft-after-system-back')
    print('PASS: chosen center, distance, shape, tab retention, menu/back, detail/back, system back, archive run list')


def calculation():
    seek('route-diagnostics')
    tree = capture('before-grid')
    if find(tree, 'route-diagnostics').get('content-desc') == '개발 검증 정보':
        tap('route-diagnostics')
    seek('dataset-grid'); tap('dataset-grid')
    tap('distance-7'); tap('calculate-route'); tap('tab-home'); tap('tab-courses')
    tree = capture('calculation-after-blur')
    assert find(tree, 'calculation-cancelled') is not None
    tap('distance-3'); tap('calculate-route')
    for _ in range(30):
        tree = capture('calculation-progress')
        if find(tree, 'calculation-done') is not None:
            break
        time.sleep(1)
    else:
        raise RuntimeError('Calculation did not finish')
    seek('course-save-name'); tap('course-save-name')
    shell('input', 'keycombination', '113', '29')
    shell('input', 'text', 'S0_DRAFT')
    time.sleep(1)
    tree = capture('save-keyboard')
    assert find(tree, 'course-save-name').get('text') == 'S0_DRAFT'
    shell('input', 'keyevent', '4')
    tap('tab-account'); tap('tab-courses')
    tree = capture('save-draft-after-tab')
    assert find(tree, 'course-save-name').get('text') == 'S0_DRAFT'
    seek('course-save'); tap('course-save')
    assert query("SELECT count(*) AS n FROM saved_courses WHERE name='S0_DRAFT'")[0]['n'] == 1
    tap('tab-home'); tap('home-more-runs'); tap('tab-courses'); seek('저장한 코스 목록'); tap('저장한 코스 목록')
    assert find(capture('save-list-destination'), '저장한 코스') is not None
    print('PASS: blur cancels active calculation; recalculate, keyboard, draft persistence, SQLite save, archive destination')


def gps_navigation():
    assert not query("SELECT id FROM running_sessions WHERE status <> 'completed'")
    tap('tab-run'); seek('run-start'); tap('run-start'); tap('계속')
    def inject(start, count=4):
        for i in range(start, start + count):
            adb('emu', 'geo', 'fix', str(127+i*.00002), '37', '0', '10')
            time.sleep(2)
    inject(0)
    row = query("SELECT id,status,point_count FROM running_sessions WHERE status <> 'completed'")[0]
    run_id, initial_count = row['id'], row['point_count']
    assert row['status'] == 'running' and initial_count > 0
    tap('tab-home')
    assert find(capture('gps-home-banner'), 'home-history') is not None
    tap('tab-archive'); inject(4)
    tap('tab-account'); inject(8)
    tap('tab-run')
    row = query("SELECT id,status,point_count FROM running_sessions WHERE status <> 'completed'")[0]
    assert row['id'] == run_id and row['status'] == 'running' and row['point_count'] > initial_count
    seek('run-pause'); tap('run-pause')
    tap('tab-home'); seek('home-run-' + run_id); tap('home-run-' + run_id)
    assert query(f"SELECT status FROM running_sessions WHERE id='{run_id}'")[0]['status'] == 'paused'
    seek('run-start'); tap('run-start'); tap('계속'); inject(12)
    capture('gps-resumed')
    shell('am', 'force-stop', APP)
    shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'runningart:///', APP)
    time.sleep(3)
    assert find(capture('gps-cold-recovery'), 'home-history') is not None
    assert query(f"SELECT status FROM running_sessions WHERE id='{run_id}'")[0]['status'] == 'interrupted'
    seek('home-run-' + run_id); tap('home-run-' + run_id); seek('run-start'); tap('run-start'); tap('계속'); inject(16)
    seek('run-finish'); tap('run-finish'); tap('종료·저장')
    capture('gps-result')
    final = query(f"SELECT id,status,point_count FROM running_sessions WHERE id='{run_id}'")[0]
    assert final['status'] == 'completed' and final['point_count'] > initial_count
    assert not query("SELECT id FROM running_sessions WHERE status <> 'completed'")
    services = shell('dumpsys', 'activity', 'services', APP).decode()
    assert not re.search(r'^  \* ServiceRecord.*com\.runningart\.mobile\.dev/', services, re.M)
    tap('service-back')
    assert find(capture('gps-result-back'), 'tab-run').get('selected') == 'true'
    print('PASS: GPS tab continuity, home return, pause/resume, explicit process recovery, finish/back/service cleanup', json.dumps(final))


def course_preparation():
    entry = json.loads((ROOT / '.cache/free-loop-qa/fixture.json').read_text(encoding='utf8'))
    if not query("SELECT id FROM saved_courses WHERE id='" + 'f'*32 + "'"):
        s = entry['snapshot']
        values = [entry['id'], entry['name'], s['source'], s['shape'], s['targetKm'], s['lengthKm'], s['score'], entry['json'], entry['hash'], 1791010000000, 1791010000000, OWNER]
        sql = 'INSERT INTO saved_courses(id,name,source,shape,target_km,length_km,score,snapshot_json,snapshot_hash,created_at,updated_at,owner_id) VALUES(' + ','.join("'" + str(v).replace("'", "''") + "'" for v in values) + ');'
        p = subprocess.run([str(ADB), '-s', SERIAL, 'shell', shlex.join(['sqlite3', DB])], input=sql.encode(), capture_output=True)
        assert p.returncode == 0, p.stderr.decode()
    lng, lat = entry['snapshot']['route'][0]
    adb('emu', 'geo', 'fix', str(lng), str(lat), '0', '10')
    tap('tab-home'); tap('home-more-courses'); tap('course-row-' + 'f'*32)
    seek('course-run'); tap('course-run')
    assert find(capture('course-preparation-tab'), 'tab-run').get('selected') == 'true'
    for _ in range(2):
        tap('tab-home'); tap('tab-run')
    for _ in range(12):
        seek('run-course-start')
        tree = capture('course-preparation-return')
        if find(tree, 'run-course-start').get('enabled') == 'true':
            break
        adb('emu', 'geo', 'fix', str(lng), str(lat), '0', '10')
        time.sleep(1)
    else:
        raise RuntimeError('Course preparation did not recover after tab refocus')
    assert not query("SELECT id FROM running_sessions WHERE status <> 'completed'")
    tap('tab-home')
    print('PASS: course detail enters retained run tab; preparation survives tab refocus without starting GPS recording')


def scaled():
    assert not query("SELECT id FROM running_sessions WHERE status <> 'completed'")
    shell('settings', 'put', 'system', 'font_scale', '1.6')
    shell('wm', 'density', '480')
    shell('am', 'force-stop', APP)
    shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'runningart:///', APP)
    time.sleep(3)
    tree = capture('scaled-home')
    for key in ['home', 'courses', 'run', 'archive', 'account']:
        n = find(tree, 'tab-' + key)
        x1, y1, x2, y2 = map(int, re.findall(r'\d+', n.get('bounds')))
        assert 0 <= x1 < x2 <= 1080 and 0 <= y1 < y2 <= 2340 and x2-x1 >= 144 and y2-y1 >= 144
    tap('tab-account'); capture('scaled-account')
    tap('service-menu'); capture('scaled-menu'); tap('service-back')
    tap('tab-home'); tap('home-more-courses'); seek('course-row-' + 'd'*32); tap('course-row-' + 'd'*32)
    seek('course-rename-input'); tap('course-rename-input')
    shell('input', 'keycombination', '113', '29'); shell('input', 'text', 'S0_keyboard')
    tree = capture('scaled-keyboard')
    assert find(tree, 'course-rename-input').get('text') == 'S0_keyboard'
    input_bottom = int(re.findall(r'\d+', find(tree, 'course-rename-input').get('bounds'))[3])
    # The app-only UI dumper excludes the keyboard's separate window.
    display = shell('dumpsys', 'window', 'displays').decode()
    keyboard_tops = [int(y) for y in re.findall(r'type=ime frame=\[\d+,(\d+)\]\[\d+,\d+\][^\r\n]*visible=true', display)]
    assert keyboard_tops and input_bottom < min(keyboard_tops), 'Name input must be fully above the keyboard'
    (OUT / 'keyboard-bounds.json').write_text(json.dumps({'inputBottom': input_bottom, 'keyboardTop': min(keyboard_tops)}), encoding='utf8')
    shell('input', 'keyevent', '4'); tap('service-back')
    assert query("SELECT name FROM saved_courses WHERE id='" + 'd'*32 + "'")[0]['name'] == 'GPS QA 짧은 OSM 경로'
    shell('settings', 'put', 'system', 'font_scale', '1.0'); shell('wm', 'density', 'reset')
    print('PASS: 360dp/1.6 font tab targets, headers/menu, keyboard editing; unsaved name remains unchanged')


def compatibility():
    shell('am', 'force-stop', APP)
    shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'runningart:///courses/' + 'd'*32, APP)
    time.sleep(3)
    assert find(capture('cold-course-link'), 'course-title') is not None
    seek('course-export-gpx'); tap('course-export-gpx')
    tree = capture('gpx-chooser')
    assert any(n.get('package') == 'com.android.intentresolver' for n in nodes(tree))
    shell('input', 'keyevent', '4'); tap('service-back')
    assert find(capture('cold-link-back'), 'tab-home').get('selected') == 'true'
    shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'runningart:///runs', APP)
    time.sleep(1)
    run_id = query("SELECT id FROM running_sessions WHERE status='completed' LIMIT 1")[0]['id']
    tap('run-row-' + run_id)
    seek('경로 링크 공유'); capture('legacy-run-share')
    tap('service-back'); tap('service-back')
    tap('service-menu'); seek('open-development'); tap('open-development')
    seek('개발 환경 확인'); tap('개발 환경 확인')
    capture('development-environment'); tap('RunPen 공통 UI 미리보기 열기')
    capture('development-ui-preview')
    shell('input', 'keyevent', '4'); tap('service-back'); tap('service-back'); tap('service-back')
    assert find(capture('development-back-home'), 'tab-home').get('selected') == 'true'
    print('PASS: cold course link/back, GPX chooser/cancel, legacy run detail/share entry, development/environment/UI preview/back')


def cleanup():
    baseline = json.loads((OUT / 'before.json').read_text(encoding='utf8'))
    seeded = json.loads((OUT / 'seeded-before-update.json').read_text(encoding='utf8'))
    assert all(t['count'] == 0 for t in baseline.values()), 'Only the originally empty QA database may be restored'
    assert not query("SELECT id FROM running_sessions WHERE status <> 'completed'")
    assert not query('SELECT owner_id FROM sync_accounts')
    package_path = shell('pm', 'path', APP).decode().strip().removeprefix('package:')
    assert package_path.startswith('/data/app/') and package_path.endswith('/base.apk') and '\n' not in package_path
    installed_hash = shell('sha256sum', package_path).decode().split()[0]
    apk = ROOT / 'build/install/running-art-0.1.0-20261012-service-s0.apk'
    assert installed_hash == hashlib.sha256(apk.read_bytes()).hexdigest()
    (OUT / 'installed.json').write_text(json.dumps({'sha256': installed_hash, 'bytes': apk.stat().st_size}), encoding='utf8')
    for table, where in [('saved_courses', " WHERE id='" + 'd'*32 + "'"), ('storage_test_notes', '')]:
        rows = query('SELECT * FROM ' + table + where)
        encoded = sorted(json.dumps(row, sort_keys=True, ensure_ascii=False) for row in rows)
        assert len(rows) == seeded[table]['count']
        assert hashlib.sha256('\n'.join(encoded).encode()).hexdigest() == seeded[table]['hash']
    snapshot('before-cleanup')
    shell('am', 'force-stop', APP)
    adb('push', str(OUT / 'before.db'), '/data/local/tmp/s0-before.db')
    shell('sh', '-c', 'cat /data/local/tmp/s0-before.db > ' + shlex.quote(DB))
    shell('rm', '-f', DB + '-wal', DB + '-shm', '/data/local/tmp/s0-before.db')
    assert snapshot('after-cleanup') == baseline
    shell('settings', 'put', 'system', 'font_scale', '1.0')
    shell('wm', 'density', 'reset')
    shell('settings', 'put', 'system', 'screen_off_timeout', '60000')
    shell('rm', '-f', '/data/local/tmp/running-ui-dump.jar', '/data/local/tmp/running-qa.xml', '/data/local/tmp/local/tmp/running-qa.xml')
    services = shell('dumpsys', 'activity', 'services', APP).decode()
    assert not re.search(r'^  \* ServiceRecord.*com\.runningart\.mobile\.dev/', services, re.M)
    print('PASS: seeded course/note hashes preserved; nine original empty tables restored; helper removed, no active service, font/density restored, screen timeout set to 60 seconds')


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    assert 'RunningArt_UI_QA' in adb('emu', 'avd', 'name').decode()
    action = sys.argv[1]
    if action == 'capture':
        tree = capture(sys.argv[2])
        print(json.dumps([{'id': n.get('resource-id'), 'text': n.get('text'), 'desc': n.get('content-desc'), 'selected': n.get('selected'), 'bounds': n.get('bounds')} for n in nodes(tree) if n.get('text') or n.get('content-desc') or n.get('resource-id')], ensure_ascii=False))
    elif action == 'tap':
        tap(sys.argv[2])
    elif action == 'seek':
        seek(sys.argv[2])
    elif action == 'open':
        shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'runningart:///' + sys.argv[2], APP)
    elif action == 'snapshot':
        snapshot(sys.argv[2])
    elif action == 'seed':
        seed()
    elif action == 'navigation':
        navigation()
    elif action == 'calculation':
        calculation()
    elif action == 'gps':
        gps_navigation()
    elif action == 'course-prep':
        course_preparation()
    elif action == 'scaled':
        try:
            scaled()
        finally:
            shell('settings', 'put', 'system', 'font_scale', '1.0')
            shell('wm', 'density', 'reset')
    elif action == 'compatibility':
        compatibility()
    elif action == 'cleanup':
        cleanup()
    elif action == 'callback':
        shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'runningart:///auth/callback?error=access_denied&error_description=S0_cancelled', APP)
        time.sleep(2)
        tree = capture('auth-cancel-callback')
        assert find(tree, 'tab-account').get('selected') == 'true'
        tap('tab-courses')
        seek('distance-3')
        tree = capture('draft-after-callback')
        assert find(tree, 'distance-3').get('selected') == 'true'
        assert find(tree, 'shape-star').get('selected') == 'true'
        print('PASS: cancelled OAuth callback reaches account and keeps existing draft')
    elif action == 'setup':
        adb('push', str(ROOT / '.cache/running-qa/ui-dump.jar'), '/data/local/tmp/running-ui-dump.jar')
        for p in ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'ACCESS_BACKGROUND_LOCATION', 'POST_NOTIFICATIONS']:
            shell('pm', 'grant', APP, 'android.permission.' + p)
    elif action == 'tabs':
        for value in ['archive', 'account', 'courses', 'run', 'home']:
            tap('tab-' + value)
            tree = capture('tab-' + value)
            tab = find(tree, 'tab-' + value)
            assert tab is not None and tab.get('selected') == 'true', value
            assert sum(find(tree, 'tab-' + t) is not None for t in ['home', 'courses', 'run', 'archive', 'account']) == 5
            assert not any('러닝 복원:' in n.get('text', '') for n in nodes(tree))
        assert not query("SELECT id FROM running_sessions WHERE status <> 'completed'")
        assert '* ServiceRecord' not in shell('dumpsys', 'activity', 'services', APP).decode().split('Last ANR service:')[0]
        print('PASS: five tabs, selected accessibility, no automatic GPS start, no recovery error')
    else:
        raise ValueError(action)


if __name__ == '__main__':
    main()
