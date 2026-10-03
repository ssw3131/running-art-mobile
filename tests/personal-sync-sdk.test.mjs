import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createSyncRemote } from '../src/modules/sync/remote.ts';
import { digest, PAYLOAD_BYTES_MAX } from '../src/modules/sync/model.ts';
const owner='11111111-1111-4111-8111-111111111111';
const payload='{"fixture":"한글 경로 🏃"}',path=`${owner}/course/${'a'.repeat(32)}/${digest(payload)}.json`;
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
test('installed SDK sends ArrayBuffer, verifies duplicate bytes, scopes listing, invokes RPC and removes through Storage API',async()=>{
  const files=new Map(),seen=[];
  const client=createClient('https://example.supabase.co','test-public-key',{accessToken:async()=>'test-token',global:{fetch:async(input,init)=>{
    const url=new URL(input),method=init?.method??'GET';seen.push([method,url.pathname]);
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer test-token');
    if(url.pathname.startsWith('/storage/v1/object/')){
      if(method==='POST'){
        assert.ok(init.body instanceof ArrayBuffer);
        if(files.has(path))return json({statusCode:'409',error:'Duplicate',message:'The resource already exists'},409);
        files.set(path,new TextDecoder().decode(init.body));return json({Key:`personal-records/${path}`});
      }
      if(method==='GET'){
        const bytes=new TextEncoder().encode(files.get(path));
        // UTF-8 codepoints cross chunks; native Blob.text() must never be required.
        const response=new Response(new ReadableStream({start(controller){
          for(let i=0;i<bytes.length;i+=2)controller.enqueue(bytes.slice(i,i+2));controller.close();
        }}),{headers:{'Content-Type':'application/json'}});
        response.blob=()=>{throw new Error('Android Blob path is unsupported');};return response;
      }
      if(method==='DELETE'){assert.deepEqual(JSON.parse(init.body),{prefixes:[path]});files.delete(path);return json([]);}
    }
    if(url.pathname==='/rest/v1/rpc/commit_personal_record'){
      const body=JSON.parse(init.body);assert.equal(body.p_id,'a'.repeat(32));assert.equal(body.p_expected_version,0);assert.equal(body.p_payload_path,path);
      return json({outcome:'applied',record:{version:1}});
    }
    if(url.pathname==='/rest/v1/personal_records'){
      assert.equal(url.searchParams.get('owner_id'),`eq.${owner}`);assert.equal(url.searchParams.get('kind'),'eq.course');
      assert.equal(url.searchParams.get('record_id'),'gt.');assert.equal(url.searchParams.get('order'),'record_id.asc');return json([]);
    }
    throw new Error(`Unexpected fixture request ${method} ${url.pathname}`);
  }}});
  const remote=createSyncRemote(client,owner);
  await remote.upload(path,payload);await remote.upload(path,payload);assert.equal(await remote.download(path),payload);
  await remote.commit({kind:'course',id:'a'.repeat(32),remoteVersion:0,mutationId:'b'.repeat(32),deleted:false,summary:{id:'a'.repeat(32)},payload},path,digest(payload));
  assert.deepEqual(await remote.page('course',''),[]);
  files.set(path,'corrupt');await assert.rejects(remote.upload(path,payload),/원본/);
  await remote.remove(path);assert.equal(files.size,0);assert.ok(seen.some(([method])=>method==='DELETE'));
});

test('download cancels an oversized response before accepting partial content',async()=>{
  let canceled=false;
  const chunk=new Uint8Array(1024*1024);
  const client=createClient('https://example.supabase.co','test-public-key',{accessToken:async()=>'test-token',global:{fetch:async()=>new Response(new ReadableStream({
    start(controller){for(let i=0;i<=PAYLOAD_BYTES_MAX/chunk.length;i++)controller.enqueue(chunk);},
    cancel(){canceled=true;},
  }))}});
  await assert.rejects(createSyncRemote(client,owner).download(path),/크기/);
  assert.equal(canceled,true);
});
