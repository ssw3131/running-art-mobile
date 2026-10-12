"""Pinned, repository-local CLI install. No global PATH or Java changes."""
import hashlib
import io
import pathlib
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
DEST = ROOT / '.tools/maestro-2.11.0'
SHA = '5384593cb4e7a106489e75a821d157dd43f4e438df6bc308b72e82c685e1283a'
URL = 'https://github.com/mobile-dev-inc/Maestro/releases/download/cli-2.11.0/maestro.zip'
data = urllib.request.urlopen(URL, timeout=120).read()
assert hashlib.sha256(data).hexdigest() == SHA, 'Maestro release checksum mismatch'
DEST.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(io.BytesIO(data)) as archive:
    for item in archive.infolist():
        target = (DEST / item.filename).resolve()
        assert target.is_relative_to(DEST.resolve()), 'Unsafe archive path'
    archive.extractall(DEST)
for executable in DEST.rglob('bin/maestro'):
    executable.chmod(0o755)
print(DEST)
