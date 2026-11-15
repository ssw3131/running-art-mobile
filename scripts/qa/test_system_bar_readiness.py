import json
import pathlib
import tempfile
import unittest
from system_bar_readiness import pin_system_bar, wait_system_bar


class SystemBarReadinessTest(unittest.TestCase):
    def test_modem_decay_is_refreshed_for_every_observed_frame(self):
        now, strength, pins = [0.], [2], []
        def radio(left):
            strength[0] = 4
            pins.append(left)
            return b'OK\r\n'
        def frame(left):
            return bytes([strength[0]])
        def tick(seconds):
            now[0] += seconds
            strength[0] = 2  # The modem can overwrite the one-time initial pin.
        with tempfile.TemporaryDirectory() as folder:
            out = pathlib.Path(folder)
            result = wait_system_bar(
                lambda left: pin_system_bar(radio, lambda budget: None, left, clock=lambda: now[0]),
                frame, lambda png, left: len(pins) > 1 and png == b'\x04', out, 'home', 2,
                clock=lambda: now[0], sleep=tick)
            self.assertEqual(result, b'\x04')
            log = json.loads((out/'systembar-readiness.jsonl').read_text())
            self.assertEqual(len(pins), 2)
            self.assertTrue(all(s['radioSignalProfile'] == {'profile': 4, 'response': 'OK'} for s in log['samples']))

    def test_radio_time_is_subtracted_before_demo_and_late_pin_fails(self):
        now, received = [0.], []
        def radio(left):
            now[0] += .75
            return b'OK'
        pin_system_bar(radio, lambda left: received.append(left), 1, clock=lambda: now[0])
        self.assertEqual(received, [.25])
        def late_demo(left):
            now[0] += left
        with self.assertRaises(TimeoutError):
            pin_system_bar(radio, late_demo, 1, clock=lambda: now[0])
        with self.assertRaises(TimeoutError):
            pin_system_bar(radio, lambda left: self.fail('Budget exhausted'), .5, clock=lambda: now[0])

    def test_modem_rejection_is_not_hidden_by_demo_success(self):
        for response in [b'KO: failed', b'OK\nKO: failed', b'']:
            with self.assertRaises(RuntimeError):
                pin_system_bar(lambda left: response, lambda left: self.fail('Rejected radio'), 1)

    def test_unready_os_frame_is_preserved_and_exact_ready_bytes_returned(self):
        now = [0.]
        frames = iter([b'partial-signal', b'full-signal'])
        with tempfile.TemporaryDirectory() as folder:
            out = pathlib.Path(folder)
            actual = wait_system_bar(lambda left: None, lambda left: next(frames),
                                     lambda png, left: png == b'full-signal', out, 'home', 2,
                                     clock=lambda: now[0], sleep=lambda seconds: now.__setitem__(0, now[0] + seconds))
            self.assertEqual(actual, b'full-signal')
            log = json.loads((out/'systembar-readiness.jsonl').read_text())
            self.assertEqual([s['fullSignal'] for s in log['samples']], [False, True])
            self.assertEqual((out/log['samples'][0]['file']).read_bytes(), b'partial-signal')

    def test_never_ready_fails_and_records_failure(self):
        now = [0.]
        with tempfile.TemporaryDirectory() as folder:
            out = pathlib.Path(folder)
            with self.assertRaises(TimeoutError):
                wait_system_bar(lambda left: None, lambda left: b'partial', lambda png, left: False,
                                out, 'home', .5, clock=lambda: now[0],
                                sleep=lambda seconds: now.__setitem__(0, now[0] + seconds))
            self.assertEqual(json.loads((out/'systembar-readiness.jsonl').read_text())['status'], 'failed')

    def test_late_ready_response_cannot_extend_deadline(self):
        now = [0.]
        def slow_check(png, left):
            now[0] += 2
            return True
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(TimeoutError):
                wait_system_bar(lambda left: None, lambda left: b'full', slow_check,
                                pathlib.Path(folder), 'home', 1, clock=lambda: now[0])

    def test_command_error_propagates(self):
        def fail(left):
            raise RuntimeError('SystemUI unavailable')
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(RuntimeError, 'SystemUI unavailable'):
                wait_system_bar(fail, lambda left: b'', lambda png, left: True,
                                pathlib.Path(folder), 'home', 1)
