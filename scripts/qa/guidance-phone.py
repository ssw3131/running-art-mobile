"""UI and foreground-service evidence on the explicitly selected phone. No DB writes."""
import argparse
import json
import pathlib
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

sys.stdout.reconfigure(encoding='utf-8')
ROOT = pathlib.Path.cwd()
OUT = ROOT / '.cache/guidance-phone'
OUT.mkdir(parents=True, exist_ok=True)
ADB = ROOT / '.tools/android-sdk/platform-tools/adb.exe'
APP = 'com.runningart.mobile.dev'
SERIAL = None

def adb(*args):
    result = subprocess.run([str(ADB), '-s', SERIAL, *args], capture_output=True, timeout=40)
    if result.returncode:
        raise RuntimeError(result.stderr.decode(errors='replace'))
    return result.stdout

def evidence(name, suffix):
    if not re.fullmatch(r'[a-zA-Z0-9_-]+', name):
        raise ValueError('Invalid evidence name')
    return OUT / (name + suffix)

def ui(name='screen'):
    # Use while paused; Samsung's stock dumper waits for a stationary hierarchy.
    adb('shell', 'rm', '-f', '/data/local/tmp/runpen-phone-ui.xml')
    response = adb('shell', 'uiautomator', 'dump', '/data/local/tmp/runpen-phone-ui.xml')
    if b'UI hier' not in response:
        raise RuntimeError(response.decode(errors='replace'))
    raw = adb('shell', 'cat', '/data/local/tmp/runpen-phone-ui.xml')
    evidence(name, '.xml').write_bytes(raw)
    return ET.fromstring(raw)

def describe(tree):
    return [dict(text=n.get('text'), id=n.get('resource-id'), desc=n.get('content-desc'),
                 checked=n.get('checked'), bounds=n.get('bounds')) for n in tree.iter('node')
            if n.get('text') or n.get('resource-id') or n.get('content-desc')]

def tap(key):
    tree = ui()
    nodes = [n for n in tree.iter('node') if key in (n.get('resource-id'), n.get('text'), n.get('content-desc'))]
    if not nodes:
        raise RuntimeError('Control not visible: ' + key)
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', nodes[0].get('bounds')))
    if x2 <= x1 or y2 <= y1:
        raise RuntimeError('Control has empty bounds: ' + key)
    adb('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2))
    time.sleep(.7)

def capture(name):
    tree = ui(name)
    evidence(name, '.png').write_bytes(adb('exec-out', 'screencap', '-p'))
    return describe(tree)

def screen_off(seconds):
    if seconds < 300 or seconds > 900:
        raise ValueError('Screen-off observation must be 300–900 seconds')
    rows = []
    start = time.monotonic()
    adb('shell', 'input', 'keyevent', '223')
    while True:
        power = adb('shell', 'dumpsys', 'power').decode(errors='replace')
        service = adb('shell', 'dumpsys', 'activity', 'services', APP).decode(errors='replace')
        logs = adb('logcat', '-d', '-v', 'threadtime', '-s', 'RunPenGuidance:I', '*:S').decode(errors='replace')
        matches = re.findall(r'mWakefulness=(\w+)', power)
        row = {'elapsed': round(time.monotonic()-start, 1), 'wakefulness': matches[0] if matches else None,
               'service': 'GuidanceService' in service, 'checkpoint': next((line for line in reversed(logs.splitlines()) if 'checkpoint' in line), None)}
        rows.append(row)
        evidence('screen-off-samples', '.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
        evidence('screen-off-native', '.log').write_text(logs, encoding='utf-8')
        print(json.dumps(row, ensure_ascii=False), flush=True)
        if row['elapsed'] >= seconds:
            break
        time.sleep(min(15, seconds-(time.monotonic()-start)))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--serial', required=True)
    parser.add_argument('action', choices=['capture', 'tap', 'screen-off'])
    parser.add_argument('value')
    args = parser.parse_args()
    SERIAL = args.serial
    if args.action == 'capture':
        print(json.dumps(capture(args.value), ensure_ascii=False))
    elif args.action == 'tap':
        tap(args.value)
    else:
        screen_off(int(args.value))
