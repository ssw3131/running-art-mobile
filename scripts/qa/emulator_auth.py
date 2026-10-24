"""Real loopback Supabase sessions for dedicated emulator QA.
No product fixture hooks. Membership is checked by the ordinary application RPC.
Session files are private and removed after handoff; no physical devices.
"""
import json
import os
import subprocess

# Owner is assigned from the real disposable Auth response, never hardcoded.

PACKAGE = 'com.runningart.emulatorauth'

def build(root, sdk):
    folder = root / '.cache/emulator-auth'
    for name in ['classes', 'dex']:
        (folder/name).mkdir(parents=True, exist_ok=True)
    tools = sdk/'build-tools/36.0.0'
    api = sdk/'platforms/android-36/android.jar'
    def tool(name):
        return tools/(name + ('.bat' if name in ['d8', 'apksigner'] else '.exe') if os.name == 'nt' else name)
    def run(*args):
        subprocess.run(list(map(str, args)), cwd=root, check=True, timeout=120, capture_output=True)
    (folder/'AndroidManifest.xml').write_text(f'<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="{PACKAGE}"><uses-sdk android:minSdkVersion="24" android:targetSdkVersion="36"/><application android:label="RunPen emulator QA"/><instrumentation android:name="{PACKAGE}.EmulatorAuth" android:targetPackage="com.runningart.mobile.dev"/></manifest>', encoding='utf8')
    run('javac','-source','8','-target','8','-encoding','UTF-8','-bootclasspath',api,'-d',folder/'classes',root/'scripts/qa/EmulatorAuth.java')
    run(tool('d8'),'--lib',api,'--output',folder/'dex',folder/'classes/com/runningart/emulatorauth/EmulatorAuth.class')
    run(tool('aapt2'),'link','-I',api,'--manifest',folder/'AndroidManifest.xml','-o',folder/'unsigned.apk')
    run('jar','uf',folder/'unsigned.apk','-C',folder/'dex','classes.dex')
    run(tool('zipalign'),'-f','4',folder/'unsigned.apk',folder/'aligned.apk')
    run(tool('apksigner'),'sign','--ks',root/'android/app/debug.keystore','--ks-pass','pass:android','--key-pass','pass:android','--out',folder/'auth.apk',folder/'aligned.apk')
    return folder/'auth.apk'

def backend(root, command, role='service'):
    # This helper reaches only the loopback stack guarded by isolated-supabase.mjs.
    result = subprocess.run(['node', 'scripts/qa/prepare-membership-fixture.mjs', command, role], cwd=root,
                            capture_output=True, timeout=90)
    if result.returncode:
        raise RuntimeError('Isolated membership fixture operation failed: ' + command)


def seed(q, role='service'):
    assert q.SERIAL.startswith('emulator-'), 'Physical device forbidden'
    assert q.adb('emu', 'avd', 'name').decode().splitlines()[0] in ['RunPen_CI', 'RunningArt_UI_QA']
    assert role in ['signup', 'service']
    fixture = q.ROOT / '.cache/emulator-auth/session.json'
    try:
        backend(q.ROOT, 'session', role)
        value = json.loads(fixture.read_text(encoding='utf8'))
        assert value['fixture'] == 'runpen-isolated-membership-v1' and value['projectUrl'] == 'https://localhost:54431'
        assert value['role'] == role
        import uuid
        q.OWNER = str(uuid.UUID(value['session']['user']['id']))
        q.adb('reverse', 'tcp:54431', 'tcp:54431')
        q.shell('am', 'force-stop', q.APP)
        q.adb('push', str(fixture), '/data/local/tmp/runpen-emulator-session.json')
        output = q.shell('am', 'instrument', '-w', PACKAGE + '/.EmulatorAuth').decode()
        assert 'INSTRUMENTATION_CODE: 0' in output and 'failure=' not in output, 'Emulator session helper failed'
    finally:
        fixture.unlink(missing_ok=True)
        q.shell('rm', '-f', '/data/local/tmp/runpen-emulator-session.json')
