import pathlib
import tempfile
import unittest

from visual_readiness import capture_settled

PNG = b'\x89PNG\r\n\x1a\n'


class VisualReadinessTest(unittest.TestCase):
    def run_capture(self, folder, frames):
        now = [0.0]
        iterator = iter(frames)
        def sleep(seconds):
            now[0] += seconds
        capture_settled(lambda remaining: next(iterator), pathlib.Path(folder), 'visual-account',
                        clock=lambda: now[0], sleep=sleep, warmup=2, stable_for=1,
                        timeout=5, interval=.5)
        return now[0]

    def test_transition_resets_settling_and_keeps_original_frames(self):
        with tempfile.TemporaryDirectory() as folder:
            elapsed = self.run_capture(folder, [PNG+b'bar', PNG+b'bar', PNG+b'clear', PNG+b'clear', PNG+b'clear'])
            self.assertEqual(elapsed, 4)
            self.assertEqual((pathlib.Path(folder)/'visual-account.png').read_bytes(), PNG+b'clear')
            self.assertEqual(len(list(pathlib.Path(folder).glob('*-settle-*.png'))), 2)

    def test_never_stable_fails_without_publishing_a_candidate(self):
        with tempfile.TemporaryDirectory() as folder:
            (pathlib.Path(folder)/'visual-account.png').write_bytes(PNG+b'old')
            with self.assertRaisesRegex(RuntimeError, 'did not settle'):
                self.run_capture(folder, [PNG+bytes([n]) for n in range(10)])
            self.assertFalse((pathlib.Path(folder)/'visual-account.png').exists())
            self.assertEqual((pathlib.Path(folder)/'visual-account-before-settle.png').read_bytes(), PNG+b'old')
            self.assertIn('"status": "failed"', (pathlib.Path(folder)/'visual-account-settling.json').read_text())

    def test_capture_error_propagates_and_is_recorded(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(RuntimeError, 'Invalid screenshot'):
                self.run_capture(folder, [b''])
            self.assertIn('"status": "failed"', (pathlib.Path(folder)/'visual-account-settling.json').read_text())

    def test_slow_capture_cannot_pass_after_deadline(self):
        with tempfile.TemporaryDirectory() as folder:
            now = [0.0]
            budgets = []
            def sleep(seconds):
                now[0] += seconds
            def read(remaining):
                budgets.append(remaining)
                now[0] += 2
                return PNG+b'same'
            with self.assertRaisesRegex(RuntimeError, 'did not settle'):
                capture_settled(read, pathlib.Path(folder), 'visual-account',
                                clock=lambda: now[0], sleep=sleep, timeout=5)
            self.assertEqual(budgets, [3, .75])
            self.assertFalse((pathlib.Path(folder)/'visual-account.png').exists())


if __name__ == '__main__':
    unittest.main()
