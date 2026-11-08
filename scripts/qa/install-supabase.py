"""Pinned Linux CI CLI, verified against the official v2.120.0 asset digest.
https://github.com/supabase/cli/releases/tag/v2.120.0
No global install and no version fallback. Does not start or connect a database.
"""
import io
import pathlib
import platform
import subprocess
import sys
import tarfile
from release_download import download_release

VERSION='2.120.0'
SHA='7074584113aa00495beeac661c41fb09f1ddd0a483cd7333894b0d080086dc6e'
URL=f'https://github.com/supabase/cli/releases/download/v{VERSION}/supabase_linux_amd64.tar.gz'
ROOT=pathlib.Path(__file__).resolve().parents[2]


def main():
    if sys.platform!='linux' or platform.machine()!='x86_64':
        raise RuntimeError('This installer is restricted to the Linux x86_64 CI runner')
    data=download_release(URL,SHA)
    with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as archive:
        member=archive.getmember('supabase')
        if not member.isfile():raise RuntimeError('Expected a regular Supabase executable')
        binary=archive.extractfile(member).read()
    destination=ROOT/'.tools'/f'supabase-{VERSION}'
    destination.mkdir(parents=True,exist_ok=True)
    target=destination/'supabase'
    target.write_bytes(binary);target.chmod(0o755)
    actual=subprocess.check_output([str(target),'--version'],text=True).strip()
    if actual!=VERSION:raise RuntimeError('Installed Supabase CLI version differs from the pinned release')
    print(f'Verified Supabase CLI {actual}: {destination}',flush=True)


if __name__=='__main__':main()
