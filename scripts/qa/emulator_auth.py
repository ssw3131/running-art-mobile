"""External, same-signature instrumentation for dedicated emulator session restoration.

The app has no fixture hook. This is not OAuth/server-auth verification: the short
session belongs to a deliberately nonexistent issuer and can never access a user
backend. Physical devices and existing sessions are rejected by both helpers.
"""
import base64
import json
import os
import pathlib
import subprocess
import time

OWNER = '10000000-0000-4000-8000-000000000001'
ISSUER = 'https://runpen-ci.invalid'
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

def seed(q):
    assert q.SERIAL.startswith('emulator-'), 'Physical device forbidden'
    assert q.adb('emu','avd','name').decode().splitlines()[0] in ['RunPen_CI','RunningArt_UI_QA']
    def encoded(value):
        return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
    now = int(time.time())
    token = '.'.join([encoded({'alg':'HS256','typ':'JWT'}),encoded({'sub':OWNER,'iss':ISSUER+'/auth/v1','aud':'authenticated','iat':now,'exp':now+7100}),encoded('not-a-server-signature')])
    session = {'access_token':token,'refresh_token':'emulator-only-not-valid','token_type':'bearer','expires_in':7100,'expires_at':now+7100,
               'user':{'id':OWNER,'aud':'authenticated','role':'authenticated','email':'runpen-ci@example.invalid','created_at':'2026-10-01T00:00:00Z',
                       'app_metadata':{'provider':'email','providers':['email']},'user_metadata':{'full_name':'러너'},'identities':[{'id':OWNER,'user_id':OWNER,'provider':'email','identity_data':{'email':'runpen-ci@example.invalid'}}]}}
    fixture=q.ROOT/'.cache/emulator-auth/session.json'
    fixture.write_text(json.dumps({'fixture':'runpen-emulator-auth-v1','projectUrl':ISSUER,'session':session}),encoding='utf8')
    q.shell('am','force-stop',q.APP)
    try:
        q.adb('push',str(fixture),'/data/local/tmp/runpen-emulator-session.json')
        output=q.shell('am','instrument','-w',PACKAGE+'/.EmulatorAuth').decode()
        assert 'INSTRUMENTATION_CODE: 0' in output and 'failure=' not in output, 'Emulator session helper failed'
    finally:
        fixture.unlink(missing_ok=True)
        q.shell('rm','-f','/data/local/tmp/runpen-emulator-session.json')
