"""S1 home on the dedicated emulator; synthetic rows only, restored in finally."""
import time


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
        q.seek('shape-fish')
        assert q.find(q.capture('home-shape-applied'), 'shape-fish').get('selected') == 'true'
        q.tap('shape-star'); q.tap('tab-home'); q.tap('tab-courses'); q.seek('shape-star')
        assert q.find(q.capture('home-tab-keeps-edited-shape'), 'shape-star').get('selected') == 'true'
        q.shell('am', 'force-stop', q.APP)
        q.shell('sqlite3', q.DB, f"INSERT INTO running_sessions(id,status,started_at,ended_at,checkpoint_at,resumed_at,owner_id,distance_m,active_ms,point_count) VALUES('{run_id}','completed',{now},{now+10000},{now},{now},'',3200,100000,4);")
        for i, (lat, lng) in enumerate([(37.5, 127), (37.501, 127.001), (37.502, 127), (37.5, 127)], 1):
            q.shell('sqlite3', q.DB, f"INSERT INTO running_points VALUES('{run_id}',{i},0,{now+i},{lat},{lng},5);")
        launch(); q.tap('tab-home')
        assert q.find(q.capture('home-history'), 'home-history') is not None
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
    finally:
        q.shell('am', 'force-stop', q.APP)
        q.shell('sqlite3', q.DB, f"DELETE FROM running_points WHERE run_id='{run_id}'; DELETE FROM running_sessions WHERE id='{run_id}';")
        q.shell('svc', 'wifi', 'disable' if wifi == '0' else 'enable')
        q.shell('svc', 'data', 'disable' if mobile == '0' else 'enable')
        q.shell('wm', 'density', '420'); q.shell('settings', 'put', 'system', 'font_scale', '1.0')
        assert q.snapshot('home-after') == before, 'Home QA must preserve every original row'
        launch()
