"""Retry release transport failures only; checksum failures are always fatal."""
import hashlib
import re
import time
import urllib.error
import urllib.parse
import urllib.request


def download_release(url, expected_sha256, opener=urllib.request.urlopen, sleep=time.sleep):
    parsed=urllib.parse.urlsplit(url)
    browser_asset=parsed.netloc=='github.com' and re.fullmatch(r'/[\w.-]+/[\w.-]+/releases/download/[^/]+/[^/]+',parsed.path)
    api_asset=parsed.netloc=='api.github.com' and re.fullmatch(r'/repos/[\w.-]+/[\w.-]+/releases/assets/[0-9]+',parsed.path)
    if parsed.scheme!='https' or not (browser_asset or api_asset) or parsed.query or parsed.fragment:
        raise ValueError('Expected an official pinned GitHub release asset URL')
    if not re.fullmatch(r'[a-f0-9]{64}',expected_sha256):
        raise ValueError('Expected a pinned SHA-256')
    request=urllib.request.Request(url,headers={'Accept':'application/octet-stream'}) if api_asset else url
    for attempt in range(4):
        try:
            with opener(request,timeout=120) as response:
                data=response.read()
        except (urllib.error.URLError,TimeoutError) as error:
            if isinstance(error,urllib.error.HTTPError) and error.code not in [408,429,500,502,503,504]:
                raise
            if attempt==3:
                raise RuntimeError('Release download failed after four transport attempts') from error
            print(f'Release download transport failure ({type(error).__name__}); retry {attempt+2}/4',flush=True)
            sleep(2**(attempt+1))
            continue
        if hashlib.sha256(data).hexdigest()!=expected_sha256:
            raise RuntimeError('Release checksum mismatch; refusing to retry or install')
        return data
    raise AssertionError('Unreachable download state')
