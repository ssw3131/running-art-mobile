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
from home_states import verify_home_states, verify_home_result
from course_generation import generation_flow, scaled_generation
from course_generation_figma import inputs as figma_inputs, real_course as figma_real_course
from service_s234 import service_s234
from service_s56 import service_s56
from storage_readiness import wait_for_storage
import emulator_auth
from signup_membership import signup_membership, wait_home

ROOT = pathlib.Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--serial', required=True)
parser.add_argument('--apk', required=True, type=pathlib.Path)
parser.add_argument('--repeat', type=int, default=1)
parser.add_argument('--smoke', action='store_true')
parser.add_argument('--signup-only', action='store_true', help='Run guest entry plus real pending membership consent/restart; never substitutes for full CI')
parser.add_argument('--home-only', action='store_true', help='Run S1 home and calculation handoff diagnostics; never substitutes for full CI')
parser.add_argument('--home-states-only', action='store_true', help='Diagnose home state/map rendering only; never substitutes for full CI')
parser.add_argument('--accessibility-only', action='store_true', help='Diagnose existing large-font/keyboard checks only; never substitutes for full CI')
parser.add_argument('--map-previews', action='store_true', help='Require real online map previews in a separately authorized local test APK')
parser.add_argument('--service-only', action='store_true', help='Diagnose S234 integration only; never substitutes for full CI')
parser.add_argument('--achievements-only', action='store_true', help='Diagnose S5/S6 only; never substitutes for full CI')
parser.add_argument('--generation-only', action='store_true', help='Run S2a generation and accessibility diagnostics; never substitutes for full CI')
parser.add_argument('--figma-generation-only', action='store_true', help='Figma input, real Korean search/route, save gate; not a full regression')
parser.add_argument('--figma-real-only', action='store_true', help='Diagnose real Figma route/save and scaled UI')
parser.add_argument('--visual-only', action='store_true', help='Capture candidates only; does not count as a functional pass')
parser.add_argument('--output', type=pathlib.Path, default=ROOT / 'test-results/android')
args = parser.parse_args()
assert sum([args.signup_only, args.home_only, args.home_states_only, args.accessibility_only, args.generation_only, args.figma_generation_only, args.figma_real_only, args.service_only, args.achievements_only, args.smoke, args.visual_only]) <= 1, 'Choose one scenario mode'
assert args.serial.startswith('emulator-') and args.serial[9:].isdigit(), 'Physical devices are forbidden'
assert 1 <= args.repeat <= 10
sdk = pathlib.Path(os.environ.get('ANDROID_HOME', ROOT / '.tools/android-sdk'))
adb = sdk / ('platform-tools/adb.exe' if os.name == 'nt' else 'platform-tools/adb')
spec = importlib.util.spec_from_file_location('s0', ROOT / 'scripts/qa/service-s0.py')
q = importlib.util.module_from_spec(spec)
spec.loader.exec_module(q)
q.ADB, q.SERIAL = adb, args.serial
q.MAP_PREVIEWS = args.map_previews

