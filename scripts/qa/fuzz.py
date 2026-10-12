"""Start only the local production HTTP handler with public deterministic roads."""
import pathlib
import os
import subprocess
import sys
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / 'test-results/fuzz'
OUT.mkdir(parents=True, exist_ok=True)
with (OUT / 'server.log').open('w', encoding='utf8') as log:
    server = subprocess.Popen(['node', 'scripts/qa/contract-server.mjs'], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
    try:
        for _ in range(100):
            if server.poll() is not None:
                raise RuntimeError('Contract server exited; see server.log')
            try:
                with urllib.request.urlopen('http://127.0.0.1:8087/healthz', timeout=1) as response:
                    if response.status == 200:
                        break
            except OSError:
                time.sleep(.2)
        else:
            raise RuntimeError('Contract harness readiness timed out')
        executable = pathlib.Path(sys.executable).parent / ('schemathesis.exe' if os.name == 'nt' else 'schemathesis')
        result = subprocess.run([str(executable), 'run', 'server/route-compute/openapi.json',
            '--url', 'http://127.0.0.1:8087', '--seed', '20261013', '--max-examples', '30',
            '--checks', 'not_a_server_error,status_code_conformance,content_type_conformance,response_schema_conformance',
            '--report', 'junit', '--report-dir', str(OUT), '--phases', 'examples,coverage,fuzzing'], cwd=ROOT,
            env={**os.environ, 'PYTHONUTF8': '1', 'PYTHONIOENCODING': 'utf-8', 'NO_COLOR': '1'})
        sys.exit(result.returncode)
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()
