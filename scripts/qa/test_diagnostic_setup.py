import json
import pathlib
import tempfile
import unittest
from unittest.mock import Mock
from diagnostic_setup import prepare_diagnostic


class DiagnosticSetupTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.q = Mock(SERIAL='emulator-5554', APP='isolated.app', OUT=pathlib.Path(self.folder.name))
        self.q.query.return_value = []
        self.reset = Mock(return_value={'course': [{'id': 'original'}], 'note': [{'content': 'original'}]})

    def test_service_owns_its_fixture_without_running_another_acceptance_test(self):
        baseline, proof = prepare_diagnostic(self.q, Mock(), self.reset, Mock(), 'S234-01-integrated')
        self.reset.assert_called_once()
        self.q.seed_preparation_course.assert_called_once()
        self.q.course_preparation.assert_not_called()
        self.assertEqual(proof['status'], 'passed')
        self.assertTrue(baseline['course'])

    def test_generation_uses_explicit_entry_and_actual_scroll_target(self):
        prepare_diagnostic(self.q, Mock(), self.reset, Mock(), 'S2a-01-generation')
        self.q.tap.assert_any_call('open-route-lab')
        self.q.seek.assert_any_call('distance-3')

    def test_bad_preconditions_fail_before_test_and_keep_failed_setup_evidence(self):
        self.q.query.return_value = [{'id': 'active'}]
        with self.assertRaisesRegex(AssertionError, 'no active run'):
            prepare_diagnostic(self.q, Mock(), self.reset, Mock(), 'S234-01-integrated')
        self.q.seed_preparation_course.assert_not_called()
        evidence = json.loads((self.q.OUT / 's234-01-integrated-setup.json').read_text())
        self.assertEqual(evidence['status'], 'failed')
        self.assertIn('durationSeconds', evidence)

    def test_physical_device_is_rejected_before_reset(self):
        self.q.SERIAL = 'phone'
        with self.assertRaises(AssertionError):
            prepare_diagnostic(self.q, Mock(), self.reset, Mock(), 'S2a-01-generation')
        self.reset.assert_not_called()


if __name__ == '__main__':
    unittest.main()