def seek_visible(key, allow_disabled=False):
    """Use the actual scroll viewport; do not assume a 2340px display."""
    upwards = False
    previous = None
    for _ in range(28):
        tree = q.capture('current')
        node = q.find(tree, key)
        scrolls = [n for n in tree.iter('node') if n.get('scrollable') == 'true' and
                   'Horizontal' not in n.get('class', '')]
        bounds = [list(map(int, re.findall(r'\d+', n.get('bounds')))) for n in scrolls]
        bounds = [b for b in bounds if b[2]-b[0] > 300 and b[3]-b[1] > 220]
        if not bounds:
            if node is not None and (allow_disabled or node.get('enabled') == 'true'):
                b = list(map(int, re.findall(r'\d+', node.get('bounds'))))
                if b[2] > b[0] and b[3] > b[1]: return
            raise RuntimeError('No scroll viewport for: ' + key)
        # Bottom form below a fixed map takes precedence over a large ancestor.
        left, top, right, bottom = max(bounds, key=lambda b: b[1])
        tab = q.find(tree, 'tab-home')
        if tab is not None: bottom = min(bottom, int(re.findall(r'\d+', tab.get('bounds'))[1]))
        # Text-only support screens can keep every testID fixed while scrolling.
        # Include visible semantic nodes so movement is not mistaken for an edge.
        signature=tuple((n.get('resource-id'),n.get('text'),n.get('content-desc'),n.get('bounds'))
                        for n in tree.iter('node') if any(n.get(k) for k in ('resource-id','text','content-desc'))
                        and n.get('bounds') != '[0,0][0,0]')
        if signature==previous: upwards=not upwards
        previous=signature
        if node is not None:
            x1,y1,x2,y2 = map(int,re.findall(r'\d+',node.get('bounds')))
            minimum_height = 20 if re.fullmatch(r'distance-\d+', key) else 30
            if (allow_disabled or node.get('enabled') == 'true') and x2>x1 and y2-y1>=minimum_height and top<=y1<y2<=bottom: return
            # API 29 exposes clipped buttons at [0,0][0,0]. Their position is
            # unknown, so retain the search direction instead of forcing up.
            if x2>x1 and y2>y1: upwards = y2 <= top + 10
        # Edge-to-edge screens include the system gesture strip in these bounds.
        # Keep both ends and the horizontal position inside the content viewport.
        start, end = bottom-max(96,int((bottom-top)*.18)), top+max(96,int((bottom-top)*.22))
        if upwards: start,end=end,start
        x = (left + right) // 2
        q.shell('input','swipe',str(x),str(start),str(x),str(end),'350')
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
    helper_names = ['RunningUiDump', 'DrawingGesture']
    run(['javac', '-source', '8', '-target', '8', '-cp', cp, '-d', folder / 'ui-classes', *[ROOT / f'scripts/qa/{name}.java' for name in helper_names]])
    run([sdk / ('build-tools/36.0.0/d8.bat' if os.name == 'nt' else 'build-tools/36.0.0/d8'), '--lib', api / 'android.jar', '--classpath', api / 'uiautomator.jar', '--output', folder / 'ui-dex', *[folder / f'ui-classes/{name}.class' for name in helper_names]])
    run(['jar', 'cf', folder / 'ui-dump.jar', '-C', folder / 'ui-dex', 'classes.dex'])

build_helper()
for script in ['course-gps-fixture.mjs', 'free-loop-fixture.mjs']:
    run(['node', 'scripts/qa/' + script])
q.adb('root'); q.adb('wait-for-device')
q.adb('install', '-r', '--no-streaming', str(args.apk), timeout=180)
q.adb('install', '-r', '--no-streaming', str(emulator_auth.build(ROOT, sdk)))
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
          'mode': 'figma-generation-only' if args.figma_generation_only else 'accessibility-only' if args.accessibility_only else 'achievements-only' if args.achievements_only else 'service-only' if args.service_only else 'visual-only' if args.visual_only else 'signup-only' if args.signup_only else 'home-states-only' if args.home_states_only else 'home-only' if args.home_only else 'generation-only' if args.generation_only else 'smoke' if args.smoke else 'full', 'attempts': [], 'retries': 0}
maestro = next((ROOT / '.tools/maestro-2.11.0').rglob('maestro.bat' if os.name == 'nt' else 'bin/maestro'), None)
if args.figma_real_only: report['mode'] = 'figma-real-only'
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
    prefix = 'runningart://' if route.startswith('auth/callback') else 'runningart:///'
    q.shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', prefix + route, q.APP)
    time.sleep(3)


def callback():
    q.tap('tab-courses'); q.seek('distance-3'); q.tap('distance-3'); q.seek('shape-star'); q.tap('shape-star')
    launch('auth/callback?error=access_denied&error_description=S0_cancelled')
    assert q.find(q.capture('auth-cancel-callback'), 'tab-home').get('selected') == 'true'
    q.tap('tab-courses'); q.seek('distance-3')
    assert q.find(q.capture('draft-after-callback-distance'), 'distance-3').get('selected') == 'true'
    q.seek('shape-star')
    assert q.find(q.capture('draft-after-callback'), 'shape-star').get('selected') == 'true'

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
    launch()
    tree = q.capture('signup-entry')
    assert q.find(tree, 'signup-entry') is not None
    assert q.find(tree, 'tab-home') is None and q.find(tree, 'signup-guest') is None
    assert not any('5회 무료' in n.get('text', '') for n in tree.iter('node'))
    q.seek('signup-mode'); q.tap('signup-mode'); q.capture('signup-login')
    routes = ['run','route-lab','courses','account','courses/'+'d'*32,'runs/'+'9'*32,
              'service-info','development','account-signup','run-card','service-inquiry','_sitemap','unknown-page']
    for i, route in enumerate(routes):
        launch(route)
        tree=q.capture('guest-blocked-'+str(i))
        assert q.find(tree,'signup-entry') is not None and q.find(tree,'tab-home') is None, route
    launch('auth/callback?error=access_denied')
    assert q.find(q.capture('guest-callback-cancel'),'signup-entry') is not None
    q.shell('input','keyevent','4'); launch()
    assert q.find(q.capture('guest-back-restart'),'signup-entry') is not None
    launch('service-policy?kind=terms')
    assert q.find(q.capture('guest-required-policy'),'service-back') is not None
    q.tap('service-back')
    assert q.find(q.capture('guest-policy-back'),'signup-entry') is not None
    try:
        q.shell('wm', 'density', '480'); q.shell('settings', 'put', 'system', 'font_scale', '1.6')
        # Configuration changes recreate the activity. Reach the entry through
        # its real CTA after home is ready, instead of racing a second deep link.
        launch()
        assert q.find(q.capture('signup-large-font'), 'signup-entry') is not None
        q.seek('signup-mode'); q.tap('signup-mode')
    finally:
        q.shell('wm', 'density', '420'); q.shell('settings', 'put', 'system', 'font_scale', '1.0')


