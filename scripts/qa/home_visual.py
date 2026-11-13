"""Deterministic badge eligibility through disposable records, never app hooks."""
import json
import time
from pathlib import Path
from contextlib import contextmanager


@contextmanager
def home_visual(q, launch):
    # All twelve shape goals are earned; distance-10 has just one metre left.
    # It is the unique easiest goal for every production random seed. Records
    # exist only while capturing home, leaving the other three fixtures intact.
    fixture = json.loads(Path(__file__).with_name('home-visual-fixture.json').read_text())
    shapes = fixture['shapes']
    ids = [f'{0x590000 + i:032x}' for i in range(len(shapes))]
    quoted = ','.join("'" + key + "'" for key in ids)
    assert not q.query(f'SELECT id FROM running_sessions WHERE id IN ({quoted})')
    assert not q.query(f'SELECT id FROM sync_deletions WHERE id IN ({quoted})')
    assert not q.query('SELECT id FROM running_sessions'), 'Visual fixture must start without runs'
    before = q.snapshot('visual-home-before')
    owner = "'" + q.OWNER.replace("'", "''") + "'"
    try:
        q.shell('am', 'force-stop', q.APP)
        for i, (key, shape) in enumerate(zip(ids, shapes)):
            stamp = fixture['startedAt'] + i * 1000
            snapshot = json.dumps({'shape': shape, 'targetKm': fixture['targetKm']}, separators=(',', ':'))
            distance = (fixture['totalDistanceM'] - fixture['baseDistanceM'] * (len(shapes) - 1)
                        if i == len(shapes) - 1 else fixture['baseDistanceM'])
            active_ms = fixture['activeMsPerRun']
            # This is badge evidence, not a generated route or GPS trace. No
            # points or valid course snapshot/hash are invented for these rows.
            q.shell('sqlite3', q.DB, f"INSERT INTO running_sessions(id,status,started_at,ended_at,checkpoint_at,resumed_at,owner_id,distance_m,active_ms,course_id,course_name,course_outcome,course_snapshot_json) VALUES('{key}','completed',{stamp},{stamp+active_ms},{stamp},{stamp},{owner},{distance},{active_ms},'{key}','Visual badge evidence','finished','{snapshot}');")
        launch()
        for _ in range(20):
            tree = q.capture('visual-home-ready')
            # At the top of a 1080x2340 viewport the title is below the fold.
            # The original badge and remaining-distance chip are visible.
            if (q.find(tree, 'badge-image-distance-10') is not None
                    and q.find(tree, '1m 남음') is not None):
                break
            time.sleep(.5)
        else:
            raise AssertionError('Unique distance-10 home recommendation not ready')
        yield
    finally:
        q.shell('am', 'force-stop', q.APP)
        q.shell('sqlite3', q.DB, f'DELETE FROM running_sessions WHERE id IN ({quoted});')
        q.shell('sqlite3', q.DB, f"DELETE FROM sync_deletions WHERE owner_id={owner} AND kind='run' AND id IN ({quoted});")
        assert q.snapshot('visual-home-restored') == before, 'Home visual fixture changed original rows'
        launch()
