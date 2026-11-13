"""Deterministic badge eligibility through disposable records, never app hooks."""
import json
import time
from contextlib import contextmanager


@contextmanager
def home_visual(q, launch):
    # All twelve shape goals are earned; distance-10 has just one metre left.
    # It is the unique easiest goal for every production random seed. Records
    # exist only while capturing home, leaving the other three fixtures intact.
    shapes = ['heart', 'star', 'cloud', 'crown', 'icecream', 'strawberry',
              'fish', 'bone', 'whale', 'turtle', 'cat', 'dog']
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
            stamp = 1791010000000 + i * 1000
            snapshot = json.dumps({'shape': shape, 'targetKm': 1}, separators=(',', ':'))
            # This is badge evidence, not a generated route or GPS trace. No
            # points or valid course snapshot/hash are invented for these rows.
            q.shell('sqlite3', q.DB, f"INSERT INTO running_sessions(id,status,started_at,ended_at,checkpoint_at,resumed_at,owner_id,distance_m,active_ms,course_id,course_name,course_outcome,course_snapshot_json) VALUES('{key}','completed',{stamp},{stamp+100},{stamp},{stamp},{owner},{1199 if i == 11 else 800},100,'{key}','Visual badge evidence','finished','{snapshot}');")
        launch()
        for _ in range(20):
            tree = q.capture('visual-home-ready')
            title = q.find(tree, 'home-challenge-title')
            if title is not None and title.get('text') == '누적 거리 10km':
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
