"""Explicit-phone UI evidence and nickname input. No direct app-data writes."""
import argparse
import base64
import importlib.util
import json
import pathlib
import sys
import xml.etree.ElementTree as ET

sys.stdout.reconfigure(encoding='utf-8')
ROOT = pathlib.Path.cwd()
spec = importlib.util.spec_from_file_location('account_phone_ui', ROOT / 'scripts/qa/guidance-phone.py')
q = importlib.util.module_from_spec(spec)
spec.loader.exec_module(q)
q.OUT = ROOT / '.cache/account-phone-qa'
q.OUT.mkdir(exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument('--serial', required=True)
parser.add_argument('action', choices=['capture', 'tap', 'nickname', 'restore-nickname'])
parser.add_argument('value')
args = parser.parse_args()
q.SERIAL = args.serial
if args.action == 'capture':
    # Keep identity text only in ignored evidence; console shows safe UI controls.
    nodes = q.capture(args.value)
    print(json.dumps([n for n in nodes if n['id'] not in ['account-name', 'account-email', 'profile-nickname']], ensure_ascii=False))
elif args.action == 'tap':
    if args.value in ['withdraw-confirm', 'withdraw-resume']:
        raise ValueError('Real-account deletion controls are excluded from phone QA')
    q.tap(args.value)
else:
    value = args.value
    if args.action == 'restore-nickname':
        tree = ET.parse(q.evidence(args.value, '.xml'))
        value = next(n.get('text') for n in tree.iter('node') if n.get('resource-id') == 'profile-nickname')
    encoded = base64.b64encode(value.encode('utf-8')).decode('ascii')
    print(q.adb('shell', 'am', 'instrument', '-w', '-e', 'utf8', encoded,
                'com.runningart.accountqa/com.runningart.accountqa.NicknameInput').decode())
