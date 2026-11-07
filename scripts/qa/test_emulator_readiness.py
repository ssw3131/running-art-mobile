import unittest
from emulator_readiness import wait_package_service


class PackageReadinessTest(unittest.TestCase):
    def harness(self, states):
        ticks = [0]
        calls = []
        pending = iter(states)
        def shell(*args, **kwargs):
            calls.append(args)
            value = next(pending)
            if isinstance(value, Exception):
                raise value
            return value
        def sleep(seconds):
            ticks[0] += seconds
        return shell, calls, lambda: ticks[0], sleep

    def test_requires_consecutive_health_after_transient_binder_failure(self):
        shell, calls, clock, sleep = self.harness([b'1', RuntimeError('broken pipe'), b'1', b'package:/system/framework/framework-res.apk', b'1', b'package:/system/framework/framework-res.apk'])
        result = wait_package_service(shell, clock=clock, sleep=sleep)
        self.assertEqual(result, {'attempts': 3, 'consecutiveHealthyReads': 2})
        self.assertTrue(all(args[0] in ('getprop', 'cmd') for args in calls))
        self.assertFalse(any('install' in args for args in calls))

    def test_deadline_never_reports_failed_package_service_as_ready(self):
        shell, calls, clock, sleep = self.harness([b'0', b'error', b'0', b'error'])
        with self.assertRaisesRegex(RuntimeError, 'installation was not attempted'):
            wait_package_service(shell, timeout=2, clock=clock, sleep=sleep)
        self.assertEqual(len(calls), 4)


if __name__ == '__main__':
    unittest.main()
