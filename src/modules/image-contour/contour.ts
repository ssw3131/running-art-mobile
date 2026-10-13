import type { Point } from '../route-engine/types.ts';
import { drawingTemplate } from '../route-engine/drawing.ts';

export type ContourImage = { width: number; height: number; rgba: Uint8Array };
export function imageContour({ width: w, height: h, rgba }: ContourImage, threshold = 50): Point[] {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w<8 || h<8 || w>256 || h>256 || rgba.length!==w*h*4 || !Number.isFinite(threshold) || threshold<15 || threshold>180) throw new Error('이미지 크기나 윤곽 기준이 올바르지 않아요.');
  const pixel = (i: number, channel: number) => rgba[i*4+channel]*rgba[i*4+3]/255 + 255-rgba[i*4+3];
  const border: number[] = [];
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) if(x===0 || y===0 || x===w-1 || y===h-1) border.push(y*w+x);
  const background = [0,1,2].map(c => { const values=border.map(i=>pixel(i,c)).sort((a,b)=>a-b); return values[Math.floor(values.length/2)]; });
  const delta = (i: number) => Math.max(...background.map((b,c)=>Math.abs(pixel(i,c)-b)));
  if(border.filter(i=>delta(i)>threshold).length>border.length*.18) throw new Error('모양 주변에 단색 여백이 필요해요. 이미지를 잘라 다시 선택해 주세요.');
  const mask = new Uint8Array(w*h);
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++) mask[y*w+x]=delta(y*w+x)>threshold ? 1 : 0;
  const labels = new Int32Array(w*h), sizes:number[]=[0], queue=new Int32Array(w*h);
  for(let i=0;i<mask.length;i++) {
    if(!mask[i] || labels[i]) continue;
    const label=sizes.length; let first=0,last=1;queue[0]=i;labels[i]=label;
    while(first<last) { const p=queue[first++]; for(const n of [p-1,p+1,p-w,p+w]) if(mask[n] && !labels[n]) {labels[n]=label;queue[last++]=n;} }
    sizes.push(last);
  }
  const ranked=sizes.map((size,id)=>({size,id})).slice(1).sort((a,b)=>b.size-a.size);
  if(!ranked.length || ranked[0].size<Math.max(16,w*h*.002)) throw new Error('뚜렷한 윤곽을 찾지 못했어요. 단색 배경의 큰 모양 한 개를 선택해 주세요.');
  if(ranked[1]?.size>Math.max(20,ranked[0].size*.15)) throw new Error('큰 모양이 여러 개 있어요. 사용할 모양 하나만 잘라 선택해 주세요.');
  const id=ranked[0].id, edges=new Map<number,number[]>(), size=w+1;
  const edge=(ax:number,ay:number,bx:number,by:number)=>{const a=ay*size+ax,b=by*size+bx;edges.set(a,[...(edges.get(a)??[]),b]);};
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++) if(labels[y*w+x]===id) {
    if(labels[(y-1)*w+x]!==id) edge(x,y,x+1,y);
    if(labels[y*w+x+1]!==id) edge(x+1,y,x+1,y+1);
    if(labels[(y+1)*w+x]!==id) edge(x+1,y+1,x,y+1);
    if(labels[y*w+x-1]!==id) edge(x,y+1,x,y);
  }
  let best:Point[]=[],area=0;
  while(edges.size) {
    const start=edges.keys().next().value!;let at=start; const loop:Point[]=[];
    do {
      loop.push({x:at%size,y:Math.floor(at/size)});
      const next=edges.get(at); if(!next?.length) break;
      const to=next.pop()!;if(!next.length)edges.delete(at);at=to;
    } while(at!==start && loop.length<=w*h*4);
    if(at!==start || loop.length<4) continue;
    loop.push({...loop[0]});
    const a=Math.abs(loop.slice(1).reduce((n,p,i)=>n+loop[i].x*p.y-p.x*loop[i].y,0));
    if(a>area) {best=loop;area=a;}
  }
  if(!best.length) throw new Error('닫힌 윤곽을 찾지 못했어요. 더 단순한 모양을 선택해 주세요.');
  const step=Math.max(1,Math.ceil(best.length/1500)), span=Math.max(w,h);
  const points=best.filter((_,i)=>i%step===0 || i===best.length-1).map(p=>({x:(p.x+(span-w)/2)/span,y:(p.y+(span-h)/2)/span}));
  return drawingTemplate(points);
}
