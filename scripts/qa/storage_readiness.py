"""Wait for real app schema after clearing a dedicated emulator; never create it."""
import time

REQUIRED = {'saved_courses', 'storage_test_notes', 'running_sessions', 'running_points',
            'sync_accounts', 'sync_conflicts', 'sync_deletions', 'account_preferences', 'account_withdrawals'}

def wait_for_storage(q, timeout=30):
    deadline = time.monotonic() + timeout
    last = 'database file not ready'
    while True:
        try:
            q.shell('test', '-s', q.DB)
            tables = {row['name'] for row in q.query("SELECT name FROM sqlite_master WHERE type='table'")}
            if REQUIRED <= tables:
                return
            last = 'missing tables: ' + ', '.join(sorted(REQUIRED - tables))
        except RuntimeError as error:
            last = str(error)
        if time.monotonic() >= deadline:
            raise RuntimeError('App storage did not become ready: ' + last)
        time.sleep(.25)
