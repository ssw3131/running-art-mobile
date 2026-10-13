"""Reusable isolated-emulator S0 suite. Never accepts a physical phone serial.

Runs the established ADB scenarios without product fixture hooks. Test databases
are generated from public assets; logs/screens are confined to the output folder.
"""
import argparse
import hashlib
import importlib.util
import json
import os
import pathlib
import platform
import re
import subprocess
import time
from datetime import datetime, timezone
from sqlite_snapshot import query_snapshot
from display_profile import PIXEL5, device_overlays, display_geometry, is_pixel5_geometry

ROOT = pathlib.Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--serial', required=True)
parser.add_argument('--apk', required=True, type=pathlib.Path)
parser.add_argument('--repeat', type=int, default=1)
parser.add_argument('--smoke', action='store_true')
parser.add_argument('--visual-only', action='store_true', help='Capture candidates only; does not count as a functional pass')
parser.add_argument('--output', type=pathlib.Path, default=ROOT / 'test-results/android')
args = parser.parse_args()
assert args.serial.startswith('emulator-') and args.serial[9:].isdigit(), 'Physical devices are forbidden'
assert 1 <= args.repeat <= 10
sdk = pathlib.Path(os.environ.get('ANDROID_HOME', ROOT / '.tools/android-sdk'))
adb = sdk / ('platform-tools/adb.exe' if os.name == 'nt' else 'platform-tools/adb')
spec = importlib.util.spec_from_file_location('s0', ROOT / 'scripts/qa/service-s0.py')
q = importlib.util.module_from_spec(spec)
spec.loader.exec_module(q)
q.ADB, q.SERIAL = adb, args.serial

def seek_visible(key):
    """Use the actual scroll viewport; do not assume a 2340px display."""
    for _ in range(20):
        tree = q.capture('current')
        node = q.find(tree, key)
        scrolls = [n for n in tree.iter('node') if n.get('scrollable') == 'true' and
                   'Horizontal' not in n.get('class', '')]
        bounds = [list(map(int, re.findall(r'\d+', n.get('bounds')))) for n in scrolls]
        bounds = [b for b in bounds if b[2]-b[0] > 300 and b[3]-b[1] > 220]
        if not bounds:
            if node is not None and node.get('enabled') == 'true':
                b = list(map(int, re.findall(r'\d+', node.get('bounds'))))
                if b[2] > b[0] and b[3] > b[1]: return
            raise RuntimeError('No scroll viewport for: ' + key)
        # Bottom form below a fixed map takes precedence over a large ancestor.
        left, top, right, bottom = max(bounds, key=lambda b: b[1])
        tab = q.find(tree, 'tab-home')
        if tab is not None: bottom = min(bottom, int(re.findall(r'\d+', tab.get('bounds'))[1]))
        upwards = False
        if node is not None:
            x1,y1,x2,y2 = map(int,re.findall(r'\d+',node.get('bounds')))
            if node.get('enabled') == 'true' and x2>x1 and y2-y1>=30 and top<=y1<y2<=bottom: return
            upwards = y2 <= top + 10
        start, end = bottom-45, top+max(50,int((bottom-top)*.22))
        if upwards: start,end=end,start
        q.shell('input','swipe',str(right-25),str(start),str(right-25),str(end),'350')
    raise RuntimeError('Control not reached: ' + key)

q.seek = seek_visible
avd = q.adb('emu', 'avd', 'name').decode().splitlines()[0]
assert avd in ['RunningArt_UI_QA', 'RunPen_CI'], f'Unapproved AVD: {avd}'
args.output.mkdir(parents=True, exist_ok=True)
args.apk = args.apk.resolve()
assert args.apk.is_file()

def run(command, **kwargs):
    subprocess.run([str(part) for part in command], cwd=ROOT, check=True, timeout=360, **kwargs)

