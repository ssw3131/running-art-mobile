"""Keep emulator GPS fresh while observing the product's preparation gate."""
import time


def confirm_preparation(q, position, name, *, timeout=8, clock=time.monotonic, sleep=time.sleep):
    assert q.SERIAL.startswith('emulator-'), 'Physical devices are forbidden'
    longitude, latitude = map(str, position)
    deadline = clock() + timeout
    while clock() < deadline:
        q.adb('emu', 'geo', 'fix', longitude, latitude, '0', '10')
        tree = q.capture(name)
        button = q.find(tree, 'run-preparation-confirm')
        if button is None:
            raise AssertionError('Preparation notice disappeared before a ready confirmation')
        if button.get('enabled') == 'true':
            # tap() captures again. Refresh the five-second fix window before
            # that separate read, rather than accepting or bypassing disabled UI.
            q.adb('emu', 'geo', 'fix', longitude, latitude, '0', '10')
            q.tap('run-preparation-confirm')
            return
        sleep(.5)
    raise AssertionError('Preparation confirmation did not become enabled with fresh course GPS')
