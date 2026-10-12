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

# Deliberately weaken SELECT in one transaction. The original cross-user check
# must fail; disconnect rolls the transaction back even with ON_ERROR_STOP.
original = (root / 'supabase/tests/personal_records.sql').read_text()
mutant = original.replace('begin;', "begin;\ncreate policy qa_wrong_access on public.personal_records for select to authenticated using (true);", 1)
result = subprocess.run(['psql', '-v', 'ON_ERROR_STOP=1'], input=mutant, text=True, capture_output=True, env=env)
assert result.returncode != 0 and 'other account cannot read' in result.stderr, 'Permission mutation escaped the existing isolation test'
subprocess.run(['psql', '-v', 'ON_ERROR_STOP=1', '-f', str(root / 'supabase/tests/personal_records.sql')], env=env, check=True)
print('PASS: SECURITY-PROBE-01 permissive cross-user policy detected; rollback and original policies verified')
