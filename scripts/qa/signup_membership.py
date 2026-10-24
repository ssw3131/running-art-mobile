"""Pending-user UI acceptance, separate from the pre-completed service fixture."""
import time
import emulator_auth


def wait_home(q):
    deadline = time.monotonic() + 40
    while time.monotonic() < deadline:
        if q.find(q.capture('membership-wait-home'), 'tab-home') is not None:
            return
        time.sleep(1)
    raise AssertionError('Confirmed membership did not reach home')


def signup_membership(q, launch):
    emulator_auth.backend(q.ROOT, 'new-signup')
    emulator_auth.seed(q, 'signup')
    launch('courses')  # a private deep link must be refused while pending
    q.seek('signup-nickname')
    tree = q.capture('membership-pending')
    assert q.find(tree, 'tab-home') is None
    q.seek('로그아웃')
    assert q.find(q.capture('membership-not-consented'), 'signup-complete').get('enabled') == 'false'
    q.seek('signup-read-terms'); q.tap('signup-read-terms'); q.capture('membership-terms')
    q.tap('닫기')
    q.seek('로그아웃')
    assert q.find(q.capture('membership-read-is-not-consent'), 'signup-complete').get('enabled') == 'false'
    q.seek('signup-consent-terms'); q.tap('signup-consent-terms')
    q.seek('로그아웃')
    assert q.find(q.capture('membership-one-consent'), 'signup-complete').get('enabled') == 'false'
    q.seek('signup-consent-privacy'); q.tap('signup-consent-privacy')
    q.seek('signup-complete'); q.tap('signup-complete')
    wait_home(q)
    emulator_auth.backend(q.ROOT, 'assert-complete', 'signup')
    q.shell('am', 'force-stop', q.APP); launch()
    wait_home(q)
    q.capture('membership-confirmed-restart')

