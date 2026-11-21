"""Private inquiry acceptance against only the disposable local Supabase stack."""
import json
import os
import re
import subprocess
import uuid
import time
import urllib.request
from urllib.parse import urlparse
from course_generation_figma import text


def keyboard_top(q, name):
    display = q.shell('dumpsys', 'window', 'displays').decode()
    (q.OUT / (name + '-display.txt')).write_text(display, encoding='utf8')
    keyboard_tops = [int(y) for y in re.findall(r'type=ime frame=\[\d+,(\d+)\]\[\d+,\d+\][^\r\n]*visible=true', display)]
    if not keyboard_tops:
        # API29 exposes the IME window's frame/insets instead of InsetsSource.
        ime = q.shell('dumpsys', 'input_method').decode()
        (q.OUT / (name + '-ime.txt')).write_text(ime, encoding='utf8')
        if 'mInputShown=true' not in ime:
            return None
        windows = q.shell('dumpsys', 'window', 'windows').decode()
        (q.OUT / (name + '-windows.txt')).write_text(windows, encoding='utf8')
        for window in re.split(r'Window #\d+', windows):
            if not re.search(r'ty=(?:INPUT_METHOD|2011)\b', window) or 'mHasSurface=true' not in window:
                continue
            frame = re.search(r'mFrame=\[\d+,(\d+)\]\[\d+,(\d+)\]', window)
            inset = re.search(r'mGivenContentInsets=\[\d+,(\d+)\]', window)
            if frame:
                keyboard_tops.append(int(frame[1]) + (int(inset[1]) if inset else 0))
    return min(keyboard_tops) if keyboard_tops else None


def keyboard_bounds(q, key, name):
    """Check screen bounds, not just the presence of an accessibility node."""
    tree = q.capture(name)
    node = q.find(tree, key)
    assert node is not None and node.get('focused') == 'true', 'Input is not focused: ' + key
    bounds = list(map(int, re.findall(r'\d+', node.get('bounds'))))
    viewport = list(map(int, re.findall(r'\d+', q.find(tree, 'support-scroll').get('bounds'))))
    top = keyboard_top(q, name)
    assert top is not None, 'No visible IME bounds found'
    density = int(re.findall(r'density: (\d+)', q.shell('wm', 'density').decode())[-1]) / 160
    minimum_height = min(180 * density, max(48 * density, min(viewport[3], top) - viewport[1] - 32 * density)) if key == 'inquiry-body' else 50 * density
    assert viewport[1] <= bounds[1] < bounds[3] < top, 'Input is obscured by header/keyboard: ' + key
    assert bounds[3] - bounds[1] >= minimum_height - 2, 'Input is clipped: ' + key
    result = {'input': key, 'bounds': bounds, 'viewport': viewport, 'keyboardTop': top}
    (q.OUT / (name + '-bounds.json')).write_text(json.dumps(result), encoding='utf8')
    return result


def keyboard_input(q, key, value, name):
    # Keep the IME open when switching fields, but swipe/tap only above it.
    # API29 reports hidden body bounds as visible; tapping them types a key.
    q.seek(key, bottom_limit=keyboard_top(q, name + '-before'))
    text(q, key, value)
    return keyboard_bounds(q, key, name)


