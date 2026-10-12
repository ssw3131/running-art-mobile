"""Exercise WAL, value types and cleanup for the Android 10 query adapter."""
import pathlib
import sqlite3
import tempfile
import unittest
from contextlib import closing
from sqlite_snapshot import REMOTE_COPY, query_snapshot


class SnapshotQueryTest(unittest.TestCase):
    def test_committed_wal_types_and_cleanup(self):
        with tempfile.TemporaryDirectory() as folder, closing(sqlite3.connect(pathlib.Path(folder) / 'live.db')) as live:
            live.execute('PRAGMA journal_mode=WAL')
            live.execute('CREATE TABLE sample(id INTEGER, amount REAL, label TEXT, missing TEXT)')
            live.execute('INSERT INTO sample VALUES(?,?,?,NULL)', (1791010000000, 1.25, '한글\n"quoted", line'))
            live.commit()
            remote = pathlib.Path(folder) / 'remote.db'
            calls = []

            def shell(*args):
                calls.append(args)
                if args[0] == 'sqlite3':
                    self.assertEqual(args, ('sqlite3', 'device.db', '.backup ' + REMOTE_COPY))
                    with closing(sqlite3.connect(remote)) as copy:
                        live.backup(copy)
                elif args[0] == 'rm':
                    remote.unlink(missing_ok=True)
                else:
                    self.fail(str(args))

            def adb(*args):
                self.assertEqual(args, ('exec-out', 'cat', REMOTE_COPY))
                return remote.read_bytes()

            self.assertTrue((pathlib.Path(folder) / 'live.db-wal').stat().st_size > 0)
            self.assertEqual(query_snapshot(adb, shell, 'device.db', 'SELECT * FROM sample'),
                             [{'id': 1791010000000, 'amount': 1.25, 'label': '한글\n"quoted", line', 'missing': None}])
            self.assertFalse(remote.exists())
            live.execute("UPDATE sample SET amount=2.5"); live.commit()
            self.assertEqual(query_snapshot(adb, shell, 'device.db', 'SELECT amount FROM sample'), [{'amount': 2.5}])
            with self.assertRaises(sqlite3.OperationalError):
                query_snapshot(adb, shell, 'device.db', 'DELETE FROM sample')
            self.assertFalse(remote.exists())
            self.assertEqual(live.execute('SELECT count(*) FROM sample').fetchone()[0], 1)
            def disconnected(*args):
                raise RuntimeError('ADB transfer interrupted')
            with self.assertRaisesRegex(RuntimeError, 'ADB transfer interrupted'):
                query_snapshot(disconnected, shell, 'device.db', 'SELECT * FROM sample')
            self.assertFalse(remote.exists())
            self.assertEqual(calls[-1][0], 'rm')


if __name__ == '__main__':
    unittest.main()
