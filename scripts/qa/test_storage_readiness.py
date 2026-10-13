import unittest
from unittest.mock import Mock, patch
from storage_readiness import REQUIRED, wait_for_storage

class StorageReadinessTest(unittest.TestCase):
    def test_waits_for_file_then_complete_schema_without_writes(self):
        q=Mock();q.DB='/dedicated/fixture.db'
        q.shell.side_effect=[RuntimeError('missing file'),None,None]
        q.query.side_effect=[[{'name':'saved_courses'}],[{'name':n} for n in REQUIRED]]
        with patch('storage_readiness.time.sleep'):
            wait_for_storage(q)
        self.assertEqual(q.shell.call_count,3)
        self.assertTrue(all(call.args==('test','-s',q.DB) for call in q.shell.call_args_list))
        self.assertTrue(all(call.args[0].startswith('SELECT ') for call in q.query.call_args_list))

    def test_partial_schema_still_fails_at_deadline(self):
        q=Mock();q.query.return_value=[{'name':'saved_courses'}]
        with self.assertRaisesRegex(RuntimeError,'missing tables'):
            wait_for_storage(q,timeout=0)

    def test_database_failure_is_not_accepted_as_ready(self):
        q=Mock();q.shell.side_effect=RuntimeError('device offline')
        with self.assertRaisesRegex(RuntimeError,'device offline'):
            wait_for_storage(q,timeout=0)

if __name__=='__main__':unittest.main()