def build_helper():
    folder = ROOT / '.cache/running-qa'
    for child in ['ui-classes', 'ui-dex']:
        (folder / child).mkdir(parents=True, exist_ok=True)
    api = sdk / 'platforms/android-36'
    cp = os.pathsep.join(str(api / item) for item in ['android.jar', 'uiautomator.jar', 'optional/android.test.base.jar'])
    run(['javac', '-source', '8', '-target', '8', '-cp', cp, '-d', folder / 'ui-classes', ROOT / 'scripts/qa/RunningUiDump.java'])
    run([sdk / ('build-tools/36.0.0/d8.bat' if os.name == 'nt' else 'build-tools/36.0.0/d8'), '--lib', api / 'android.jar', '--classpath', api / 'uiautomator.jar', '--output', folder / 'ui-dex', folder / 'ui-classes/RunningUiDump.class'])
    run(['jar', 'cf', folder / 'ui-dump.jar', '-C', folder / 'ui-dex', 'classes.dex'])

build_helper()
for script in ['course-gps-fixture.mjs', 'free-loop-fixture.mjs']:
    run(['node', 'scripts/qa/' + script])
q.adb('root'); q.adb('wait-for-device')
q.adb('install', '-r', '--no-streaming', str(args.apk), timeout=180)
q.adb('push', str(ROOT / '.cache/running-qa/ui-dump.jar'), '/data/local/tmp/running-ui-dump.jar')
q.shell('wm', 'size', '1080x2340'); q.shell('wm', 'density', '420')
for namespace, key, value in [('system', 'font_scale', '1.0'), ('system', 'screen_off_timeout', '1800000'),
                              ('global', 'window_animation_scale', '0'), ('global', 'transition_animation_scale', '0'), ('global', 'animator_duration_scale', '0')]:
    q.shell('settings', 'put', namespace, key, value)
q.shell('setprop', 'persist.sys.timezone', 'UTC')
q.shell('input', 'keyevent', '82')
environment = {'host': platform.system(), 'api': q.shell('getprop', 'ro.build.version.sdk').decode().strip(),
               'fingerprint': q.shell('getprop', 'ro.build.fingerprint').decode().strip(), 'size': '1080x2340', 'density': 420,
               'fontScale': 1, 'locale': q.shell('getprop', 'persist.sys.locale').decode().strip()}
environment['locale'] = environment['locale'] or q.shell('getprop', 'ro.product.locale').decode().strip()
environment['timezone'] = q.shell('getprop', 'persist.sys.timezone').decode().strip()
environment['systemBar'] = 'demo-1200-full-signal-battery100-v1'
if int(environment['api']) >= 36:
    environment['displayProfile'] = 'pixel_5-overlays-v1'
# Android 10's sqlite3 shell predates -json. Preserve numeric/null/string values
# with a consistent online backup queried by the host, rather than parsing CSV.
if int(environment['api']) < 30:
    q.query = lambda sql: query_snapshot(q.adb, q.shell, q.DB, sql)
report = {'schemaVersion': 1, 'source': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
          'dirty': bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True).strip()),
          'startedAt': datetime.now(timezone.utc).isoformat(), 'ciRun': os.environ.get('GITHUB_RUN_ID'),
          'apkSha256': hashlib.sha256(args.apk.read_bytes()).hexdigest(), 'environment': environment,
          'fixtureSha256': hashlib.sha256((ROOT / '.cache/course-gps-qa/fixtures.json').read_bytes()).hexdigest(),
          'mode': 'visual-only' if args.visual_only else 'smoke' if args.smoke else 'full', 'attempts': [], 'retries': 0}
maestro = next((ROOT / '.tools/maestro-2.11.0').rglob('maestro.bat' if os.name == 'nt' else 'bin/maestro'), None)
assert maestro is not None, 'Run scripts/qa/install-maestro.py first'
original_overlays = None


def restart_system_ui():
    old = q.shell('pidof', 'com.android.systemui').decode().split()
    assert old and all(pid.isdigit() for pid in old), 'SystemUI process unavailable'
    q.shell('kill', *old)
    for _ in range(30):
        try:
            current = q.shell('pidof', 'com.android.systemui').decode().split()
            if current and not set(old) & set(current):
                return
        except RuntimeError:
            pass
        time.sleep(1)
    raise RuntimeError('SystemUI did not restart after display configuration')


