"""Fresh S0 screen review on the isolated RunningArt_UI_QA emulator."""
import hashlib
import importlib.util
import json
import pathlib
import re
import shlex
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('s0', ROOT / 'scripts/qa/service-s0.py')
q = importlib.util.module_from_spec(spec)
spec.loader.exec_module(q)
q.OUT = ROOT / '.cache/service-s0-screens-20261012'
q.OUT.mkdir(parents=True, exist_ok=True)


def screen(name, control, tab=None):
    tree = q.capture(name)
    assert q.find(tree, control) is not None, (name, control)
    if tab:
        assert q.find(tree, 'tab-' + tab).get('selected') == 'true'
    print('PASS: ' + name, flush=True)


def review():
    for _ in range(20):
        if q.shell('getprop', 'sys.boot_completed').strip() == b'1':
            break
        time.sleep(2)
    else:
        raise RuntimeError('Emulator boot not complete')
    baseline = q.snapshot('before')
    assert all(t['count'] == 0 for t in baseline.values())
    (q.OUT / 'before.db').write_bytes(q.adb('exec-out', 'cat', q.DB))
    original_timeout = q.shell('settings', 'get', 'system', 'screen_off_timeout').decode().strip()
    (q.OUT / 'settings.json').write_text(json.dumps({'screenTimeout':original_timeout}), encoding='utf8')
    q.shell('settings', 'put', 'system', 'screen_off_timeout', '600000')
    q.adb('push', str(ROOT / '.cache/running-qa/ui-dump.jar'), '/data/local/tmp/running-ui-dump.jar')
    package_path = q.shell('pm', 'path', q.APP).decode().strip().removeprefix('package:')
    assert package_path.startswith('/data/app/') and package_path.endswith('/base.apk') and '\n' not in package_path
    installed = q.shell('sha256sum', package_path).decode().split()[0]
    assert installed == hashlib.sha256((ROOT/'build/install/running-art-0.1.0-20261012-service-s0.apk').read_bytes()).hexdigest()
    entry = json.loads((ROOT/'.cache/free-loop-qa/fixture.json').read_text(encoding='utf8'))
    s = entry['snapshot']
    values = [entry['id'], entry['name'], s['source'], s['shape'], s['targetKm'], s['lengthKm'], s['score'], entry['json'], entry['hash'], 1791010000000, 1791010000000]
    sql = 'INSERT INTO saved_courses(id,name,source,shape,target_km,length_km,score,snapshot_json,snapshot_hash,created_at,updated_at) VALUES(' + ','.join("'" + str(v).replace("'", "''") + "'" for v in values) + ');'
    p = subprocess.run([str(q.ADB), '-s', q.SERIAL, 'shell', shlex.join(['sqlite3', q.DB])], input=sql.encode(), capture_output=True)
    assert p.returncode == 0, p.stderr.decode()
    q.snapshot('seeded')
    q.shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'runningart:///', q.APP)
    q.adb('emu', 'geo', 'fix', str(s['route'][0][0]), str(s['route'][0][1]), '0', '10')
    time.sleep(4)
    tree = q.capture('startup')
    if q.find(tree, 'Wait') is not None:
        q.tap('Wait')
    screen('01-home', 'service-home', 'home')
    screens()


def screens():
    entry = json.loads((ROOT/'.cache/free-loop-qa/fixture.json').read_text(encoding='utf8'))
    s = entry['snapshot']
    q.tap('tab-courses')
    for _ in range(12):
        tree = q.capture('location-wait')
        if q.find(tree, 'While using the app') is not None:
            q.capture('11-location-permission')
            (q.OUT/'permission-granted.txt').write_text('foreground', encoding='utf8')
            q.tap('While using the app')
            continue
        if q.find(tree, 'route-location-loading') is None:
            break
        q.adb('emu', 'geo', 'fix', str(s['route'][0][0]), str(s['route'][0][1]), '0', '10')
        time.sleep(1)
    screen('02-create-map', 'selected-center', 'courses')
    q.seek('distance-3'); q.tap('distance-3'); q.tap('shape-star')
    screen('03-create-options', 'distance-3', 'courses')
    q.tap('tab-run'); screen('04-run', 'run-start', 'run')
    q.tap('tab-archive'); screen('05-archive', 'course-row-'+'f'*32, 'archive')
    q.tap('course-row-'+'f'*32); screen('06-course-detail', 'course-title')
    q.tap('service-back'); q.tap('tab-account'); screen('07-account', 'account-name', 'account')
    q.seek('account-settings'); q.tap('account-settings'); screen('08-settings', '뒤로')
    q.tap('service-back'); q.tap('service-menu'); screen('09-service-info', 'open-development')
    q.tap('service-back'); q.tap('tab-courses')
    tree = q.capture('draft-return')
    assert q.find(tree, 'distance-3').get('selected') == 'true'
    assert q.find(tree, 'shape-star').get('selected') == 'true'
    q.course_preparation()
    q.tap('tab-run')
    q.shell('input', 'swipe', '1000', '850', '1000', '1850', '450')
    screen('10-course-preparation', '코스 러닝 준비', 'run')
    q.tap('tab-home')
    assert not q.query("SELECT id FROM running_sessions WHERE status <> 'completed'")
    assert q.snapshot('after-review') == json.loads((q.OUT/'seeded.json').read_text(encoding='utf8'))
    print('PASS: navigation, retained 3km/star input, course preparation, no GPS recording, seeded data unchanged', flush=True)


def cleanup():
    baseline = json.loads((q.OUT/'before.json').read_text(encoding='utf8'))
    assert all(t['count'] == 0 for t in baseline.values())
    assert not q.query("SELECT id FROM running_sessions WHERE status <> 'completed'")
    q.shell('am', 'force-stop', q.APP)
    q.adb('push', str(q.OUT/'before.db'), '/data/local/tmp/s0-screens-before.db')
    q.shell('sh', '-c', 'cat /data/local/tmp/s0-screens-before.db > ' + shlex.quote(q.DB))
    q.shell('rm', '-f', q.DB+'-wal', q.DB+'-shm', '/data/local/tmp/s0-screens-before.db')
    assert q.snapshot('after-cleanup') == baseline
    timeout = json.loads((q.OUT/'settings.json').read_text(encoding='utf8'))['screenTimeout']
    if timeout == 'null':
        q.shell('settings', 'delete', 'system', 'screen_off_timeout')
    else:
        q.shell('settings', 'put', 'system', 'screen_off_timeout', timeout)
    q.shell('rm', '-f', '/data/local/tmp/running-ui-dump.jar', '/data/local/tmp/running-qa.xml', '/data/local/tmp/local/tmp/running-qa.xml')
    if (q.OUT/'permission-granted.txt').exists():
        q.shell('pm','revoke',q.APP,'android.permission.ACCESS_FINE_LOCATION')
        q.shell('pm','revoke',q.APP,'android.permission.ACCESS_COARSE_LOCATION')
    assert not re.search(r'^  \* ServiceRecord.*com\.runningart\.mobile\.dev/', q.shell('dumpsys','activity','services',q.APP).decode(), re.M)
    print('PASS: original nine tables/settings restored; helper removed and no active service', flush=True)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf8')
    assert 'RunningArt_UI_QA' in q.adb('emu', 'avd', 'name').decode()
    {'review':review, 'screens':screens, 'cleanup':cleanup}[sys.argv[1]]()
