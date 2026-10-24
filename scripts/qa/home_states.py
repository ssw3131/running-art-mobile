"""S1 home on the dedicated emulator; synthetic rows only, restored in finally."""
import re
import subprocess
import time


def seek_shape(q, key, direction):
    """S2a uses a wrapping shape grid in the vertical form."""
    q.seek(key)


def verify_home_result(q):
    """Changing the next shape must preserve and identify the previous result."""
    q.tap('tab-courses'); seek_above(q, 'candidate-0')
    candidate = q.find(q.capture('home-existing-result-before'), 'candidate-0')
    previous = candidate.get('content-desc')
    assert previous and '1순위' in previous
    q.tap('tab-home'); q.seek('open-route-lab'); q.tap('open-route-lab')
    q.tap('조건 설정'); q.seek('shape-fish'); q.tap('shape-fish')
    seek_above(q, 'generation-changed')
    assert q.find(q.capture('home-existing-result-notice'), 'generation-changed') is not None
    q.tap('추천 코스')
    q.seek('candidate-0')
    candidate = q.find(q.capture('home-existing-result-preserved'), 'candidate-0')
    assert candidate.get('content-desc') == previous


def seek_above(q, key):
    """Return up a retained form; offscreen nodes may be absent from Android XML."""
    for _ in range(16):
        tree = q.capture('current')
        scrolls = [n for n in tree.iter('node') if n.get('scrollable') == 'true' and 'Horizontal' not in n.get('class', '')]
        bounds = [list(map(int, re.findall(r'\d+', n.get('bounds')))) for n in scrolls]
        left, top, right, bottom = max(bounds, key=lambda b: b[1])
        node = q.find(tree, key)
        if node is not None:
            x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds')))
            if x2 > x1 and y2 - y1 >= 30 and top <= y1 < y2 <= bottom:
                return
        x, height = (left + right) // 2, bottom - top
        q.shell('input', 'swipe', str(x), str(top + int(height * .2)), str(x), str(top + int(height * .8)), '350')
    raise RuntimeError('Control above retained scroll not reached: ' + key)


