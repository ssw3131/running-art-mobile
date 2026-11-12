import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const [file,report]=process.argv.slice(2),image=PNG.sync.read(readFileSync(file));
const counts={course:0,recorded:0};
for(let i=0;i<image.data.length;i+=4){
  const [r,g,b,a]=image.data.subarray(i,i+4);
  if(a===255&&r===31&&g===107&&b===255)counts.course++;
  if(a===255&&r===252&&g===86&&b===2)counts.recorded++;
}
writeFileSync(report,JSON.stringify({source:file,colors:{course:'#1F6BFF',recorded:'#FC5602'},counts},null,2)+'\n');
assert.ok(counts.course>20,'Planned blue course is missing from native live map');
assert.ok(counts.recorded>20,'Accepted real GPS trace is missing from native live map');
