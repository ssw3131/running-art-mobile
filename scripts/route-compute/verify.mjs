import fs from 'node:fs';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createComputeServer } from '../../server/route-compute/server.mjs';
import { COMPUTE_CONTRACT, parseComputeResponse } from '../../src/modules/route-compute/contract.ts';
import { readInput, runCalculation } from '../server-compute/runtime.mjs';

const directory='.cache/server-compute/fixtures';
const index=JSON.parse(fs.readFileSync(`${directory}/index.json`));
let server,base=process.argv[2];
if (!base || base==='local') {server=createComputeServer();server.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}`;}
const results=[];
try {
  const entries=index.cases.filter(c=>!c.synthetic);
  for(const entry of [...entries,{...entries[0],id:'gangnam-custom',options:{...entries[0].options,shape:'custom',customTemplate:[{x:0,y:1},{x:1,y:0},{x:0,y:-1},{x:-1,y:0},{x:0,y:1}]}}]) {
    const original=entries.find(c=>c.id===(entry.id==='gangnam-custom'?'gangnam':entry.id));
    const input=readInput(directory,original);input.options=entry.options;
    const expected=runCalculation(input);
    const request={contract:COMPUTE_CONTRACT,origin:input.origin,options:input.options,refresh:false};
    const started=performance.now();
    const response=await fetch(`${base}/v1/routes`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(80000),redirect:'error'});
    assert.equal(response.status,200);
    const value=parseComputeResponse(await response.json(),request);
    const resultSha256=createHash('sha256').update(JSON.stringify(value.result)).digest('hex');
    assert.equal(resultSha256,expected.resultSha256,`${entry.id} complete result differs from locked phone input`);
    const row={id:entry.id,httpMs:performance.now()-started,resultSha256,candidates:value.result.candidates.length,roads:value.roads,timing:value.timing};
    results.push(row);console.log(JSON.stringify(row));
  }
  const invalid=await fetch(`${base}/v1/routes`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  assert.equal(invalid.status,400);
  if(process.argv[3]) fs.writeFileSync(process.argv[3],JSON.stringify({at:new Date().toISOString(),base,results,invalidStatus:invalid.status},null,2)+'\n');
} finally {if(server)server.close();}
