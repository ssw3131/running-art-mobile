"""Read-only package-service readiness after an isolated AVD/adbd restart."""
import subprocess
import time


def wait_package_service(shell, timeout=45, clock=time.monotonic, sleep=time.sleep):
    deadline = clock() + timeout
    stable = 0
    attempts = 0
    while clock() < deadline:
        attempts += 1
        try:
            boot = shell('getprop', 'sys.boot_completed', timeout=5).decode().strip()
            package = shell('cmd', 'package', 'path', 'android', timeout=5).decode().strip()
            ready = boot == '1' and package.startswith('package:') and package.endswith('.apk')
        except (RuntimeError, subprocess.TimeoutExpired):
            ready = False
        stable = stable + 1 if ready else 0
        if stable >= 2:
            return {'attempts': attempts, 'consecutiveHealthyReads': stable}
        sleep(1)
    raise RuntimeError('Emulator package service did not become ready; APK installation was not attempted')