def save_and_home():
    generation_flow(q)
    verify_home_result(q)

def reset_app():
    q.shell('am', 'force-stop', q.APP); q.shell('pm', 'clear', q.APP)
    for permission in ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'ACCESS_BACKGROUND_LOCATION']:
        q.shell('pm', 'grant', q.APP, 'android.permission.' + permission)
    if int(environment['api']) >= 33:
        q.shell('pm', 'grant', q.APP, 'android.permission.POST_NOTIFICATIONS')


try:
    for attempt in range(1, args.repeat + 1):
        q.OUT = args.output / f'attempt-{attempt:02}'
        q.OUT.mkdir(parents=True, exist_ok=True)
        result = {'attempt': attempt, 'startedAt': datetime.now(timezone.utc).isoformat(), 'steps': [], 'status': 'running'}; report['attempts'].append(result)
        pin_display(q.OUT)
        # This runner accepts only dedicated emulator names above. Never physical.
        reset_app()
        launch(); wait_for_storage(q); q.snapshot('empty')
        signup_entry()
        result['steps'].append({'id':'AUTH-guest-gate','status':'passed'})
        if args.signup_only or not (args.home_only or args.home_states_only or args.accessibility_only or args.generation_only or args.service_only or args.achievements_only or args.visual_only):
            signup_membership(q, launch)
            result['steps'].append({'id': 'S1-membership-explicit-consent', 'status': 'passed'})
        if args.signup_only:
            result['status'] = 'passed'
            result['finishedAt'] = datetime.now(timezone.utc).isoformat()
            save_report()
            continue
        # Service/home scenarios start from a separately prepared REAL receipt.
        # This setup is not counted as passing the signup UI scenario.
        reset_app()
        emulator_auth.seed(q, 'service'); launch(); wait_home(q); wait_for_storage(q); q.seed()
        original_fixture = preserved_fixture()
        steps = [('S0-01-maestro', maestro_navigation), ('S1-02-home-states', lambda: verify_home_states(q, launch)),
                 ('S0-02-draft', q.navigation), ('S0-03-oauth-cancel', callback)]
        if not args.smoke:
            # Free GPS must start without a selected course. Preparation remains
            # selected intentionally, so verify it after the independent GPS run.
            steps += [('S0-04-save', save_and_home), ('S0-04-restart', saved_restart), ('S0-06-gps', q.gps_navigation),
                      ('S0-05-preparation', q.course_preparation), ('S234-01-integrated', lambda: service_s234(q, launch)), ('S0-07-deep-link-gpx', q.compatibility), ('S0-08-accessibility', q.scaled),
                      ('S2a-02-accessibility', lambda: scaled_generation(q, launch))]
        # The original S0 chain deliberately carries draft/navigation state.
        # S1 returns home and recreates the activity for font/density checks,
        # so run it after that chain rather than breaking its preconditions.
        # Native PNG capture, SAF and theme behavior also need the API 29
        # compatibility run; a modern-Android-only pass is insufficient.
        steps += [('S56-01-achievements-support', lambda: service_s56(q, launch))]
        if args.home_only: steps = [('S1-02-home-states', lambda: verify_home_states(q, launch)),
                                   ('S0-02-draft', q.navigation), ('S0-04-save', save_and_home)]
        if args.home_states_only: steps = [('S1-02-home-states', lambda: verify_home_states(q, launch))]
        if args.accessibility_only: steps = [('S0-08-accessibility', q.scaled), ('S2a-02-accessibility', lambda: scaled_generation(q, launch))]
        if args.generation_only: steps = [('S2a-01-generation', lambda: generation_flow(q)),
                                         ('S2a-02-accessibility', lambda: scaled_generation(q, launch))]
        if args.figma_generation_only: steps = [('Figma-inputs', lambda: figma_inputs(q)),
                                               ('Figma-real-course', lambda: figma_real_course(q)),
                                               ('S2a-02-accessibility', lambda: scaled_generation(q, launch))]
        if args.figma_real_only: steps = [('Figma-real-course', lambda: figma_real_course(q)),
                                         ('S2a-02-accessibility', lambda: scaled_generation(q, launch))]
        if args.service_only: steps = [('S0-05-preparation', q.course_preparation), ('S234-01-integrated', lambda: service_s234(q, launch))]
        if args.achievements_only: steps = [('S56-01-achievements-support', lambda: service_s56(q, launch))]
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
        reset_app(); emulator_auth.seed(q, 'service'); launch(); wait_home(q); wait_for_storage(q); q.seed()
        capture_visuals()
        result['status'] = 'passed'
        result['finishedAt'] = datetime.now(timezone.utc).isoformat()
        save_report()