def inquiry_board(q, launch):
    assert q.SERIAL.startswith('emulator-')
    status_path = os.environ.get('QA_SUPABASE_STATUS', str(q.ROOT / '.cache/qa-supabase-status.json'))
    status = json.loads(open(status_path, encoding='utf8').read())
    url = status['API_URL'].rstrip('/')
    assert urlparse(url).hostname in ('localhost', '127.0.0.1'), 'Hosted inquiry tests are forbidden'
    key = status['SERVICE_ROLE_KEY']
    db = urlparse(status['DB_URL'])
    assert db.hostname in ('localhost', '127.0.0.1'), 'Hosted inquiry recovery setup is forbidden'
    env = {**os.environ, 'PGHOST': db.hostname, 'PGPORT': str(db.port), 'PGUSER': db.username, 'PGPASSWORD': db.password, 'PGDATABASE': db.path.lstrip('/')}

    def sql(statement):
        return subprocess.run(['psql', '-v', 'ON_ERROR_STOP=1'], input=statement, text=True, capture_output=True, env=env, check=True)

    def request(method, path, body=None):
        req = urllib.request.Request(url + '/rest/v1/' + path,
            data=None if body is None else json.dumps(body).encode(), method=method,
            headers={'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'Prefer': 'return=representation'})
        with urllib.request.urlopen(req, timeout=15) as response:
            raw = response.read()
            return json.loads(raw) if raw else None

    rows_path = 'service_inquiries?owner_id=eq.' + q.OWNER
    assert not request('GET', rows_path), 'Expected a new isolated inquiry owner'
    created = []
    def wait_key(key):
        deadline = time.monotonic() + 20
        while True:
            tree = q.capture('inquiry-wait-' + key)
            if q.find(tree, key) is not None:
                return tree
            assert time.monotonic() < deadline, 'Inquiry state did not appear: ' + key
            time.sleep(.25)
    try:
        launch('service-inquiry')
        wait_key('inquiry-category')
        assert q.find(q.capture('inquiry-empty-form'), 'inquiry-email') is None
        keyboard_input(q, 'inquiry-title', 'INQUIRY_QA', 'inquiry-keyboard-create-title')
        keyboard_input(q, 'inquiry-body', 'Private inquiry body', 'inquiry-keyboard-create-body')
        q.shell('input', 'keyevent', '4')
        q.seek('inquiry-submit'); q.tap('inquiry-submit')
        wait_key('inquiry-detail-body')
        rows = request('GET', rows_path)
        assert len(rows) == 1 and rows[0]['title'] == 'INQUIRY_QA'
        row = rows[0]; created.append(row['request_id'])
        assert row['status'] == '미확인' and 'contact_email' not in row
        q.seek('inquiry-edit'); q.tap('inquiry-edit')
        keyboard_input(q, 'inquiry-title', 'INQUIRY_EDITED', 'inquiry-keyboard-edit-title')
        keyboard_input(q, 'inquiry-body', 'Edited inquiry body\n' * 30, 'inquiry-keyboard-edit-long-body')
        q.shell('input', 'keyevent', '4')
        q.seek('inquiry-save'); q.tap('inquiry-save')
        wait_key('inquiry-detail-body')
        assert request('GET', rows_path)[0]['title'] == 'INQUIRY_EDITED'
        request('PATCH', rows_path + '&request_id=eq.' + row['request_id'], {'reply_body': 'RunPen QA reply\n' * 15})
        q.seek('최신 내용 확인'); q.tap('최신 내용 확인')
        q.seek('inquiry-reply'); q.capture('inquiry-answered-detail')
        assert q.find(q.capture('inquiry-answered-controls'), 'inquiry-delete') is None
        q.seek('목록으로 돌아가기'); q.tap('목록으로 돌아가기')
        wait_key('inquiry-write')
        q.seek('inquiry-' + row['request_id']); q.capture('inquiry-answered-list')
        q.tap('inquiry-write'); wait_key('inquiry-category')
        keyboard_input(q, 'inquiry-title', 'INQUIRY_DELETE', 'inquiry-keyboard-new-title')
        keyboard_input(q, 'inquiry-body', 'Delete before reply', 'inquiry-keyboard-new-body')
        q.shell('input', 'keyevent', '4')
        q.seek('inquiry-submit'); q.tap('inquiry-submit'); wait_key('inquiry-detail-body')
        rows = request('GET', rows_path)
        created.extend(r['request_id'] for r in rows if r['request_id'] not in created)
        q.seek('inquiry-delete'); q.tap('inquiry-delete'); q.tap('삭제')
        wait_key('inquiry-write')
        assert len(request('GET', rows_path)) == 1
        # A transient server error retains the encrypted retry copy. Reopen the
        # real form to reproduce the handset's disabled-input state, then clear
        # only that synthetic local copy through the explicit confirmation.
        sql("""create function support_private.qa_pending_inquiry() returns trigger language plpgsql as $$
          begin if new.title='INQUIRY_PENDING' then raise exception 'QA uncertain outcome' using errcode='08006'; end if; return new; end; $$;
          create trigger qa_pending_inquiry before insert on public.service_inquiries for each row execute function support_private.qa_pending_inquiry();""")
        q.tap('inquiry-write'); wait_key('inquiry-category')
        keyboard_input(q, 'inquiry-title', 'INQUIRY_PENDING', 'inquiry-pending-title')
        keyboard_input(q, 'inquiry-body', 'Synthetic unsent retry copy', 'inquiry-pending-body')
        q.shell('input', 'keyevent', '4'); q.seek('inquiry-submit'); q.tap('inquiry-submit')
        wait_key('inquiry-new')
        q.shell('am', 'force-stop', q.APP); launch('service-inquiry-write')
        wait_key('inquiry-new'); q.seek('inquiry-new')
        deadline = time.monotonic() + 20
        while q.find(q.capture('inquiry-recovery-ready'), 'inquiry-new').get('enabled') != 'true':
            assert time.monotonic() < deadline, 'Recovery lookup did not finish'
            time.sleep(.25)
        q.tap('inquiry-new'); q.tap('취소')
        assert q.find(q.capture('inquiry-recovery-cancelled'), 'inquiry-pending') is not None
        q.tap('inquiry-new'); q.tap('새 문의 작성'); wait_key('inquiry-submit')
        keyboard_input(q, 'inquiry-title', 'UNSENT_RECOVERED', 'inquiry-recovered-keyboard-title')
        keyboard_input(q, 'inquiry-body', 'Editable after recovery', 'inquiry-recovered-keyboard-body')
        q.shell('input', 'keyevent', '4')
        assert len(request('GET', rows_path)) == 1, 'Recovery must not send or delete inquiries'
        sql('drop trigger qa_pending_inquiry on public.service_inquiries; drop function support_private.qa_pending_inquiry();')
        launch('account-settings'); q.seek('theme-dark'); q.tap('theme-dark')
        q.shell('wm', 'density', '480'); q.shell('settings', 'put', 'system', 'font_scale', '1.6')
        q.shell('am', 'force-stop', q.APP); launch('service-inquiry'); wait_key('inquiry-write')
        q.capture('inquiry-large-font-list')
        q.tap('inquiry-' + row['request_id']); q.seek('inquiry-reply'); q.capture('inquiry-large-font-reply')
        q.seek('목록으로 돌아가기'); q.tap('목록으로 돌아가기'); wait_key('inquiry-write')
        q.tap('inquiry-write'); wait_key('inquiry-category')
        keyboard_input(q, 'inquiry-title', 'UNSENT_LARGE_FONT', 'inquiry-keyboard-large-title')
        keyboard_input(q, 'inquiry-body', 'Large font inquiry body\n' * 30, 'inquiry-keyboard-large-long-body')
        q.shell('input', 'keyevent', '4')
        q.seek('inquiry-submit'); q.capture('inquiry-keyboard-dismissed')
        q.shell('input', 'keyevent', '4'); wait_key('inquiry-write')
        assert len(request('GET', rows_path)) == 1, 'Unsaved keyboard draft must not be submitted'
        (q.OUT / 'inquiry-board-result.json').write_text(json.dumps({'emptyForm': True, 'appSubmit': True, 'appEdit': True,
            'adminReply': True, 'privateList': True, 'appDelete': True, 'largeFont': True, 'keyboardBounds': True,
            'pendingRecovery': True, 'recoveryKeyboard': True, 'email': False}), encoding='utf8')
    finally:
        sql('drop trigger if exists qa_pending_inquiry on public.service_inquiries; drop function if exists support_private.qa_pending_inquiry();')
        # Remove only this scenario's synthetic messages; the disposable account
        # teardown removes its minimal request ledger as well.
        for row in request('GET', rows_path):
            if row['title'].startswith('INQUIRY_') and row['request_id'] not in created:
                created.append(row['request_id'])
        for request_id in created:
            request('DELETE', rows_path + '&request_id=eq.' + request_id)
        if created:
            ids = ','.join("'" + str(uuid.UUID(value)) + "'" for value in created)
            sql(f"delete from support_private.inquiry_requests where owner_id='{uuid.UUID(q.OWNER)}' and request_id in ({ids});")
        q.shell('wm', 'density', '420'); q.shell('settings', 'put', 'system', 'font_scale', '1.0')
        q.shell('am', 'force-stop', q.APP)
        launch('account-settings'); q.seek('theme-light'); q.tap('theme-light')
        launch('service-info')
