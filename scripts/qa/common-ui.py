"""Read/tap only the isolated common-UI emulator; never target a physical phone."""
import pathlib
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[2]
ADB = ROOT / '.tools/android-sdk/platform-tools/adb.exe'
OUT = ROOT / '.cache/common-ui-qa'
OUT.mkdir(parents=True, exist_ok=True)
SERIAL = 'emulator-5558'
APP = 'com.runningart.mobile.dev'

def adb(*args):
    result = subprocess.run([str(ADB), '-s', SERIAL, *args], capture_output=True, timeout=45)
    if result.returncode:
        raise RuntimeError(result.stderr.decode(errors='replace'))
    return result.stdout

def capture(name):
    if not re.fullmatch(r'[a-z0-9-]+', name):
        raise ValueError('Invalid capture name')
    adb('shell', 'uiautomator', 'dump', '/sdcard/common-ui.xml')
    raw = adb('exec-out', 'cat', '/sdcard/common-ui.xml')
    (OUT / (name + '.xml')).write_bytes(raw)
    (OUT / (name + '.png')).write_bytes(adb('exec-out', 'screencap', '-p'))
    return ET.fromstring(raw)

def tap(key):
    tree = capture('before-tap')
    node = next((n for n in tree.iter('node') if key in (n.get('resource-id'), n.get('text'), n.get('content-desc'))), None)
    if node is None:
        raise RuntimeError('Visible control not found: ' + key)
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds')))
    assert node.get('enabled') == 'true' and x2 > x1 and y2 > y1
    adb('shell', 'input', 'tap', str((x1 + x2) // 2), str((y1 + y2) // 2))

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    assert 'RunningArt_UI_QA' in adb('emu', 'avd', 'name').decode()
    action = sys.argv[1]
    if action == 'open':
        adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'runningart:///ui-preview', APP)
    elif action == 'tap':
        tap(sys.argv[2])
    elif action == 'scroll':
        adb('shell', 'input', 'swipe', '980', '1900', '980', '650', '400')
    elif action == 'bottom':
        for _ in range(6):
            adb('shell', 'input', 'swipe', '980', '1800', '980', '550', '300')
    elif action == 'confirm':
        tap('확인')
        (OUT / 'confirm-busy.png').write_bytes(adb('exec-out', 'screencap', '-p'))
        adb('shell', 'input', 'keyevent', '4')
        time.sleep(2)
        tree = capture('confirmed')
        assert not any(n.get('text') == '미리보기를 확인할까요?' for n in tree.iter('node'))
        assert any(n.get('resource-id') == 'ui-preview-scroll' for n in tree.iter('node'))
        print('Confirmation returned to preview')
    elif action == 'confirm-burst':
        tree = capture('before-confirm-burst')
        button = next(n for n in tree.iter('node') if n.get('content-desc') == '확인')
        x1, y1, x2, y2 = map(int, re.findall(r'\d+', button.get('bounds')))
        # All arguments are integers derived from this emulator's visible UI.
        adb('shell', f'for i in 1 2 3 4; do input tap {(x1+x2)//2} {(y1+y2)//2}; done')
        time.sleep(2)
        tree = capture('confirm-burst-result')
        count = next(n.get('text') for n in tree.iter('node') if n.get('resource-id') == 'preview-confirm-count')
        assert count == '확인 실행 ' + sys.argv[2] + '회', count
        print('Four taps:', count)
    elif action == 'back':
        adb('shell', 'input', 'keyevent', '4')
    elif action == 'type':
        tap('preview-name')
        adb('shell', 'input', 'keycombination', '113', '29')
        adb('shell', 'input', 'keyevent', '67')
        for char in sys.argv[2]:
            assert char.isascii()
            adb('shell', 'input', 'text', '%s' if char == ' ' else char)
            time.sleep(0.2)
        adb('shell', 'input', 'keyevent', '4')
        tree = capture('typed')
        actual = next(n.get('text') for n in tree.iter('node') if n.get('resource-id') == 'preview-name')
        assert actual == sys.argv[2], (actual, sys.argv[2])
        print('Input value verified:', actual)
    elif action == 'fast-type':
        tap('preview-name')
        adb('shell', 'input', 'keycombination', '113', '29')
        adb('shell', 'input', 'keyevent', '67')
        assert all(c.isascii() and (c.isalnum() or c == ' ') for c in sys.argv[2])
        adb('shell', 'input', 'text', sys.argv[2].replace(' ', '%s'))
        time.sleep(0.5)
        adb('shell', 'input', 'keyevent', '4')
        tree = capture('fast-typed')
        actual = next(n.get('text') for n in tree.iter('node') if n.get('resource-id') == 'preview-name')
        assert actual == sys.argv[2], (actual, sys.argv[2])
        print('Fast input value verified:', actual)
    elif action == 'capture':
        tree = capture(sys.argv[2])
        print('\n'.join(str({k: n.get(k) for k in ('text', 'content-desc', 'resource-id', 'enabled', 'selected', 'bounds')})
                        for n in tree.iter('node') if n.get('text') or n.get('content-desc') or n.get('resource-id')))
    else:
        raise ValueError('Unknown action')
