import unittest
import threading
from types import SimpleNamespace
from preparation_readiness import confirm_preparation, continuous_gps


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
        self.assertTrue(any(call[0]=='gps' for call in calls))
        self.assertEqual(sum(call[0]=='tap' for call in calls), 1)
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

    def test_fixes_continue_during_both_capture_and_tap_and_adb_is_restored(self):
        q, calls, _, _ = self.harness([])
        received = threading.Event()
        main = threading.current_thread()
        def adb(*args, **kwargs):
            calls.append(('gps', args))
            if threading.current_thread() is not main:
                received.set()
        q.adb = adb
        def capture(name):
            self.assertTrue(received.wait(2), 'No fresh fix during slow capture')
            return {'enabled':'true'}
        def tap(key):
            received.clear()
            self.assertTrue(received.wait(2), 'No fresh fix during tap capture')
        q.capture, q.tap = capture, tap
        confirm_preparation(q,(127,37),'ready',gps_interval=.005)
        self.assertIs(q.adb, adb)
        self.assertFalse(hasattr(q, '_qa_gps_active'))

    def test_nested_preparation_keeps_the_scenario_feed_and_tracks_movement(self):
        q, calls, _, _ = self.harness([])
        original = q.adb
        with continuous_gps(q,(127,37)):
            wrapped = q.adb
            with continuous_gps(q,(127,37.001)):
                self.assertIs(q.adb,wrapped)
                q.adb('emu','geo','fix','127','37.002','0','10')
            self.assertIs(q.adb,wrapped)
        self.assertIs(q.adb,original)
        self.assertEqual(calls[-1][1][4], '37.002')
