"""Explicit prerequisites for standalone diagnostics, never product test hooks."""
from datetime import datetime, timezone
import time

DIAGNOSTIC_MODES = frozenset(['home-only', 'home-states-only', 'generation-only',
                            'accessibility-only', 'service-only', 'achievements-only'])


def prepare_diagnostic(q, launch, reset_seed, wait_home, scenario):
    """Caller checks preservation before resetting between diagnostic scenarios."""
    assert q.SERIAL.startswith('emulator-'), 'Physical devices are forbidden'
    started = time.monotonic()
    evidence = {'scenario': scenario, 'startedAt': datetime.now(timezone.utc).isoformat(),
                'status': 'running', 'freshAppData': True}
    try:
        baseline = reset_seed()
        assert baseline['course'] and baseline['note'], 'Preservation fixture missing'
        assert not q.query("SELECT id FROM running_sessions WHERE status <> 'completed'"), 'Diagnostic requires no active run'
        assert not q.query('SELECT owner_id FROM sync_accounts WHERE enabled=1'), 'Diagnostic sync must be off'
        if scenario == 'S234-01-integrated':
            # The full chain obtains this via course_preparation. A diagnostic
            # must own the fixture instead of executing another acceptance test.
            q.seed_preparation_course()
        q.shell('am', 'force-stop', q.APP)
        launch(); wait_home(q)
        q.tap('tab-home')
        if scenario in ['S2a-01-generation', 'S0-04-save', 'S2a-02-accessibility']:
            q.seek('open-route-lab'); q.tap('open-route-lab')
            q.seek('distance-3')
            assert q.find(q.capture('diagnostic-generation-ready'), 'distance-3') is not None
        evidence['status'] = 'passed'
        return baseline, evidence
    except Exception as error:
        evidence['status'] = 'failed'; evidence['error'] = str(error)
        raise
    finally:
        evidence['durationSeconds'] = round(time.monotonic() - started, 3)
        evidence['finishedAt'] = datetime.now(timezone.utc).isoformat()
        # Save failed setup too; it must not be counted as a scenario pass.
        import json
        (q.OUT / (scenario.lower() + '-setup.json')).write_text(json.dumps(evidence, indent=2), encoding='utf8')
