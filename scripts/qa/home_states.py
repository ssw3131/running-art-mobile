"""S1 home on the dedicated emulator; synthetic rows only, restored in finally."""
import re
import subprocess
import time


def seek_shape(q, key, direction):
    """The generator's shapes scroll horizontally, independently of its form."""
    for attempt in range(6):
        tree = q.capture(f'home-{key}-scroll-{attempt}')
        row = next(n for n in tree.iter('node') if 'HorizontalScrollView' in n.get('class', ''))
        left, top, right, bottom = map(int, re.findall(r'\d+', row.get('bounds')))
        node = q.find(tree, key)
        if node is not None:
            x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds')))
            if left <= x1 < x2 <= right and x2 - x1 > 60 and top <= y1 < y2 <= bottom:
                return
        # Stay away from Android's left/right back-gesture regions.
        inset = int((right - left) * .2)
        start, end = (right - inset, left + inset) if direction == 'left' else (left + inset, right - inset)
        q.shell('input', 'swipe', str(start), str((top + bottom) // 2), str(end), str((top + bottom) // 2), '350')
    raise RuntimeError('Horizontal shape not reached: ' + key)


def verify_home_states(q, launch):
    run_id = '9' * 32
    assert not q.query(f"SELECT id FROM running_sessions WHERE id='{run_id}'")
    before = q.snapshot('home-before')
    now = int(time.time() * 1000)
    wifi = q.shell('settings', 'get', 'global', 'wifi_on').decode().strip()
    mobile = q.shell('settings', 'get', 'global', 'mobile_data').decode().strip()
    try:
        launch(); q.tap('tab-home')
        assert q.find(q.capture('home-initial-top'), 'home-initial') is not None
        q.seek('home-shape-fish'); q.tap('home-shape-fish'); q.tap('open-route-lab')
        q.seek('shape-star'); seek_shape(q, 'shape-fish', 'left')
        assert q.find(q.capture('home-shape-applied'), 'shape-fish').get('selected') == 'true'
        seek_shape(q, 'shape-star', 'right')
        q.tap('shape-star'); q.tap('tab-home'); q.tap('tab-courses'); q.seek('shape-star')
        assert q.find(q.capture('home-tab-keeps-edited-shape'), 'shape-star').get('selected') == 'true'
        q.shell('am', 'force-stop', q.APP)
        q.shell('sqlite3', q.DB, f"INSERT INTO running_sessions(id,status,started_at,ended_at,checkpoint_at,resumed_at,owner_id,distance_m,active_ms,point_count) VALUES('{run_id}','completed',{now},{now+10000},{now},{now},'',3200,100000,4);")
        for i, (lat, lng) in enumerate([(37.5, 127), (37.501, 127.001), (37.502, 127), (37.5, 127)], 1):
            q.shell('sqlite3', q.DB, f"INSERT INTO running_points VALUES('{run_id}',{i},0,{now+i},{lat},{lng},5);")
        launch(); q.tap('tab-home')
        history = q.capture('home-history')
        assert q.find(history, 'home-history') is not None
        preview = q.find(history, '실제 러닝 경로')
        subprocess.run(['node', str(q.ROOT / 'scripts/qa/home-preview.mjs'), str(q.OUT / 'home-history.png'),
                        *re.findall(r'\d+', preview.get('bounds'))], check=True)
        q.seek('home-run-' + run_id); q.tap('home-run-' + run_id)
        assert q.find(q.capture('home-record-detail'), 'run-distance').get('text') == '3.20 km'
        q.tap('service-back'); q.tap('tab-home')
        for status in ['paused', 'interrupted']:
            q.shell('am', 'force-stop', q.APP)
            q.shell('sqlite3', q.DB, f"UPDATE running_sessions SET status='{status}',ended_at=NULL WHERE id='{run_id}';")
            launch(); q.tap('tab-home')
            assert q.find(q.capture('home-' + status), 'active-run-banner') is not None
            q.tap('home-resume-run'); q.capture('home-' + status + '-return')
            assert q.query(f"SELECT status FROM running_sessions WHERE id='{run_id}'")[0]['status'] == status, 'Home must not resume GPS'
        q.shell('am', 'force-stop', q.APP)
        q.shell('sqlite3', q.DB, f"UPDATE running_sessions SET status='completed',ended_at={now+10000} WHERE id='{run_id}';")
        q.shell('svc', 'wifi', 'disable'); q.shell('svc', 'data', 'disable')
        launch(); assert q.find(q.capture('home-history-offline'), 'home-history') is not None
        q.shell('wm', 'density', '480'); q.shell('settings', 'put', 'system', 'font_scale', '1.6')
        launch(); q.capture('home-history-large-font')
        q.seek('open-runs'); q.tap('open-runs'); q.capture('home-history-large-font-archive')
    except Exception:
        q.capture('home-failure-before-cleanup')
        raise
    finally:
        q.shell('am', 'force-stop', q.APP)
        q.shell('sqlite3', q.DB, f"DELETE FROM running_points WHERE run_id='{run_id}'; DELETE FROM running_sessions WHERE id='{run_id}';")
        q.shell('svc', 'wifi', 'disable' if wifi == '0' else 'enable')
        q.shell('svc', 'data', 'disable' if mobile == '0' else 'enable')
        q.shell('wm', 'density', '420'); q.shell('settings', 'put', 'system', 'font_scale', '1.0')
        assert q.snapshot('home-after') == before, 'Home QA must preserve every original row'
        launch()