def pin_display(folder):
    global original_overlays
    if int(environment['api']) < 36:
        return
    overlays = device_overlays(q.shell('cmd', 'overlay', 'list').decode())
    assert PIXEL5 <= overlays.keys(), 'Pixel 5 overlays unavailable on this image'
    if original_overlays is None:
        original_overlays = {name for name, enabled in overlays.items() if enabled}
    for name, enabled in overlays.items():
        if enabled and name not in PIXEL5:
            q.shell('cmd', 'overlay', 'disable', name)
        elif not enabled and name in PIXEL5:
            q.shell('cmd', 'overlay', 'enable', name)
    # SystemUI can retain the old 63px window while drawing the new cutout
    # profile, clipping the clock. Recreate this emulator-only system process.
    restart_system_ui()
    # Do not launch React Native with stale initial safe-area metrics while the
    # OS applies overlay/density changes. This waits for state, not a scenario retry.
    for _ in range(30):
        raw = q.shell('dumpsys', 'window', 'displays').decode()
        (folder / 'display-profile.txt').write_text(raw, encoding='utf8')
        try:
            geometry = display_geometry(raw)
            valid = is_pixel5_geometry(geometry) if platform.system() == 'Linux' else geometry['statusBar'][3] == geometry['cutoutInsets'][1] > 100
            if valid:
                overlay_text = q.shell('cmd', 'overlay', 'list').decode()
                (folder / 'display-overlays.txt').write_text(overlay_text, encoding='utf8')
                assert {name for name, enabled in device_overlays(overlay_text).items() if enabled} == PIXEL5
                report['displayGeometry'] = geometry
                return
        except ValueError:
            pass
        time.sleep(1)
    raise RuntimeError('Pixel 5 OS insets did not settle; see display-profile.txt')

def save_report():
    (args.output / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf8')

def preserved_fixture():
    # Match complete original rows, including timestamps and snapshot content.
    return {'course': q.query("SELECT * FROM saved_courses WHERE id='" + 'd'*32 + "'"),
            'note': q.query("SELECT * FROM storage_test_notes WHERE content='S0 preservation fixture'")}

def demo(command, **values):
    extras = ['-e', 'command', command]
    for key, value in values.items(): extras += ['-e', key, value]
    q.shell('am', 'broadcast', '-a', 'com.android.systemui.demo', *extras)

def capture_visuals():
    q.shell('settings', 'put', 'global', 'sysui_demo_allowed', '1')
    demo('enter'); demo('clock', hhmm='1200')
    demo('battery', level='100', plugged='false')
    demo('network', wifi='show', level='4', fully='true')
    demo('network', mobile='show', datatype='none', level='4')
    demo('notifications', visible='false')
    screens = []
    try:
        for tab in ['home', 'run', 'archive', 'account']:
            q.tap('tab-' + tab); q.capture('visual-' + tab)
            if int(environment['api']) >= 36:
                raw = q.shell('dumpsys', 'window', 'displays').decode()
                (q.OUT / ('visual-' + tab + '-display.txt')).write_text(raw, encoding='utf8')
                assert display_geometry(raw) == report['displayGeometry'], 'OS insets changed during capture'
            screens.append({'id': tab, 'file': 'visual-' + tab + '.png'})
        (q.OUT / 'screens.json').write_text(json.dumps({**report, 'screens': screens}, indent=2), encoding='utf8')
    finally:
        demo('exit'); q.shell('settings', 'put', 'global', 'sysui_demo_allowed', '0')

def launch(route=''):
    q.shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'runningart:///' + route, q.APP)
    time.sleep(3)

def callback():
    q.tap('tab-courses'); q.seek('distance-3'); q.tap('distance-3'); q.seek('shape-star'); q.tap('shape-star')
    launch('auth/callback?error=access_denied&error_description=S0_cancelled')
    assert q.find(q.capture('auth-cancel-callback'), 'tab-account').get('selected') == 'true'
    q.tap('tab-courses'); q.seek('distance-3')
    tree = q.capture('draft-after-callback')
    assert q.find(tree, 'distance-3').get('selected') == 'true'
    assert q.find(tree, 'shape-star').get('selected') == 'true'

