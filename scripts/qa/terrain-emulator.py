"""UI inspection for this feature's disposable AVD only; never targets a phone."""
import pathlib
import hashlib
import json
import re
import sqlite3
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[2]
ADB = ROOT / '.tools/android-sdk/platform-tools/adb.exe'
OUT = ROOT / '.cache/terrain-qa'
SERIAL = 'emulator-5560'
APP = 'com.runningart.mobile.dev'

def adb(*args):
    result = subprocess.run([str(ADB), '-s', SERIAL, *args], capture_output=True, timeout=45)
    if result.returncode:
        raise RuntimeError(result.stderr.decode(errors='replace'))
    return result.stdout

def capture(name='current'):
    if not re.fullmatch(r'[a-z0-9-]+', name):
        raise ValueError('Invalid name')
    OUT.mkdir(parents=True, exist_ok=True)
    adb('shell', 'uiautomator', 'dump', '/data/local/tmp/terrain-ui.xml')
    raw = adb('exec-out', 'cat', '/data/local/tmp/terrain-ui.xml')
    (OUT / (name + '.xml')).write_bytes(raw)
    (OUT / (name + '.png')).write_bytes(adb('exec-out', 'screencap', '-p'))
    return ET.fromstring(raw)

def visible(node):
    return node.get('resource-id'), node.get('text'), node.get('content-desc')

def tap(key):
    tree = capture()
    node = next((n for n in tree.iter('node') if key in visible(n)), None)
    if node is None:
        raise RuntimeError('Visible control missing: ' + key)
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds')))
    if node.get('enabled') != 'true' or x2 <= x1 or y2 <= y1:
        raise RuntimeError('Control not interactable: ' + key)
    adb('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2))

def snapshot(name):
    if not re.fullmatch(r'[a-z0-9-]+', name):
        raise ValueError('Invalid name')
    destination = OUT / name
    assert not destination.exists(), 'Do not overwrite evidence'
    destination.mkdir(parents=True)
    adb('shell', 'am', 'force-stop', APP)
    adb('pull', '/data/user/0/' + APP + '/files/SQLite', str(destination))
    db = sqlite3.connect(destination / 'SQLite/running-art.db')
    rows = db.execute('select * from saved_courses order by id').fetchall()
    result = {'courses': len(rows), 'courseRowsSha256': hashlib.sha256(json.dumps(rows, ensure_ascii=False).encode()).hexdigest(),
              'schemaVersion': db.execute('pragma user_version').fetchone()[0]}
    db.close()
    (destination / 'summary.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result))

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    assert 'RunningArt_Terrain_QA' in adb('emu', 'avd', 'name').decode()
    action = sys.argv[1]
    if action == 'open':
        adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'runningart:///' + sys.argv[2], APP)
    elif action == 'tap':
        tap(sys.argv[2])
    elif action == 'scroll':
        adb('shell', 'input', 'swipe', '1000', '2050', '1000', '1250', '350')
    elif action == 'up':
        adb('shell', 'input', 'swipe', '1000', '1200', '1000', '2050', '350')
    elif action == 'capture':
        tree = capture(sys.argv[2])
        for node in tree.iter('node'):
            if any(visible(node)):
                print(visible(node), node.get('bounds'))
    elif action == 'chart':
        tree = capture()
        node = next(n for n in tree.iter('node') if n.get('resource-id') == 'terrain-chart')
        x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds')))
        adb('shell', 'input', 'tap', str(round(x1+(x2-x1)*float(sys.argv[2]))), str((y1+y2)//2))
    elif action == 'snapshot':
        snapshot(sys.argv[2])
    elif action == 'apk-hash':
        path = adb('shell', 'pm', 'path', APP).decode().splitlines()[0].removeprefix('package:').strip()
        assert path.startswith('/data/app/') and path.endswith('/base.apk')
        print(adb('shell', 'sha256sum', path).decode().split()[0])
    else:
        raise ValueError('Unknown action')
    time.sleep(.5)
