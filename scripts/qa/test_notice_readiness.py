import unittest
import xml.etree.ElementTree as ET
from unittest.mock import Mock, patch
from service_s56 import wait_notice_detail

LOADING = '<hierarchy><node content-desc="공지 불러오는 중"/></hierarchy>'
READY = '<hierarchy><node text="운영 게시물이 아닙니다."/></hierarchy>'

class NoticeReadinessTest(unittest.TestCase):
    def harness(self, *states):
        q = Mock()
        q.capture.side_effect = [ET.fromstring(state) for state in states]
        q.find.side_effect = lambda tree, key: next(
            (node for node in tree.iter('node')
             if key in (node.get('text'), node.get('content-desc'))), None)
        return q

    def test_waits_for_loading_without_repeating_navigation(self):
        q = self.harness(LOADING, LOADING, READY)
        with patch('service_s56.time.sleep'):
            wait_notice_detail(q)
        self.assertEqual(q.capture.call_count, 3)
        self.assertEqual(len({call.args[0] for call in q.capture.call_args_list}), 3)
        self.assertTrue(all(call[0] in ('capture', 'find') for call in q.method_calls))

    def test_stuck_loading_fails_at_deadline(self):
        q = self.harness(LOADING)
        with self.assertRaisesRegex(RuntimeError, 'readiness deadline'):
            wait_notice_detail(q, timeout=0)
        self.assertEqual(q.capture.call_count, 1)

    def test_terminal_error_is_not_retried_as_loading(self):
        q = self.harness('<hierarchy><node text="공지를 불러오지 못했어요."/></hierarchy>')
        wait_notice_detail(q)
        self.assertEqual(q.capture.call_count, 1)
        # Existing body/offline assertions still reject this terminal screen.

    def test_capture_failure_is_not_suppressed(self):
        q = self.harness()
        q.capture.side_effect = RuntimeError('device offline')
        with self.assertRaisesRegex(RuntimeError, 'device offline'):
            wait_notice_detail(q)
        self.assertEqual(q.capture.call_count, 1)

if __name__ == '__main__':
    unittest.main()