def maestro_navigation():
    run([maestro, '--device', args.serial, 'test', '--format', 'junit', '--output', q.OUT / 'maestro.xml',
         '--test-output-dir', q.OUT / 'maestro', ROOT / '.maestro/s0-navigation.yaml'],
        env={**os.environ, 'MAESTRO_CLI_NO_ANALYTICS': 'true', 'MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED': 'true'})
    # Driver initialization can reset display overrides. Restore and verify the
    # evidence dimensions before any fixed-size accessibility checks.
    q.shell('wm','size','1080x2340'); q.shell('wm','density','420')
    pin_display(q.OUT)
    time.sleep(2)
    q.capture('after-maestro-display')
    import struct
    assert struct.unpack('>II', (q.OUT/'after-maestro-display.png').read_bytes()[16:24]) == (1080,2340), 'Unexpected display dimensions'

def saved_restart():
    q.shell('am', 'force-stop', q.APP); launch('courses')
    row = q.query("SELECT id FROM saved_courses WHERE name='S0_DRAFT'")
    assert len(row) == 1
    q.seek('course-row-' + row[0]['id']); q.tap('course-row-' + row[0]['id'])
    assert q.find(q.capture('saved-course-restart'), 'course-title') is not None
    q.tap('service-back'); q.tap('tab-home')


def signup_entry():
    # Read-only guest flow: no real social account or product fixtures.
    q.tap('tab-home'); q.seek('home-signup'); q.tap('home-signup')
    tree = q.capture('signup-entry')
    assert q.find(tree, 'signup-entry') is not None
    assert not any('5회 무료' in n.get('text', '') for n in tree.iter('node'))
    q.seek('signup-mode'); q.tap('signup-mode'); q.capture('signup-login')
    q.seek('signup-guest'); q.tap('signup-guest')
    assert q.find(q.capture('signup-guest-return'), 'tab-home').get('selected') == 'true'
    q.tap('tab-account'); q.seek('account-signup'); q.tap('account-signup')
    q.shell('input', 'keyevent', '4')
    time.sleep(1)
    assert q.find(q.capture('signup-account-back'), 'tab-account').get('selected') == 'true'
    try:
        q.shell('wm', 'density', '480'); q.shell('settings', 'put', 'system', 'font_scale', '1.6')
        launch('account-entry')
        q.capture('signup-large-font')
        q.seek('signup-guest'); q.tap('signup-guest')
        assert q.find(q.capture('signup-large-font-return'), 'tab-home').get('selected') == 'true'
    finally:
        q.shell('wm', 'density', '420'); q.shell('settings', 'put', 'system', 'font_scale', '1.0')

