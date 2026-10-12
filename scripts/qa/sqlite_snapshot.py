"""Read a consistent emulator DB copy without depending on sqlite3 -json."""
import pathlib
import sqlite3
import tempfile

REMOTE_COPY = '/data/local/tmp/runpen-qa-query.db'


def query_snapshot(adb, shell, database, sql):
    try:
        # SQLite online backup includes committed WAL contents. Copying only the
        # live .db file would silently omit writes still in its WAL.
        shell('sqlite3', database, '.backup ' + REMOTE_COPY)
        payload = adb('exec-out', 'cat', REMOTE_COPY)
        with tempfile.TemporaryDirectory(prefix='runpen-qa-query-') as folder:
            file = pathlib.Path(folder) / 'snapshot.db'
            file.write_bytes(payload)
            connection = sqlite3.connect(file)
            try:
                connection.execute('PRAGMA query_only=ON')
                connection.row_factory = sqlite3.Row
                return [dict(row) for row in connection.execute(sql)]
            finally:
                connection.close()
    finally:
        shell('rm', '-f', REMOTE_COPY, REMOTE_COPY + '-wal', REMOTE_COPY + '-shm')
