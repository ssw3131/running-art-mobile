"""Keep emulator GPS fresh while observing the product's preparation gate."""
import time
import json
import threading
from contextlib import contextmanager
from functools import wraps


@contextmanager
def continuous_gps(q, position, *, interval=1):
    """A stationary GPS still emits fresh fixes while slow UI dumps run."""
    assert q.SERIAL.startswith('emulator-'), 'Physical devices are forbidden'
    initial = ('emu', 'geo', 'fix', *map(str, position), '0', '10')
    if getattr(q, '_qa_gps_active', False):
        q.adb(*initial)
        yield
        return
    original = q.adb
    stopped, lock = threading.Event(), threading.Lock()
    current, errors = [initial], []

    def adb(*args, **kwargs):
        if args[:3] == ('emu', 'geo', 'fix'):
            with lock:
                current[0] = args
                return original(*args, **kwargs)
        return original(*args, **kwargs)

    def pump():
        while not stopped.wait(interval):
            try:
                with lock:
                    original(*current[0], timeout=5)
            except Exception as error:
                errors.append(error)
                stopped.set()

    q.adb, q._qa_gps_active = adb, True
    worker = threading.Thread(target=pump, daemon=True)
    try:
        adb(*initial)
        worker.start()
        yield
    finally:
        stopped.set()
        if worker.ident is not None:
            worker.join(6)
        q.adb = original
        del q._qa_gps_active
    if errors:
        raise RuntimeError('Continuous emulator GPS injection failed') from errors[0]


def with_fixture_gps(action):
    @wraps(action)
    def wrapped(q, *args, **kwargs):
        entry = json.loads((q.ROOT / '.cache/free-loop-qa/fixture.json').read_text())
        with continuous_gps(q, entry['snapshot']['route'][0]):
            return action(q, *args, **kwargs)
    return wrapped


def confirm_preparation(q, position, name, *, timeout=20, clock=time.monotonic, sleep=time.sleep, gps_interval=1):
    assert q.SERIAL.startswith('emulator-'), 'Physical devices are forbidden'
    deadline = clock() + timeout
    with continuous_gps(q, position, interval=gps_interval):
        while clock() < deadline:
            tree = q.capture(name)
            button = q.find(tree, 'run-preparation-confirm')
            if button is None:
                raise AssertionError('Preparation notice disappeared before a ready confirmation')
            if button.get('enabled') == 'true':
                q.tap('run-preparation-confirm')
                return
            sleep(.5)
    raise AssertionError('Preparation confirmation did not become enabled with fresh course GPS')
