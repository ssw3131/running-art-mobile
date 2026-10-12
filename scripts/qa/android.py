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
import shutil
import subprocess
import time

ROOT = pathlib.Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--serial', required=True)
parser.add_argument('--apk', required=True, type=pathlib.Path)
parser.add_argument('--repeat', type=int, default=1)
parser.add_argument('--smoke', action='store_true')
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
avd = q.adb('emu', 'avd', 'name').decode().splitlines()[0]
assert avd in ['RunningArt_UI_QA', 'RunPen_CI'], f'Unapproved AVD: {avd}'
args.output.mkdir(parents=True, exist_ok=True)
args.apk = args.apk.resolve()
assert args.apk.is_file()

def run(command, **kwargs):
    subprocess.run([str(part) for part in command], cwd=ROOT, check=True, **kwargs)

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
q.shell('input', 'keyevent', '82')
environment = {'host': platform.system(), 'api': q.shell('getprop', 'ro.build.version.sdk').decode().strip(),
               'fingerprint': q.shell('getprop', 'ro.build.fingerprint').decode().strip(), 'size': '1080x2340', 'density': 420,
               'fontScale': 1, 'locale': q.shell('getprop', 'persist.sys.locale').decode().strip()}
report = {'schemaVersion': 1, 'source': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
          'apkSha256': hashlib.sha256(args.apk.read_bytes()).hexdigest(), 'environment': environment,
          'fixtureSha256': hashlib.sha256((ROOT / '.cache/course-gps-qa/fixtures.json').read_bytes()).hexdigest(), 'attempts': [], 'retries': 0}
maestro = next((ROOT / '.tools/maestro-2.11.0').rglob('maestro.bat' if os.name == 'nt' else 'bin/maestro'), None)
assert maestro is not None, 'Run scripts/qa/install-maestro.py first'

def launch(route=''):
    q.shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'runningart:///' + route, q.APP)
    time.sleep(3)

def callback():
    q.tap('tab-courses'); q.seek('distance-3'); q.tap('distance-3'); q.tap('shape-star')
    launch('auth/callback?error=access_denied&error_description=S0_cancelled')
    assert q.find(q.capture('auth-cancel-callback'), 'tab-account').get('selected') == 'true'
    q.tap('tab-courses'); q.seek('distance-3')
    tree = q.capture('draft-after-callback')
    assert q.find(tree, 'distance-3').get('selected') == 'true'
    assert q.find(tree, 'shape-star').get('selected') == 'true'

def saved_restart():
    q.shell('am', 'force-stop', q.APP); launch('courses')
    row = q.query("SELECT id FROM saved_courses WHERE name='S0_DRAFT'")
    assert len(row) == 1
    q.seek('course-row-' + row[0]['id']); q.tap('course-row-' + row[0]['id'])
    assert q.find(q.capture('saved-course-restart'), 'course-title') is not None
    q.tap('service-back'); q.tap('tab-home')

try:
    for attempt in range(1, args.repeat + 1):
        q.OUT = args.output / f'attempt-{attempt:02}'
        q.OUT.mkdir(parents=True, exist_ok=True)
        result = {'attempt': attempt, 'steps': [], 'status': 'running'}; report['attempts'].append(result)
        # This runner accepts only dedicated emulator names above. Never physical.
        q.shell('am', 'force-stop', q.APP); q.shell('pm', 'clear', q.APP)
        for permission in ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'ACCESS_BACKGROUND_LOCATION']:
            q.shell('pm', 'grant', q.APP, 'android.permission.' + permission)
        if int(environment['api']) >= 33:
            q.shell('pm', 'grant', q.APP, 'android.permission.POST_NOTIFICATIONS')
        launch(); q.snapshot('empty'); q.seed()
        steps = [('S0-01-maestro', lambda: run([maestro, '--device', args.serial, 'test', '--format', 'junit', '--output', q.OUT / 'maestro.xml', '--test-output-dir', q.OUT / 'maestro', ROOT / '.maestro/s0-navigation.yaml'], env={**os.environ, 'MAESTRO_CLI_NO_ANALYTICS': 'true'})),
                 ('S0-02-draft', q.navigation), ('S0-03-oauth-cancel', callback)]
        if not args.smoke:
            steps += [('S0-04-save', q.calculation), ('S0-04-restart', saved_restart), ('S0-05-preparation', q.course_preparation),
                      ('S0-06-gps', q.gps_navigation), ('S0-07-deep-link-gpx', q.compatibility), ('S0-08-accessibility', q.scaled)]
        for scenario, action in steps:
            step = {'id': scenario, 'status': 'running'}; result['steps'].append(step)
            try:
                print(f'{attempt}: {scenario}', flush=True); action(); step['status'] = 'passed'
            except Exception as error:
                step['status'] = 'failed'; step['error'] = str(error)
                q.capture('failure')
                raise
        q.shell('wm', 'density', '420'); q.shell('settings', 'put', 'system', 'font_scale', '1.0')
        q.shell('am', 'force-stop', q.APP); launch()
        screens = []
        for tab in ['home', 'run', 'archive', 'account']:
            q.tap('tab-' + tab); q.capture('visual-' + tab)
            screens.append({'id': tab, 'file': 'visual-' + tab + '.png'})
        (q.OUT / 'screens.json').write_text(json.dumps({**report, 'screens': screens}, indent=2), encoding='utf8')
        result['status'] = 'passed'
except Exception:
    if report['attempts']: report['attempts'][-1]['status'] = 'failed'
    raise
finally:
    # Clean even after failed assertions, and retain evidence. Dedicated emulator only.
    q.shell('am', 'force-stop', q.APP)
    q.shell('pm', 'clear', q.APP)
    q.shell('wm', 'size', 'reset'); q.shell('wm', 'density', 'reset')
    q.shell('settings', 'put', 'system', 'font_scale', '1.0')
    q.shell('rm', '-f', '/data/local/tmp/running-ui-dump.jar', '/data/local/tmp/running-qa.xml', '/data/local/tmp/local/tmp/running-qa.xml')
    report['status'] = 'passed' if len(report['attempts']) == args.repeat and all(a['status'] == 'passed' for a in report['attempts']) else 'failed'
    (args.output / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf8')
