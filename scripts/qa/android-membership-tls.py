"""Generate local TLS and trust it in a disposable native QA build only.
No product config changes, global certificate installs, or certificate bypasses.
Run after prebuild, before assemble. Restore the exact manifest afterwards.
"""
import argparse
import json
import pathlib
import shutil
import subprocess
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[2]
LOCAL = ROOT / '.cache/qa-membership'
TLS = LOCAL / 'tls'
MANIFEST = ROOT / 'android/app/src/main/AndroidManifest.xml'
CONFIG = ROOT / 'android/app/src/main/res/xml/runpen_qa_network_security.xml'
CA = ROOT / 'android/app/src/main/res/raw/runpen_qa_ca.crt'
BACKUP = LOCAL / 'native-trust-backup.json'
ANDROID = '{http://schemas.android.com/apk/res/android}'


def prepare():
    assert MANIFEST.is_file(), 'Run prebuild first in a disposable QA checkout'
    assert not BACKUP.exists() and not CONFIG.exists() and not CA.exists(), 'Restore earlier QA trust first'
    root = ET.fromstring(MANIFEST.read_bytes())
    app = root.find('application')
    assert app is not None and ANDROID + 'networkSecurityConfig' not in app.attrib, 'Inspect existing network security configuration; never overwrite it'
    TLS.mkdir(parents=True, exist_ok=True)
    def openssl(*args):
        subprocess.run(['openssl', *args], cwd=TLS, check=True, capture_output=True, timeout=30)
    # Isolated ephemeral CA and leaf, no trust-store or system configuration changes.
    openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.crt', '-days', '2', '-subj', '/CN=RunPen isolated QA CA', '-addext', 'basicConstraints=critical,CA:TRUE')
    openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'server.key', '-out', 'server.csr', '-subj', '/CN=localhost')
    (TLS / 'server.ext').write_text('subjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n', encoding='utf8')
    openssl('x509', '-req', '-in', 'server.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'server.crt', '-days', '2', '-extfile', 'server.ext')
    original = MANIFEST.read_text(encoding='utf8')
    assert '<application ' in original, 'Unexpected manifest formatting; inspect before modifying'
    BACKUP.write_text(json.dumps({'manifest': original}), encoding='utf8')
    # Preserve namespaces/formatting and inject only the checked application tag.
    MANIFEST.write_text(original.replace('<application ', '<application android:networkSecurityConfig="@xml/runpen_qa_network_security" ', 1), encoding='utf8')
    CONFIG.parent.mkdir(parents=True, exist_ok=True)
    CA.parent.mkdir(parents=True, exist_ok=True)
    CONFIG.write_text('<network-security-config><base-config cleartextTrafficPermitted="false"><trust-anchors><certificates src="system"/></trust-anchors></base-config><domain-config cleartextTrafficPermitted="false"><domain includeSubdomains="false">localhost</domain><trust-anchors><certificates src="@raw/runpen_qa_ca"/></trust-anchors></domain-config></network-security-config>', encoding='utf8')
    shutil.copyfile(TLS / 'ca.crt', CA)


def restore():
    if not BACKUP.exists():
        return
    value = json.loads(BACKUP.read_text(encoding='utf8'))
    current = MANIFEST.read_text(encoding='utf8')
    expected = value['manifest'].replace('<application ', '<application android:networkSecurityConfig="@xml/runpen_qa_network_security" ', 1)
    assert current == expected, 'Native manifest changed since QA preparation; preserve and reconcile it manually'
    MANIFEST.write_text(value['manifest'], encoding='utf8')
    CONFIG.unlink(missing_ok=True)
    CA.unlink(missing_ok=True)
    BACKUP.unlink()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['prepare', 'restore'])
    args = parser.parse_args()
    prepare() if args.command == 'prepare' else restore()
