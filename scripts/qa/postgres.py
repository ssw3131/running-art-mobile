"""Run original transactional SQL checks against the disposable local stack."""
import json
import os
import pathlib
import subprocess
from urllib.parse import urlparse

root = pathlib.Path(__file__).resolve().parents[2]
status = json.loads((root / '.cache/qa-supabase-status.json').read_text())
uri = urlparse(status['DB_URL'])
assert uri.hostname in ['127.0.0.1', 'localhost'], 'Hosted databases are forbidden'
env = {**os.environ, 'PGHOST': uri.hostname, 'PGPORT': str(uri.port), 'PGUSER': uri.username,
       'PGPASSWORD': uri.password, 'PGDATABASE': uri.path.lstrip('/')}
for sql in sorted((root / 'supabase/tests').glob('*.sql')):
    subprocess.run(['psql', '-v', 'ON_ERROR_STOP=1', '-f', str(sql)], env=env, check=True)
