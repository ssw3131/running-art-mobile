import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PNG } from 'pngjs';

test('native map probe cannot mistake an orange pause button for a recorded GPS line',t=>{
 const dir=mkdtempSync(path.join(tmpdir(),'runpen-route-colors-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const image=new PNG({width:100,height:200});image.data.fill(255);
 const rect=(x,y,w,h,color)=>{for(let r=y;r<y+h;r++)for(let c=x;c<x+w;c++)image.data.set([...color,255],(r*100+c)*4);};
 rect(45,90,3,30,[31,107,255]);rect(20,178,60,12,[252,86,2]);
 const input=path.join(dir,'map.png'),report=path.join(dir,'report.json');
 const probe=()=>{writeFileSync(input,PNG.sync.write(image));return spawnSync(process.execPath,['scripts/qa/live-route-colors.mjs',input,report]);};
 assert.equal(probe().status,1);assert.equal(JSON.parse(readFileSync(report)).counts.recorded,0);
 rect(50,110,3,20,[252,86,2]);assert.equal(probe().status,0);assert.equal(JSON.parse(readFileSync(report)).counts.recorded,60);
});
