import importlib.util
import pathlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from uuid import UUID

spec = importlib.util.spec_from_file_location('ui_dump_under_test', pathlib.Path(__file__).with_name('service-s0.py'))
q = importlib.util.module_from_spec(spec)
spec.loader.exec_module(q)
TOKEN = '0123456789abcdef0123456789abcdef'


class UiDumpTest(unittest.TestCase):
    def capture(self, folder, code=0, output=b'OK (1 test)', receipt=TOKEN):
        q.OUT = pathlib.Path(folder)
        def shell(*args):
            return receipt.encode() if args[-1].endswith('.token') else b'<hierarchy><node text="fresh"/></hierarchy>'
        with patch.object(q.uuid, 'uuid4', return_value=UUID(TOKEN)), \
             patch.object(q.subprocess, 'run', return_value=subprocess.CompletedProcess([], code, output, b'')), \
             patch.object(q, 'shell', side_effect=shell), patch.object(q, 'adb', return_value=b'PNG'):
            return q.capture('proof')

    def test_success_with_current_receipt(self):
        with tempfile.TemporaryDirectory() as folder:
            self.assertEqual(self.capture(folder).find('node').get('text'), 'fresh')
            self.assertFalse((pathlib.Path(folder) / 'ui-dump-transport.jsonl').exists())

    def test_completed_nonzero_transport_is_recorded_with_fresh_receipt(self):
        with tempfile.TemporaryDirectory() as folder:
            self.assertEqual(self.capture(folder, code=1).find('node').get('text'), 'fresh')
            self.assertIn('"exitCode": 1', (pathlib.Path(folder) / 'ui-dump-transport.jsonl').read_text())

    def test_root_readiness_wait_is_recorded_but_still_requires_receipt(self):
        with tempfile.TemporaryDirectory() as folder:
            output=b'RUNPEN_DUMP_ATTEMPTS=3\nOK (1 test)'
            self.assertEqual(self.capture(folder, output=output).find('node').get('text'), 'fresh')
            self.assertIn('"rootAttempts": 3', (pathlib.Path(folder) / 'ui-dump-readiness.jsonl').read_text())
            with self.assertRaises(RuntimeError):
                self.capture(folder, output=output, receipt='older')

    def test_stale_receipt_or_incomplete_helper_cannot_pass(self):
        with tempfile.TemporaryDirectory() as folder:
            for args in [dict(receipt='older'), dict(code=1, output=b'test started'), dict(output=b'OK (1 test) FAILURES!!!')]:
                with self.subTest(args=args), self.assertRaises(RuntimeError):
                    self.capture(folder, **args)
            self.assertFalse((pathlib.Path(folder) / 'proof.xml').exists())


if __name__ == '__main__':
    unittest.main()