def verify_home_states(q, launch):
    run_id = '9' * 32
    assert not q.query(f"SELECT id FROM running_sessions WHERE id='{run_id}'")
    assert not q.query(f"SELECT id FROM sync_deletions WHERE owner_id='{q.OWNER}' AND kind='run' AND id='{run_id}'")
    before = q.snapshot('home-before')
    now = int(time.time() * 1000)
    wifi = q.shell('settings', 'get', 'global', 'wifi_on').decode().strip()
    mobile = q.shell('settings', 'get', 'global', 'mobile_data').decode().strip()
    night = re.search(r'Night mode: (yes|no|auto|custom)', q.shell('cmd','uimode','night').decode())
    assert night, 'Night mode must be restorable'
    try:
        q.shell('am','force-stop',q.APP)
        # Temporarily make only this disposable fixture a guest record. A signed-in
        # account must not see or adopt it; restore its exact ownership in finally.
        q.shell('sqlite3',q.DB,f"UPDATE saved_courses SET owner_id='' WHERE id='{'d'*32}';")
        launch(); q.tap('tab-home')
        assert q.find(q.capture('home-initial-top'), 'home-initial') is not None
        q.seek('home-shape-fish'); q.tap('home-shape-fish'); q.seek('open-route-lab'); q.tap('open-route-lab')
        q.seek('shape-star'); seek_shape(q, 'shape-fish', 'left')
        assert q.find(q.capture('home-shape-applied'), 'shape-fish').get('selected') == 'true'
        seek_shape(q, 'shape-star', 'right')
        q.tap('shape-star'); q.tap('tab-home'); q.tap('tab-courses'); q.seek('shape-star')
        assert q.find(q.capture('home-tab-keeps-edited-shape'), 'shape-star').get('selected') == 'true'
        q.tap('tab-home'); q.seek('home-all-shapes'); q.tap('home-all-shapes')
        shapes = q.capture('home-all-shapes-target')
        shape_bounds = list(map(int, re.findall(r'\d+', q.find(shapes,'shape-heart').get('bounds'))))
        assert shape_bounds[2] > shape_bounds[0] and shape_bounds[3] - shape_bounds[1] >= 30, 'All shapes must scroll to a visible choice'
        q.shell('cmd','uimode','night','yes'); launch(); q.capture('home-initial-dark')
        q.shell('cmd','uimode','night',night.group(1))
        q.shell('am', 'force-stop', q.APP)
        q.shell('sqlite3',q.DB,f"UPDATE saved_courses SET owner_id='{q.OWNER}' WHERE id='{'d'*32}';")
        launch()
        assert q.find(q.capture('home-saved-only'),'home-history') is not None
        q.seek('home-course-'+'d'*32); q.tap('home-course-'+'d'*32)
        assert q.find(q.capture('home-saved-detail'),'course-title') is not None
        q.shell('am','force-stop',q.APP)
        q.shell('sqlite3', q.DB, f"INSERT INTO running_sessions(id,status,started_at,ended_at,checkpoint_at,resumed_at,owner_id,distance_m,active_ms,point_count) VALUES('{run_id}','completed',{now},{now+10000},{now},{now},'{q.OWNER}',3200,100000,4);")
        for i, (lat, lng) in enumerate([(37.5, 127), (37.501, 127.001), (37.502, 127), (37.5, 127)], 1):
            q.shell('sqlite3', q.DB, f"INSERT INTO running_points VALUES('{run_id}',{i},0,{now+i},{lat},{lng},5);")
        launch(); q.tap('tab-home')
        q.seek('home-run-'+run_id)
        if getattr(q, 'MAP_PREVIEWS', False):
            time.sleep(8)  # Allow native styles/tiles to load before pixel review.
        history = q.capture('home-history')
        assert q.find(history, 'home-history') is not None
        preview = q.find(history, '실제 러닝 경로') or q.find(history,'home-run-'+run_id)
        subprocess.run(['node', str(q.ROOT / 'scripts/qa/home-preview.mjs'), str(q.OUT / 'home-history.png'),
                        *re.findall(r'\d+', preview.get('bounds')), 'map' if getattr(q, 'MAP_PREVIEWS', False) else 'fallback'], check=True)
        q.shell('dumpsys','gfxinfo',q.APP,'reset')
        for _ in range(3):
            q.shell('input','swipe','540','1700','540','700','350')
            q.shell('input','swipe','540','700','540','1700','350')
        (q.OUT/'home-scroll-gfxinfo.txt').write_bytes(q.shell('dumpsys','gfxinfo',q.APP))
        q.capture('home-after-scroll')
        q.shell('cmd','uimode','night','yes'); launch(); q.capture('home-history-dark')
        q.shell('cmd','uimode','night',night.group(1)); launch()
        q.seek('home-run-' + run_id); q.tap('home-run-' + run_id)
        assert q.find(q.capture('home-record-detail'), 'run-distance').get('text') == '3.20 km'
        q.tap('service-back'); q.tap('tab-home')
        for status in ['paused', 'interrupted']:
            q.shell('am', 'force-stop', q.APP)
            q.shell('sqlite3', q.DB, f"UPDATE running_sessions SET status='{status}',ended_at=NULL WHERE id='{run_id}';")
            launch(); q.tap('tab-home')
            assert q.find(q.capture('home-' + status), 'home-history') is not None
            q.seek('home-run-'+run_id); q.tap('home-run-'+run_id); q.capture('home-' + status + '-return')
            assert q.query(f"SELECT status FROM running_sessions WHERE id='{run_id}'")[0]['status'] == status, 'Home must not resume GPS'
        q.shell('am', 'force-stop', q.APP)
        q.shell('sqlite3', q.DB, f"UPDATE running_sessions SET status='completed',ended_at={now+10000} WHERE id='{run_id}';")
        q.shell('svc', 'wifi', 'disable'); q.shell('svc', 'data', 'disable')
        launch(); assert q.find(q.capture('home-history-offline'), 'home-history') is not None
        q.shell('wm', 'density', '480'); q.shell('settings', 'put', 'system', 'font_scale', '1.6')
        launch(); q.capture('home-history-large-font')
        q.seek('home-more-runs'); q.tap('home-more-runs'); q.capture('home-history-large-font-archive')
    except Exception:
        q.capture('home-failure-before-cleanup')
        raise
    finally:
        q.shell('am', 'force-stop', q.APP)
        q.shell('sqlite3', q.DB, f"DELETE FROM running_points WHERE run_id='{run_id}'; DELETE FROM running_sessions WHERE id='{run_id}';")
        # Deleting an owned fixture correctly creates a sync tombstone. Remove
        # only that test's tombstone; the full snapshot still checks all rows.
        q.shell('sqlite3', q.DB, f"DELETE FROM sync_deletions WHERE owner_id='{q.OWNER}' AND kind='run' AND id='{run_id}';")
        q.shell('sqlite3',q.DB,f"UPDATE saved_courses SET owner_id='{q.OWNER}' WHERE id='{'d'*32}';")
        q.shell('svc', 'wifi', 'disable' if wifi == '0' else 'enable')
        q.shell('svc', 'data', 'disable' if mobile == '0' else 'enable')
        q.shell('wm', 'density', '420'); q.shell('settings', 'put', 'system', 'font_scale', '1.0')
        q.shell('cmd','uimode','night',night.group(1))
        assert q.snapshot('home-after') == before, 'Home QA must preserve every original row'
        launch()
