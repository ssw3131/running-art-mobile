import test from 'node:test';
import {execFileSync} from 'node:child_process';
test('pinned release download retries transport errors but never checksum, source or permanent HTTP errors',()=>{
 execFileSync(process.env.PYTHON||'python3',['-c',String.raw`
import sys,io,hashlib,urllib.error
sys.path.insert(0,'scripts/qa')
from release_download import download_release
url='https://github.com/example/tool/releases/download/v1/tool.zip'
data=b'verified test release';sha=hashlib.sha256(data).hexdigest();calls=[];waits=[]
def transient(url,timeout):
 calls.append(url)
 if len(calls)<3:raise urllib.error.HTTPError(url,504,'temporary',None,None)
 return io.BytesIO(data)
assert download_release(url,sha,opener=transient,sleep=waits.append)==data
assert len(calls)==3 and waits==[2,4]
calls.clear();waits.clear()
def wrong(url,timeout):calls.append(url);return io.BytesIO(b'corrupt')
try:download_release(url,sha,opener=wrong,sleep=waits.append);raise AssertionError('accepted corrupt release')
except RuntimeError as e:assert 'checksum mismatch' in str(e)
assert len(calls)==1 and not waits
calls.clear()
def missing(url,timeout):calls.append(url);raise urllib.error.HTTPError(url,404,'missing',None,None)
try:download_release(url,sha,opener=missing,sleep=waits.append);raise AssertionError('accepted missing release')
except urllib.error.HTTPError as e:assert e.code==404
assert len(calls)==1 and not waits
calls.clear()
for source,checksum in [('http://github.com/example/tool/releases/download/v1/tool.zip',sha),('https://github.com.evil.test/example/tool/releases/download/v1/tool.zip',sha),(url,'unverified')]:
 try:download_release(source,checksum,opener=wrong,sleep=waits.append);raise AssertionError('accepted unpinned source')
 except ValueError:pass
assert not calls
calls.clear();waits.clear()
def timeout(url,timeout):calls.append(url);raise TimeoutError('offline')
try:download_release(url,sha,opener=timeout,sleep=waits.append);raise AssertionError('did not bound retries')
except RuntimeError:pass
assert len(calls)==4 and waits==[2,4,8]
def api_asset(request,timeout):
 assert request.full_url=='https://api.github.com/repos/example/tool/releases/assets/123'
 assert request.get_header('Accept')=='application/octet-stream'
 assert not request.has_header('Authorization')
 return io.BytesIO(data)
assert download_release('https://api.github.com/repos/example/tool/releases/assets/123',sha,opener=api_asset,sleep=waits.append)==data
for source in ['https://api.github.com/repos/example/tool/actions/runs/123','https://api.github.com/repos/example/tool/releases/assets/latest']:
 try:download_release(source,sha,opener=wrong,sleep=waits.append);raise AssertionError('accepted unpinned API source')
 except ValueError:pass
`],{cwd:process.cwd(),env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},stdio:'pipe'});
});