try:
    for attempt in range(1, args.repeat + 1):
        q.OUT = args.output / f'attempt-{attempt:02}'
        q.OUT.mkdir(parents=True, exist_ok=True)
        result = {'attempt': attempt, 'startedAt': datetime.now(timezone.utc).isoformat(), 'steps': [], 'status': 'running'}; report['attempts'].append(result)
        pin_display(q.OUT)
        # This runner accepts only dedicated emulator names above. Never physical.
        q.shell('am', 'force-stop', q.APP); q.shell('pm', 'clear', q.APP)
        for permission in ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'ACCESS_BACKGROUND_LOCATION']:
            q.shell('pm', 'grant', q.APP, 'android.permission.' + permission)
        if int(environment['api']) >= 33:
            q.shell('pm', 'grant', q.APP, 'android.permission.POST_NOTIFICATIONS')
        launch(); q.snapshot('empty'); q.seed()
        original_fixture = preserved_fixture()
        steps = [('S0-01-maestro', maestro_navigation),
                 ('S0-02-draft', q.navigation), ('S0-03-oauth-cancel', callback), ('S1-01-signup-entry', signup_entry)]
        if not args.smoke:
            # Free GPS must start without a selected course. Preparation remains
            # selected intentionally, so verify it after the independent GPS run.
            steps += [('S0-04-save', q.calculation), ('S0-04-restart', saved_restart), ('S0-06-gps', q.gps_navigation),
                      ('S0-05-preparation', q.course_preparation), ('S0-07-deep-link-gpx', q.compatibility), ('S0-08-accessibility', q.scaled)]
        if args.visual_only: steps = []
        for scenario, action in steps:
            step = {'id': scenario, 'status': 'running'}; result['steps'].append(step)
            previous_images = set(q.OUT.glob('*.png'))
            started = time.monotonic()
            try:
                print(f'{attempt}: {scenario}', flush=True); action(); step['status'] = 'passed'
                step['screenshots'] = sorted(p.name for p in set(q.OUT.glob('*.png')) - previous_images if p.name != 'current.png')
                step['durationSeconds'] = round(time.monotonic() - started, 3)
                save_report()
            except Exception as error:
                step['status'] = 'failed'; step['error'] = str(error)
                try:
                    failure = q.capture('failure')
                    step['screenshots'] = ['failure.png']
                    if any('System UI isn' in node.get('text', '') for node in failure.iter('node')):
                        step['status'] = 'environment_failure'
                except Exception as capture_error:
                    step['captureError'] = str(capture_error)
                raise
        assert preserved_fixture() == original_fixture, 'Original fixture rows changed'
        result['preservation'] = {'status': 'passed', 'sha256': hashlib.sha256(json.dumps(original_fixture, sort_keys=True).encode()).hexdigest()}
        q.shell('wm', 'density', '420'); q.shell('settings', 'put', 'system', 'font_scale', '1.0')
        pin_display(q.OUT)
        # Fixed visual fixtures, independent of the timestamped GPS scenario.
        q.shell('am', 'force-stop', q.APP); q.shell('pm', 'clear', q.APP); launch(); q.seed()
        capture_visuals()
        result['status'] = 'passed'
        result['finishedAt'] = datetime.now(timezone.utc).isoformat()
        save_report()
except Exception as error:
    report['error'] = str(error)
    try:
        q.capture('failure')
    except Exception as capture_error:
        report['captureError'] = str(capture_error)
    if report['attempts']: report['attempts'][-1]['status'] = 'failed'
    raise
finally:
    # Clean even after failed assertions, and retain evidence. Dedicated emulator only.
    cleanup_errors = []
    for command in [('am', 'force-stop', q.APP), ('pm', 'clear', q.APP), ('wm', 'size', 'reset'), ('wm', 'density', 'reset'),
                    ('settings', 'put', 'system', 'font_scale', '1.0'),
                    ('am', 'broadcast', '-a', 'com.android.systemui.demo', '-e', 'command', 'exit'),
                    ('settings', 'put', 'global', 'sysui_demo_allowed', '0'),
                    ('rm', '-f', '/data/local/tmp/runpen-qa-query.db', '/data/local/tmp/runpen-qa-query.db-wal', '/data/local/tmp/runpen-qa-query.db-shm', '/data/local/tmp/running-ui-dump.jar', '/data/local/tmp/running-qa.xml', '/data/local/tmp/local/tmp/running-qa.xml')]:
        try: q.shell(*command)
        except Exception as error: cleanup_errors.append({'command': command[:2], 'error': str(error)})
    report['cleanup'] = {'status': 'failed' if cleanup_errors else 'passed', 'errors': cleanup_errors}
    if original_overlays is not None:
        try:
            overlays = device_overlays(q.shell('cmd', 'overlay', 'list').decode())
            for name, enabled in overlays.items():
                if enabled != (name in original_overlays):
                    q.shell('cmd', 'overlay', 'enable' if name in original_overlays else 'disable', name)
            restart_system_ui()
        except Exception as error:
            cleanup_errors.append({'command': ['cmd', 'overlay'], 'error': str(error)})
            report['cleanup']['status'] = 'failed'
    report['finishedAt'] = datetime.now(timezone.utc).isoformat()
    report['status'] = 'passed' if not cleanup_errors and len(report['attempts']) == args.repeat and all(a['status'] == 'passed' for a in report['attempts']) else 'failed'
    save_report()
    if cleanup_errors: raise RuntimeError('Emulator cleanup incomplete; see report.json')
