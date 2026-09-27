'use strict';
const fs=require('node:fs'),path=require('node:path');
const Engine=require('./src/route-engine');
const [inputPath,outputPath='output/result.json',version]=process.argv.slice(2);
if(!inputPath){console.error('Usage: node cli.js input.json [output.json] [0.1|0.2]');process.exit(1);}
try {
  const input=JSON.parse(fs.readFileSync(inputPath,'utf8'));
  const {origin,elements}=input;
  const options={version:'0.2',shape:'heart',targetKm:5,radiusKm:3,...input.options};
  if(version)options.version=version;
  if(!origin||!Number.isFinite(origin.lat)||!Number.isFinite(origin.lng)||Math.abs(origin.lat)>85||Math.abs(origin.lng)>180)throw new Error('Valid origin {lat,lng} required.');
  if(!Array.isArray(elements)||!elements.length)throw new Error('Non-empty OSM elements array required.');
  if(!Number.isFinite(options.targetKm)||options.targetKm<=0||!Number.isFinite(options.radiusKm)||options.radiusKm<=0)throw new Error('Positive targetKm and radiusKm required.');
  if(!['0.1','0.2'].includes(options.version))throw new Error('Version must be 0.1 or 0.2.');
  const started=Date.now();
  const graph=Engine.buildGraph(elements,origin,options.radiusKm*1000);
  const result=Engine.search(graph,options);
  const output={input:{origin,options},elapsedMs:Date.now()-started,result};
  fs.mkdirSync(path.dirname(path.resolve(outputPath)),{recursive:true});
  fs.writeFileSync(outputPath,JSON.stringify(output,null,2)+'\n');
  const features=[];
  const line=(points,properties)=>{
    if(points.length<2)return;
    features.push({type:'Feature',properties,geometry:{type:'LineString',coordinates:points.map(p=>{const [lat,lng]=Engine.toLatLng(p,origin);return [lng,lat];})}});
  };
  result.candidates.forEach((c,i)=>{
    const properties={rank:i+1,score:c.score.total,rawScore:c.score.raw,lengthKm:c.score.lengthKm,scaleRatio:c.scaleRatio};
    line(c.route,{...properties,kind:'route'});
    line(c.target,{...properties,kind:'target'});
    line(c.loop,{...properties,kind:'loop'});
    c.access.forEach((a,j)=>line(a,{...properties,kind:j?'return':'outward'}));
  });
  const geoPath=outputPath.endsWith('.json')?outputPath.slice(0,-5)+'.geojson':outputPath+'.geojson';
  fs.writeFileSync(geoPath,JSON.stringify({type:'FeatureCollection',features},null,2)+'\n');
  console.log(JSON.stringify({candidates:result.candidates.length,best:result.candidates[0]?.score,stats:result.stats,elapsedMs:output.elapsedMs,output:outputPath,geojson:geoPath},null,2));
} catch(error){console.error(error.message);process.exitCode=1;}
