"""Explicit SM-S942N lock/battery run; no battery simulation or device polling loop."""
from datetime import datetime, timezone, timedelta
import json
from pathlib import Path
import re
import runpy
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
s = runpy.run_path(str(ROOT / 'scripts/qa/phone-followup.py'), run_name='qa')
q = s['q']
q.OUT = ROOT / '.cache/phone-lock-battery-20261011'
q.OUT.mkdir(exist_ok=True)


def stamp():
    return datetime.now(timezone(timedelta(hours=9))).isoformat(timespec='seconds')


def observe(name):
    battery = {}
    for line in q.adb('shell', 'dumpsys', 'battery').decode().splitlines():
        m = re.match(r'\s*(AC powered|USB powered|Wireless powered|Dock powered|status|level|scale|temperature|Charge counter):\s*(.+)', line)
        if m:
            battery[m.group(1)] = m.group(2)
    power = q.adb('shell', 'dumpsys', 'power').decode()
    services = q.adb('shell', 'dumpsys', 'activity', 'services', q.APP).decode()
    result = {'observedAtKst': stamp(), 'hostEpochMs': int(time.time() * 1000),
              'deviceEpochMs': q.adb('shell', 'date', '+%s%3N').decode().strip(),
              'battery': battery, 'wakefulness': re.findall(r'mWakefulness=(\w+)', power),
              'locationTaskService': 'LocationTaskService' in services,
              'batterySaver': q.adb('shell', 'settings', 'get', 'global', 'low_power').decode().strip(),
              'stayAwakeWhilePlugged': q.adb('shell', 'settings', 'get', 'global', 'stay_on_while_plugged_in').decode().strip()}
    s['save'](name, result)
    print(json.dumps(result, ensure_ascii=False), flush=True)
    return result


def start():
    assert not q.evidence('gps-test-start', '.json').exists(), 'A test was already started; do not create another'
    assert q.evidence('baseline', '.json').is_file() and q.evidence('baseline-backup', '.txt').is_file()
    assert '(nothing)' in q.adb('shell', 'dumpsys', 'activity', 'services', q.APP).decode()
    s['page']('run')
    tree = s['ui']('start-guard')
    assert s['find']('run-status', tree) is None, 'Existing run must not be resumed as a new test'
    s['save']('gps-test-start', {'since': int(time.time() * 1000), 'startedCommandAtKst': stamp()})
    s['tap']('run-start')
    s['tap']('계속')
    time.sleep(12)
    tree = s['ui']('run-started', True)
    assert s['find']('run-status', tree).get('text') == '러닝 중'
    assert s['find']('run-error', tree) is None
    for key in ['run-status', 'run-duration', 'run-signal']:
        node = s['find'](key, tree)
        if node is not None:
            print(key + ': ' + node.get('text', ''), flush=True)
    assert observe('running-before-lock')['locationTaskService']


def lock():
    assert q.evidence('run-started', '.xml').is_file()
    before = observe('before-lock')
    assert before['locationTaskService']
    q.adb('shell', 'input', 'keyevent', '223')
    time.sleep(3)
    after = observe('locked-awaiting-unplug')
    assert after['locationTaskService'] and after['wakefulness'] and all(v != 'Awake' for v in after['wakefulness'])
    s['save']('phase', {'state': 'locked-awaiting-physical-unplug', 'atKst': stamp(),
                       'minimumUnpluggedMinutes': 30, 'completed': False})


if __name__ == '__main__':
    assert q.adb('shell', 'getprop', 'ro.product.model').decode().strip() == 'SM-S942N'
    if sys.argv[1] == 'start':
        start()
    elif sys.argv[1] == 'lock':
        lock()
    elif sys.argv[1] == 'observe':
        observe(sys.argv[2])
    else:
        raise ValueError('Expected start, lock, or observe NAME')
