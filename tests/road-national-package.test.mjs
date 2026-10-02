import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { sha256 } from '../scripts/road-data/common.mjs';

test('national package rejects truncated extraction and reuses only byte-identical previous roads',t=>{
  const parent=path.resolve('.cache/national-package-tests');fs.mkdirSync(parent,{recursive:true});
  const root=fs.mkdtempSync(path.join(parent,'case-'));
  t.after(()=>{assert.ok(root.startsWith(parent+path.sep));fs.rmSync(root,{recursive:true,force:true});});
  const way={type:'way',id:100,nodes:[1,2],geometry:[{lat:37.499,lon:126.999},{lat:37.501,lon:127.001}],tags:{highway:'footway'}};
  function prepare(name,day,ways){
    const source={sha256:day.repeat(64).slice(0,64),url:'https://example.com/synthetic.pbf',dataTimestamp:`2026-09-${day}T00:00:00Z`,license:'ODbL-1.0',attribution:'synthetic'};
    const file=path.join(root,`${name}.jsonl`),lock=path.join(root,`${name}.lock.json`);
    const bytes=Buffer.from([JSON.stringify({source,regions:null}),...ways.map(w=>JSON.stringify(w)),''].join('\n'));
    fs.writeFileSync(file,bytes);fs.writeFileSync(lock,JSON.stringify(source));
    fs.writeFileSync(file+'.report.json',JSON.stringify({source,national:true,jsonl:true,outputBytes:bytes.length,outputSha256:sha256(bytes),extractedWays:ways.length}));
    return {file,lock};
  }
  function run(name,input,previous){
    return spawnSync(process.execPath,['scripts/road-data/national-package.mjs','--input',input.file,'--source-lock',input.lock,
      '--output',path.join(root,name),...(previous?['--reuse-directory',path.join(root,previous)]:[])],{encoding:'utf8'});
  }
  const a=prepare('a','29',[way]);assert.equal(run('out-a',a).status,0);
  const b=prepare('b','30',[way]);assert.equal(run('out-b',b,'out-a').status,0);
  const read=name=>JSON.parse(fs.readFileSync(path.join(root,name,'inventory.json'),'utf8'));
  const first=read('out-a'),second=read('out-b');
  assert.notEqual(first.release,second.release);assert.equal(first.files.length,4);
  assert.deepEqual(second.files.map(f=>f.sha256),first.files.map(f=>f.sha256));
  assert.ok(second.files.every(f=>f.tileRelease===first.release));
  const changed=prepare('changed','30',[{...way,tags:{highway:'footway',surface:'gravel'}}]);
  assert.equal(run('out-changed',changed,'out-a').status,0);
  assert.ok(read('out-changed').files.every((f,i)=>f.sha256!==first.files[i].sha256&&!f.tileRelease));
  fs.appendFileSync(b.file,'\n');assert.notEqual(run('out-broken',b).status,0);
  assert.ok(!fs.existsSync(path.join(root,'out-broken','inventory.json')));
});
