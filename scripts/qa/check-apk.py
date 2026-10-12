"""Verify test instrumentation and private QA inputs never enter the app APK."""
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import zipfile
apk = pathlib.Path(sys.argv[1])
with zipfile.ZipFile(apk) as archive:
    for item in archive.infolist():
        assert not any(part in item.filename.split('/') for part in ['.env', '.cache', 'test-results', 'phone-validation-original']), item.filename
        if item.filename.endswith('.dex') or item.filename.endswith('index.android.bundle'):
            payload = archive.read(item)
            for marker in [b'com/runningart/authdigest/PhoneValidation', b'QA_SUPABASE_STATUS', b'phone-validation-original']:
                assert marker not in payload, 'QA-only entry point packaged: ' + marker.decode()
sdk = pathlib.Path(os.environ['ANDROID_HOME'])
aapt = sdk / ('build-tools/36.0.0/aapt.exe' if os.name == 'nt' else 'build-tools/36.0.0/aapt')
badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(apk)], text=True, encoding='utf8')
assert "package: name='com.runningart.mobile.dev'" in badging
assert 'application-debuggable' not in badging, 'Test APK must exercise the release runtime'
print(json.dumps({'status': 'passed', 'applicationId': 'com.runningart.mobile.dev', 'sha256': hashlib.sha256(apk.read_bytes()).hexdigest(), 'testHooksAbsent': True}))
