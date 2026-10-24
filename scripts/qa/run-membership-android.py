"""Run existing Android QA against real isolated membership, with finally cleanup.
Requires the caller to start its exclusive local Supabase stack and build the QA
APK with localhost TLS. No calls occur on import. No account secrets go to logs.
"""
import json
import os
import pathlib
import ssl
import subprocess
import sys
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
LOCAL = ROOT / '.cache/qa-membership'


def main():
    assert '--serial' in sys.argv and sys.argv[sys.argv.index('--serial') + 1].startswith('emulator-')
    assert not (LOCAL / 'private-state.json').exists(), 'Clean up the previous fixture run first; never overwrite credentials'
    assert (LOCAL / 'tls/ca.crt').is_file(), 'Prepare the native QA TLS build first'
    env = {**os.environ, 'QA_SUPABASE_STATUS': str(pathlib.Path(os.environ.get('QA_SUPABASE_STATUS', ROOT / '.cache/qa-supabase-status.json')).resolve())}
    status = json.loads(pathlib.Path(env['QA_SUPABASE_STATUS']).read_text(encoding='utf8-sig'))
    assert status['API_URL'].rstrip('/') in ['http://127.0.0.1:54321', 'http://localhost:54321'], 'Only the isolated loopback stack is permitted'
    proxy = None
    cleanup_error = False
    result = 1
    def fixture(command):
        return subprocess.run(['node', 'scripts/qa/prepare-membership-fixture.mjs', command], cwd=ROOT, env=env, capture_output=True, timeout=120)
    try:
        with (LOCAL / 'proxy.log').open('wb') as log:
            proxy = subprocess.Popen(['node', 'scripts/qa/android-membership-proxy.mjs'], cwd=ROOT, env=env, stdout=log, stderr=log,
                                     creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
            context = ssl.create_default_context(cafile=str(LOCAL / 'tls/ca.crt'))
            deadline = time.monotonic() + 20
            while True:
                assert proxy.poll() is None, 'Local TLS adapter failed to start'
                try:
                    with urllib.request.urlopen('https://localhost:54431/healthz', context=context, timeout=1) as response:
                        assert response.status == 200
                    break
                except (OSError, ValueError):
                    if time.monotonic() >= deadline: raise RuntimeError('Local TLS adapter not ready')
                    time.sleep(.3)
            assert fixture('prepare').returncode == 0, 'Could not prepare real isolated membership fixtures'
            result = subprocess.run([sys.executable, 'scripts/qa/android.py', *sys.argv[1:]], cwd=ROOT, env=env).returncode
    finally:
        if (LOCAL / 'private-state.json').exists():
            try: cleanup_error = fixture('cleanup').returncode != 0
            except (OSError, subprocess.TimeoutExpired): cleanup_error = True
        if proxy:
            proxy.terminate()
            try: proxy.wait(timeout=10)
            except subprocess.TimeoutExpired: proxy.kill(); proxy.wait()
        (ROOT / '.cache/emulator-auth/session.json').unlink(missing_ok=True)
        # Only this wrapper's ignored local report; do not expose private-state.json.
        (LOCAL / 'cleanup.json').write_text(json.dumps({'status': 'failed' if cleanup_error else 'passed', 'androidExitCode': result}), encoding='utf8')
    if cleanup_error: raise RuntimeError('Fixture cleanup failed. Keep private-state.json and run the documented cleanup command')
    return result


if __name__ == '__main__':
    sys.exit(main())
