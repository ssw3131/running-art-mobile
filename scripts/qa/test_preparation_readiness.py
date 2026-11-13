import unittest
from types import SimpleNamespace
from preparation_readiness import confirm_preparation


class PreparationReadinessTest(unittest.TestCase):
    def harness(self, states, serial='emulator-5554'):
        now, calls, pending = [0], [], iter(states)
        q = SimpleNamespace(SERIAL=serial)
        q.adb = lambda *args: calls.append(('gps', args))
        q.capture = lambda name: next(pending)
        q.find = lambda tree, key: tree
        q.tap = lambda key: calls.append(('tap', key))
        return q, calls, lambda: now[0], lambda seconds: now.__setitem__(0, now[0]+seconds)

    def test_disabled_control_requires_fresh_fixes_and_an_enabled_observation(self):
        q, calls, clock, sleep = self.harness([{'enabled':'false'},{'enabled':'true'}])
        confirm_preparation(q,(127,37),'ready',clock=clock,sleep=sleep)
        self.assertEqual([call[0] for call in calls], ['gps','gps','gps','tap'])
        self.assertEqual(calls[-1], ('tap','run-preparation-confirm'))

    def test_timeout_dismissal_is_not_a_successful_confirmation(self):
        q, calls, clock, sleep = self.harness([None])
        with self.assertRaisesRegex(AssertionError,'disappeared'):
            confirm_preparation(q,(127,37),'ready',clock=clock,sleep=sleep)
        self.assertFalse(any(call[0]=='tap' for call in calls))

    def test_unready_control_cannot_be_tapped_at_deadline(self):
        q, calls, clock, sleep = self.harness([{'enabled':'false'}]*2)
        with self.assertRaisesRegex(AssertionError,'did not become enabled'):
            confirm_preparation(q,(127,37),'ready',timeout=1,clock=clock,sleep=sleep)
        self.assertFalse(any(call[0]=='tap' for call in calls))

    def test_physical_device_is_rejected_before_injecting_gps(self):
        q, calls, clock, sleep = self.harness([],serial='physical-phone')
        with self.assertRaisesRegex(AssertionError,'Physical'):
            confirm_preparation(q,(127,37),'ready',clock=clock,sleep=sleep)
        self.assertEqual(calls,[])
