"""Account UI/settings QA on emulator-5556 only. Preserves original SQLite."""
import argparse
import importlib.util
import json
import pathlib
import re
import sqlite3
import time

ROOT = pathlib.Path.cwd()
spec = importlib.util.spec_from_file_location('account_ui_helpers', ROOT / 'scripts/qa/guidance-emulator.py')
q = importlib.util.module_from_spec(spec)
spec.loader.exec_module(q)
OUT = ROOT / '.cache/account-qa'
OUT.mkdir(exist_ok=True)
q.OUT = OUT
adb = q.adb


def database(name):
    q.snapshot(name)
    db = sqlite3.connect(OUT / name / 'running-art.db')
    db.row_factory = sqlite3.Row
    return db


def prepare():
    assert adb('shell', 'getprop', 'sys.boot_completed').strip() == b'1', 'Wait for emulator boot'
    assert not (OUT / 'original.db').exists(), 'Never overwrite original backup'
    adb('shell', 'am', 'force-stop', q.APP)
    db = database('before')
    assert not db.execute("SELECT 1 FROM running_sessions WHERE status!='completed'").fetchone(), 'Unfinished original run'
    assert not db.execute('SELECT 1 FROM sync_accounts WHERE enabled=1').fetchone(), 'Use a signed-out QA emulator'
    with sqlite3.connect(OUT / 'original.db') as backup:
        db.backup(backup)
    db.close()
    (OUT / 'network-before.json').write_text(json.dumps({
        name: adb('shell', 'settings', 'get', 'global', name).decode().strip()
        for name in ['wifi_on', 'mobile_data']
    }), encoding='utf-8')
    print('Emulator SQLite and connectivity state preserved', flush=True)


def open_page(path):
    adb('shell', 'input', 'keyevent', '224')
    adb('shell', 'wm', 'dismiss-keyguard')
    adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'runningart:///' + path, q.APP)
    time.sleep(3)


def tap(key):
    for _ in range(12):
        nodes = [n for n in q.ui().iter('node') if key in (n.get('resource-id'), n.get('text'), n.get('content-desc'))]
        for n in nodes:
            x1, y1, x2, y2 = map(int, re.findall(r'\d+', n.get('bounds')))
            if n.get('enabled') == 'true' and y2 - y1 >= 32 and 120 < y1 < y2 < 2340:
                adb('shell', 'input', 'tap', str((x1 + x2) // 2), str((y1 + y2) // 2))
                time.sleep(.8)
                return
        adb('shell', 'input', 'swipe', '1000', '2000', '1000', '1150', '220')
    raise RuntimeError('No enabled visible control: ' + key)


def run():
    assert (OUT / 'original.db').exists()
    open_page('account')
    text = q.capture('guest-account')
    assert any('Google로 계속하기' in value for value in text), 'Do not alter real logged-in profiles'
    assert any('내 러닝 기록' in value or '이 기기의 러닝 기록' in value for value in text)
    adb('shell', 'svc', 'wifi', 'disable')
    adb('shell', 'svc', 'data', 'disable')
    open_page('account-settings')
    tap('theme-dark')
    q.capture('settings-dark')
    tap('setting-voice')
    tap('setting-background')
    tap('guidance-mode-focus')
    q.capture('settings-guidance')
    tap('open-os-settings')
    q.capture('android-app-settings')
    adb('shell', 'input', 'keyevent', '4')
    time.sleep(2)
    q.capture('settings-return')
    adb('shell', 'am', 'force-stop', q.APP)
    open_page('account-settings')
    q.capture('settings-restarted')
    db = database('after-settings')
    row = db.execute("SELECT preferences_json FROM account_preferences WHERE owner_id=''").fetchone()
    assert row and json.loads(row[0]) == {'theme': 'dark', 'guidance': {'voice': False, 'background': False, 'mode': 'focus'}}
    db.close()
    open_page('account-profile')
    assert any('로그인' in value for value in q.capture('guest-profile-guard'))
    open_page('account-sync')
    assert any('로그인' in value for value in q.capture('guest-sync-guard'))
    before = json.loads((OUT / 'before.json').read_text())
    after = json.loads((OUT / 'after-settings.json').read_text())
    for table, value in before.items():
        if table not in ['user_version', 'account_preferences']:
            assert value == after[table], 'Original content changed: ' + table
    package_path = adb('shell', 'pm', 'path', q.APP).decode().strip().removeprefix('package:')
    assert package_path.startswith('/data/app/') and '\n' not in package_path
    installed_sha256 = adb('shell', 'sha256sum', package_path).decode().split()[0]
    (OUT / 'ui-report.json').write_text(json.dumps({
        'guest_page': True, 'offline_settings_restart': True, 'permissions_return': True,
        'signed_out_guards': True, 'existing_table_hashes_preserved': True,
        'schema_version': after['user_version'], 'real_profile_server_update': 'not tested',
        'installed_apk_sha256': installed_sha256,
    }, indent=2), encoding='utf-8')
    print('Guest UI, offline restart, permission return and original data hashes passed', flush=True)


def restore():
    assert (OUT / 'original.db').exists()
    q.install_database(OUT / 'original.db')
    network = json.loads((OUT / 'network-before.json').read_text())
    adb('shell', 'svc', 'wifi', 'enable' if network['wifi_on'] != '0' else 'disable')
    adb('shell', 'svc', 'data', 'enable' if network['mobile_data'] == '1' else 'disable')
    before = json.loads((OUT / 'before.json').read_text())
    assert q.snapshot('restored') == before
    print('Original SQLite restored with identical table hashes; network restored', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['prepare', 'run', 'restore'])
    globals()[parser.parse_args().action]()