except Exception as error:
    report['error'] = str(error)
    # UI hierarchy can itself be unavailable. Capture independent diagnostics
    # before cleanup so a real blank/ANR/locked screen cannot be called a flake.
    report['failureDiagnostics'] = []
    for filename, command in [
        ('failure-raw.png', ('exec-out', 'screencap', '-p')),
        ('failure-window.txt', ('shell', 'dumpsys', 'window')),
        ('failure-activity.txt', ('shell', 'dumpsys', 'activity', 'activities')),
        ('failure-logcat.txt', ('logcat', '-d', '-t', '800', '-v', 'threadtime')),
    ]:
        try:
            (q.OUT / filename).write_bytes(q.adb(*command))
            report['failureDiagnostics'].append({'file': filename, 'status': 'saved'})
        except Exception as diagnostic_error:
            report['failureDiagnostics'].append({'file': filename, 'error': str(diagnostic_error)})
    try:
        q.capture('failure')
    except Exception as capture_error:
        report['captureError'] = str(capture_error)
    if report['attempts']: report['attempts'][-1]['status'] = 'failed'
    raise
finally:
    # Clean even after failed assertions, and retain evidence. Dedicated emulator only.
    cleanup_errors = []
    try: q.adb('reverse', '--remove', 'tcp:54431')
    except Exception: cleanup_errors.append({'command': ['adb', 'reverse'], 'error': 'Could not remove local backend forwarding'})
    try: q.adb('reverse', '--remove', 'tcp:443')
    except Exception: cleanup_errors.append({'command': ['adb', 'reverse'], 'error': 'Could not remove compute forwarding'})
    for command in [('am', 'force-stop', q.APP), ('pm', 'clear', q.APP), ('pm', 'uninstall', emulator_auth.PACKAGE), ('wm', 'size', 'reset'), ('wm', 'density', 'reset'),
                    ('settings', 'put', 'system', 'font_scale', '1.0'),
                    ('am', 'broadcast', '-a', 'com.android.systemui.demo', '-e', 'command', 'exit'),
                    ('settings', 'put', 'global', 'sysui_demo_allowed', '0'),
                    ('rm', '-f', '/data/local/tmp/runpen-qa-query.db', '/data/local/tmp/runpen-qa-query.db-wal', '/data/local/tmp/runpen-qa-query.db-shm', '/data/local/tmp/running-ui-dump.jar', '/data/local/tmp/running-qa.xml', '/data/local/tmp/running-qa.token', '/data/local/tmp/local/tmp/running-qa.xml')]:
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
    report['uiDumpReadinessWaits'] = sum(len(p.read_text(encoding='utf8').splitlines()) for p in args.output.glob('attempt-*/ui-dump-readiness.jsonl'))
    report['uiDumpTransportWarnings'] = sum(len(p.read_text(encoding='utf8').splitlines()) for p in args.output.glob('attempt-*/ui-dump-transport.jsonl'))
    report['status'] = 'passed' if not cleanup_errors and len(report['attempts']) == args.repeat and all(a['status'] == 'passed' for a in report['attempts']) else 'failed'
    save_report()
    if cleanup_errors: raise RuntimeError('Emulator cleanup incomplete; see report.json')
