// Loopback-only visual QA. Synthetic GPS fixtures and an explicit fetch test
// double; never deployed or used by the production viewer. No user records read.
import { createServer } from 'node:http';
import { Buffer } from 'node:buffer';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const root=new URL('../../build/run-share-web/',import.meta.url), report=new URL('../../.cache/run-share-qa/',import.meta.url);
const config=JSON.parse(await readFile(new URL('config.json',root),'utf8'));
const target=Array.from({length:241},(_,i)=>{
  const t=i/240*Math.PI*2;
  return [126.978+Math.pow(Math.sin(t),3)*0.005,37.5665+(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t))/16*0.004];
});
const route=target.map(([x,y])=>[Math.round(x*4000)/4000,Math.round(y*4000)/4000]);
const actual=route.map(([x,y],i)=>[x+0.000045*Math.sin(i),y+0.00004*Math.cos(i)]);
const fixture={schemaVersion:1,title:'합성 하트 경로 · 검증 전용',distanceM:3210,activeMs:1530000,segments:[actual.slice(0,95),actual.slice(104)],planned:{route,target}};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css; charset=utf-8','.txt':'text/plain'};
const allowed=['index.html','app.js','model.js','map-provider.js','config.json','style.css','robots.txt'];
const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
    if(url.pathname==='/qa-fixture.js'){
      res.setHeader('Content-Type',types['.js']);
      res.end(`const originalFetch=window.fetch.bind(window);window.fetch=(input,init)=>String(input)===${JSON.stringify(config.apiUrl+'/rest/v1/rpc/read_run_share')}?originalFetch('/qa-response?token='+JSON.parse(init.body).p_token,{signal:init.signal}):originalFetch(input,init);`);return;
    }
    if(url.pathname==='/qa-response'){
      res.setHeader('Content-Type','application/json');
      const token=url.searchParams.get('token');
      if(token==='d'.repeat(64)){res.statusCode=503;res.end('{}');return;}
      res.end(JSON.stringify(token==='b'.repeat(64)?fixture:token==='e'.repeat(64)?{...fixture,planned:null}:null));return;
    }
    const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
    if(!allowed.includes(name)){res.statusCode=404;res.end('Not found');return;}
    let data=await readFile(new URL(name,root));
    if(name==='index.html')data=Buffer.from(data.toString().replace('<script type="module"','<script src="/qa-fixture.js"></script><script type="module"'));
    res.setHeader('Content-Type',types[name.slice(name.lastIndexOf('.'))]||'application/octet-stream');res.end(data);
  }catch{res.statusCode=500;res.end('QA server error');}
});
server.listen(0,'127.0.0.1',async()=>{
  const origin=`http://127.0.0.1:${server.address().port}`;
  await mkdir(report,{recursive:true});await writeFile(new URL('server.json',report),JSON.stringify({origin,fixture:'synthetic-only'}));
  console.log(`Synthetic-only viewer QA: ${origin}/#r/${'b'.repeat(64)}`);
});
