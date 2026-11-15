import json
import pathlib
import tempfile
import unittest
from system_bar_readiness import wait_system_bar


class SystemBarReadinessTest(unittest.TestCase):
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
