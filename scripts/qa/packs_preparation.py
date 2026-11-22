"""Pack preparation UI on disposable local emulators; never purchases or grants."""
import hashlib
import json
import os
import re
import subprocess
import time
from urllib.parse import urlparse


def pack_preparation(q, launch):
    assert q.SERIAL.startswith('emulator-'), 'Physical devices are forbidden'
    status_path = os.environ.get('QA_SUPABASE_STATUS', str(q.ROOT / '.cache/qa-supabase-status.json'))
    status = json.loads(open(status_path, encoding='utf8').read())
    db = urlparse(status['DB_URL'])
    assert db.hostname in ('localhost', '127.0.0.1'), 'Hosted usage queries are forbidden'
    assert re.fullmatch(r'[a-f0-9-]{36}', q.OWNER)
    env = {**os.environ, 'PGHOST': db.hostname, 'PGPORT': str(db.port), 'PGUSER': db.username,
           'PGPASSWORD': db.password, 'PGDATABASE': db.path.lstrip('/')}

    def usage():
        # Read only isolated counters and operations; persist a digest, never their contents.
        statement = "select jsonb_build_object('subjects',(select jsonb_agg(to_jsonb(s) order by s.id) from public.usage_subjects s join public.usage_owners o on o.subject_id=s.id where o.owner_id='" + q.OWNER + "'),'operations',(select jsonb_agg(to_jsonb(o) order by o.id) from public.usage_operations o where o.owner_id='" + q.OWNER + "'));"
        result = subprocess.run(['psql', '-v', 'ON_ERROR_STOP=1', '-At'], input=statement, text=True,
                                capture_output=True, env=env, check=True, timeout=20)
        return json.loads(result.stdout.strip())

    def visible(key, name, allow_disabled=False):
        q.seek(key, allow_disabled=allow_disabled)
        tree = q.capture(name)
        node = q.find(tree, key)
        assert node is not None, 'Missing pack control: ' + key
        bounds = list(map(int, re.findall(r'\d+', node.get('bounds'))))
        assert bounds[2] > bounds[0] and bounds[3] > bounds[1], 'Empty pack bounds: ' + key
        return node

    density = re.findall(r'density: (\d+)', q.shell('wm', 'density').decode())[-1]
    font = q.shell('settings', 'get', 'system', 'font_scale').decode().strip()
    original = q.snapshot('packs-records-before')
    try:
        q.shell('wm', 'density', '420'); q.shell('settings', 'put', 'system', 'font_scale', '1.0')
        q.shell('am', 'force-stop', q.APP)
        launch('account'); q.seek('account-benefits')
        deadline = time.monotonic() + 20
        while True:
            before = usage()
            if before['subjects']: break
            assert time.monotonic() < deadline, 'Account usage did not finish loading'
            time.sleep(.5)
        q.tap('account-benefits')
        for pack in ('basic', 'plus', 'expanded'):
            visible('pack-' + pack, 'packs-' + pack + '-before')
            q.tap('pack-' + pack)
            assert q.find(q.capture('packs-' + pack + '-selected'), 'pack-' + pack).get('selected') == 'true'
        node = visible('pack-purchase', 'packs-purchase-disabled', allow_disabled=True)
        assert node.get('enabled') == 'false', 'Unconnected purchase must stay disabled'
        q.seek('pack-history'); q.tap('pack-history')
        visible('purchase-history-preparing', 'packs-history-preparing')
        q.shell('input', 'keyevent', '4'); time.sleep(.5)
        visible('pack-back', 'packs-hardware-back'); q.tap('pack-back')
        visible('account-purchases', 'packs-return-account'); q.tap('account-purchases')
        visible('purchase-history-preparing', 'packs-account-history')
        q.tap('service-back')
        # Small screen/large text: scroll through all choices and the disabled action.
        q.shell('wm', 'density', '540'); q.shell('settings', 'put', 'system', 'font_scale', '1.6')
        q.shell('am', 'force-stop', q.APP); launch('packs')
        for pack in ('basic', 'plus', 'expanded'):
            visible('pack-' + pack, 'packs-small-large-font-' + pack)
            q.tap('pack-' + pack)
        assert visible('pack-purchase', 'packs-small-large-font-purchase', allow_disabled=True).get('enabled') == 'false'
        q.seek('pack-history'); q.tap('pack-history')
        visible('purchase-history-preparing', 'packs-small-large-font-history')
        visible('history-support', 'packs-small-large-font-support')
        assert usage() == before, 'Pack browsing changed allowance or operations'
        (q.OUT / 'packs-preparation.json').write_text(json.dumps({
            'allThreeSelectable': True, 'purchaseDisabled': True, 'accountAndHistoryBack': True,
            'smallScreenLargeFont': True, 'usageUnchanged': True,
            'usageBeforeAfterSha256': hashlib.sha256(json.dumps(before, sort_keys=True).encode()).hexdigest(),
        }, indent=2), encoding='utf8')
    except Exception:
        q.capture('packs-preparation-failure')
        raise
    finally:
        q.shell('wm', 'density', density); q.shell('settings', 'put', 'system', 'font_scale', font)
        q.shell('am', 'force-stop', q.APP); launch()
        assert q.snapshot('packs-records-after') == original, 'Pack preparation changed device records'
