import json
import pathlib
import sqlite3
import subprocess
import unittest
import xml.etree.ElementTree as ET

from home_visual import home_visual

ROOT = pathlib.Path(__file__).resolve().parents[2]


class FixtureDatabase:
    OWNER, APP, DB = 'visual-owner', 'test', ':memory:'

    def __init__(self, migrations):
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        for migration in migrations:
            self.db.executescript(migration)
        self.db.execute("INSERT INTO storage_test_notes(content,created_at,updated_at) VALUES('preserve me',1,1)")
        self.db.execute("INSERT INTO sync_deletions(owner_id,kind,id,remote_version) VALUES('other','run','original',2)")

    def query(self, sql):
        return [dict(row) for row in self.db.execute(sql)]

    def shell(self, *args):
        if args[0] == 'sqlite3':
            self.db.executescript(args[2])

    def snapshot(self, name):
        return {table['name']: self.query('SELECT * FROM ' + table['name'])
                for table in self.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")}

    def capture(self, name):
        # Mirrors the real top viewport from visual276: the title is clipped.
        return ET.fromstring('<hierarchy><node resource-id="badge-image-distance-10"/><node text="1m 남음"/></hierarchy>')

    def find(self, tree, key):
        return next((node for node in tree.iter('node') if key in (node.get('resource-id'), node.get('text'))), None)


class HomeVisualTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.migrations = json.loads(subprocess.check_output([
            'node', '--input-type=module', '-e',
            "import{migrations}from'./src/modules/storage/migrations.ts';console.log(JSON.stringify(migrations))"
        ], cwd=ROOT, text=True))

    def setUp(self):
        self.q = FixtureDatabase(self.migrations)
        self.addCleanup(self.q.db.close)
        self.before = self.q.snapshot('before')

    def test_real_badge_model_is_deterministic_and_original_rows_are_restored(self):
        with home_visual(self.q, lambda: None):
            records = self.q.query("SELECT id,status,started_at AS startedAt,distance_m AS distanceM,active_ms AS activeMs,course_id AS courseId,course_outcome AS courseOutcome,json_extract(course_snapshot_json,'$.shape') AS shape,json_extract(course_snapshot_json,'$.targetKm') AS targetKm FROM running_sessions")
            self.assertEqual(len(records), 12)
            self.assertEqual(sum(row['distanceM'] for row in records), 9999)
            subprocess.run(['node', '--input-type=module', '-e', """
                import assert from 'node:assert/strict';
                import{readFileSync}from'node:fs';
                import{badgeProgress}from'./src/modules/achievements/catalog.ts';
                import{recommendHomeBadge}from'./src/modules/home/recommendation.ts';
                const badges=badgeProgress(JSON.parse(readFileSync(0,'utf8')));
                for(let i=0;i<=1000;i++)assert.equal(recommendHomeBadge(badges,i/1000).badge.definition.id,'distance-10');
            """], cwd=ROOT, input=json.dumps(records), text=True, check=True)
        self.assertEqual(self.q.snapshot('after'), self.before)

    def test_failed_capture_restores_original_rows_and_does_not_leave_tombstones(self):
        with self.assertRaisesRegex(RuntimeError, 'capture failed'):
            with home_visual(self.q, lambda: None):
                raise RuntimeError('capture failed')
        self.assertEqual(self.q.snapshot('after'), self.before)
