import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { SERVICE_SHAPES, isGenerationDistance, generationRadiusKm } from '../src/modules/route-engine/service-shapes.ts';
import { templateFor, validateCustomTemplate } from '../src/modules/route-engine/engine.ts';
import { drawingTemplate } from '../src/features/route-lab/drawing.ts';
import { parseComputeRequest, CURRENT_COMPUTE_CONTRACT } from '../src/modules/route-compute/contract.ts';
import { FIGMA_SHAPE_VERSION } from '../src/modules/route-engine/figma-contours.ts';
import { decodeContourPng } from '../src/modules/image-contour/png.ts';
import { imageContour } from '../src/modules/image-contour/contour.ts';
import { encodeSnapshot, decodeSnapshot } from '../src/modules/courses/model.ts';

test('all twelve product silhouettes remain closed, non-crossing and distinct with legacy support',()=>{
  assert.equal(SERVICE_SHAPES.length,12);
  const hashes=new Set();
  for(const {id} of SERVICE_SHAPES){
    const points=templateFor(id,FIGMA_SHAPE_VERSION);assert.ok(Math.hypot(points[0].x-points.at(-1).x,points[0].y-points.at(-1).y)<1e-10);hashes.add(JSON.stringify(points));
    if(!['heart','star','cat','fish'].includes(id)) {
      const span=Math.max(...points.flatMap(p=>[Math.abs(p.x),Math.abs(p.y)]));
      validateCustomTemplate(drawingTemplate(points.map(p=>({x:.5+p.x/(span*2.2),y:.5+p.y/(span*2.2)}))));
    }
  }
  assert.equal(hashes.size,12);
  for(const id of ['rabbit','house','diamond','bolt','arrow'])assert.ok(templateFor(id).length);
});
test('product distances reject fractional, nonfinite and excessive requests for every shape',()=>{
  const request={contract:CURRENT_COMPUTE_CONTRACT,origin:{lat:37.4979,lng:127.0276},options:{version:'0.2',mode:'free-loop',shape:'heart',targetKm:5,radiusKm:2,shapeVersion:FIGMA_SHAPE_VERSION,maxRouteKm:20},refresh:false};
  for(const {id} of SERVICE_SHAPES)for(let km=1;km<=20;km++){
    const radiusKm=generationRadiusKm(km);
    assert.equal(radiusKm,km<=10?2:km/4);
    assert.equal(parseComputeRequest({...request,options:{...request.options,shape:id,targetKm:km,radiusKm}}).options.shape,id);
    assert.throws(()=>parseComputeRequest({...request,options:{...request.options,shape:id,targetKm:km,radiusKm:radiusKm+0.25}}));
  }
  for(const km of [0,21,40,1.5,NaN,Infinity,'5']){assert.equal(isGenerationDistance(km),false);assert.throws(()=>generationRadiusKm(km));assert.throws(()=>parseComputeRequest({...request,options:{...request.options,targetKm:km}}));}
});
test('saved new shape identities round-trip without changing legacy snapshot decoding',()=>{
  for(const {id} of SERVICE_SHAPES){
    const snapshot={schemaVersion:1,engineVersion:'0.2',source:'osm',shape:id,origin:{lat:37.5,lng:127},targetKm:1,lengthKm:1,score:50,
      route:[[127,37.5],[127.001,37.501],[127,37.5]],target:[[127,37.5],[127.001,37.501],[127,37.5]]};
    const encoded=encodeSnapshot(snapshot);assert.equal(decodeSnapshot(encoded.json,encoded.hash).shape,id);
  }
});
function square(transparent=false){
  const png=new PNG({width:64,height:48});
  for(let i=0;i<64*48;i++)png.data.set([255,255,255,transparent?0:255],i*4);
  for(let y=8;y<40;y++)for(let x=12;x<52;x++)png.data.set([20,20,20,255],(y*64+x)*4);
  return png;
}
test('native PNG filters and transparency preserve an actual rectangular silhouette',()=>{
  for(const transparent of [false,true])for(let filterType=0;filterType<=4;filterType++){
    const png=square(transparent),bytes=PNG.sync.write(png,{filterType});
    const image=decodeContourPng(bytes);assert.equal(image.width,64);assert.equal(image.height,48);assert.deepEqual(image.rgba,new Uint8Array(png.data));
    const contour=imageContour(image);assert.deepEqual(contour[0],contour.at(-1));assert.equal(contour.length,5);validateCustomTemplate(contour);
  }
});
test('image selection rejects blank, multiple objects, edge clipping and malformed PNG',()=>{
  const png=square();png.data.fill(255);assert.throws(()=>imageContour({width:64,height:48,rgba:png.data}),/윤곽/);
  for(let y=6;y<18;y++)for(const start of [5,38])for(let x=start;x<start+15;x++)png.data.set([0,0,0,255],(y*64+x)*4);
  assert.throws(()=>imageContour({width:64,height:48,rgba:png.data}),/여러/);
  for(let x=0;x<64;x++)png.data.set([0,0,0,255],x*4);
  assert.throws(()=>imageContour({width:64,height:48,rgba:png.data}),/여백/);
  assert.throws(()=>decodeContourPng(PNG.sync.write(square()).subarray(0,40)));
  assert.throws(()=>decodeContourPng(PNG.sync.write(new PNG({width:257,height:1}))));
});
test('outline holes are excluded, and background threshold can be adjusted before applying',()=>{
  const png=square();for(let y=13;y<35;y++)for(let x=17;x<47;x++)png.data.set([255,255,255,255],(y*64+x)*4);
  const a=imageContour({width:64,height:48,rgba:png.data});assert.equal(a.length,5);
  for(let i=0;i<png.data.length;i+=4)if(png.data[i]===20)png.data.set([210,210,210,255],i);
  assert.throws(()=>imageContour({width:64,height:48,rgba:png.data},90));
  assert.equal(imageContour({width:64,height:48,rgba:png.data},30).length,5);
});
