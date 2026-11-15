import type { Graph, Point, RoadSegmentRef, Steps } from './types.ts';

export const segmentKey = (r: RoadSegmentRef) => `${r.way}/${r.from}/${r.to}`;
export const projectPoint = (p: Point, a: Point, b: Point) => {
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
  const t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;
  const point={x:a.x+t*dx,y:a.y+t*dy};
  return {t,point,distance:Math.hypot(p.x-point.x,p.y-point.y)};
};
export class WalkingError extends Error {
  code: 'source-missing'|'source-ambiguous';
  constructor(code: WalkingError['code']) {
    super(code==='source-ambiguous'?'현재 도로가 겹쳐 위치를 구분하기 어려워요. 조금 이동한 뒤 다시 확인해 주세요.':'보행 도로 위에서 현재 위치를 다시 확인해 주세요.');this.code=code;
  }
}
export class WalkingHeap {
  a: {id:number;cost:number}[]=[];
  push(value: {id:number;cost:number}) { let i=this.a.length;this.a.push(value);while(i){const p=(i-1)>>1;if(this.a[p].cost<=value.cost)break;this.a[i]=this.a[p];i=p;}this.a[i]=value; }
  pop() { const top=this.a[0],last=this.a.pop()!;if(this.a.length){let i=0;while(i*2+1<this.a.length){let c=i*2+1;if(c+1<this.a.length&&this.a[c+1].cost<this.a[c].cost)c++;if(this.a[c].cost>=last.cost)break;this.a[i]=this.a[c];i=c;}this.a[i]=last;}return top; }
}
type Index={cells:Map<string,number[]>;refs:Map<string,number[]>};
const indexes=new WeakMap<Graph,Index>();
export function* walkingIndexSteps(graph:Graph):Steps<Index>{
  const old=indexes.get(graph);if(old)return old;
  const cells=new Map<string,number[]>(),refs=new Map<string,number[]>();
  const put=(map:Map<string,number[]>,key:string,id:number)=>{const list=map.get(key)??[];list.push(id);map.set(key,list);};
  for(let id=0;id<graph.edges.length;id++){
    if(id%128===0)yield;
    const e=graph.edges[id],a=graph.nodes[e.a],b=graph.nodes[e.b];
    if(e.ref)put(refs,segmentKey(e.ref),id);
    for(let x=Math.floor(Math.min(a.x,b.x)/100);x<=Math.floor(Math.max(a.x,b.x)/100);x++)for(let y=Math.floor(Math.min(a.y,b.y)/100);y<=Math.floor(Math.max(a.y,b.y)/100);y++)put(cells,`${x},${y}`,id);
  }
  const index={cells,refs};indexes.set(graph,index);return index;
}
export type WalkingSource={edge:number;t:number;separation:number;point:Point};
export function* snapWalkingSourceSteps(graph:Graph,p:Point,accuracy:number):Steps<WalkingSource>{
  const index=yield* walkingIndexSteps(graph),ids=new Set<number>(),limit=Math.max(12,accuracy);
  for(let x=Math.floor((p.x-limit)/100);x<=Math.floor((p.x+limit)/100);x++)for(let y=Math.floor((p.y-limit)/100);y<=Math.floor((p.y+limit)/100);y++)for(const id of index.cells.get(`${x},${y}`)??[])ids.add(id);
  let source:WalkingSource|null=null,ambiguous=false;
  for(const id of [...ids].sort((a,b)=>a-b)){
    const edge=graph.edges[id],snap=projectPoint(p,graph.nodes[edge.a],graph.nodes[edge.b]);
    if(snap.distance<=limit&&(!source||snap.distance<source.separation-1)){source={edge:id,t:snap.t,separation:snap.distance,point:snap.point};ambiguous=false;}
    else if(source&&Math.abs(snap.distance-source.separation)<=1){const old=graph.edges[source.edge];if(![old.a,old.b].includes(edge.a)&&![old.a,old.b].includes(edge.b)&&snap.t>0.02&&snap.t<0.98)ambiguous=true;}
  }
  if(!source||ambiguous)throw new WalkingError(ambiguous?'source-ambiguous':'source-missing');return source;
}
export type WalkingField={graph:Graph;source:WalkingSource;costs:Float64Array;previous:Int32Array};
export function* walkingFieldSteps(graph:Graph,p:Point,accuracy=30):Steps<WalkingField>{
  const source=yield* snapWalkingSourceSteps(graph,p,accuracy),e=graph.edges[source.edge];
  const costs=new Float64Array(graph.nodes.length).fill(Infinity),previous=new Int32Array(graph.nodes.length).fill(-1),heap=new WalkingHeap();
  for(const [id,cost,allowed] of [[e.a,e.length*source.t,graph.nodes[e.b].links.some(l=>l.id===source.edge&&l.to===e.a)], [e.b,e.length*(1-source.t),graph.nodes[e.a].links.some(l=>l.id===source.edge&&l.to===e.b)]] as [number,number,boolean][]){if(allowed||cost===0){costs[id]=cost;heap.push({id,cost});}}
  let visits=0;
  while(heap.a.length){if(visits++%128===0)yield;const {id,cost}=heap.pop();if(cost!==costs[id])continue;for(const link of graph.nodes[id].links){const next=cost+link.length;if(next<costs[link.to]){costs[link.to]=next;previous[link.to]=id;heap.push({id:link.to,cost:next});}}}
  return {graph,source,costs,previous};
}
export type WalkingJoin={path:Point[];distanceM:number;targetM:number;source:RoadSegmentRef};
/** The same source distance field serves every generated candidate. */
export function joinFromField(field:WalkingField,ids:number[]):WalkingJoin|null{
  const {graph,source,costs,previous}=field;let best:{node:number;cost:number;m:number;point:Point}|null=null,m=0;
  for(let i=0;i<ids.length;i++){
    const id=ids[i];if(Number.isFinite(costs[id])&&(!best||costs[id]<best.cost))best={node:id,cost:costs[id],m,point:graph.nodes[id]};
    if(i+1<ids.length){const a=graph.nodes[id],b=graph.nodes[ids[i+1]],edge=graph.edges[source.edge];
      const length=Math.hypot(a.x-b.x,a.y-b.y);
      if((edge.a===id&&edge.b===ids[i+1])||(edge.b===id&&edge.a===ids[i+1])){best={node:-1,cost:0,m:m+length*(edge.a===id?source.t:1-source.t),point:source.point};break;}
      m+=length;
    }
  }
  const ref=graph.edges[source.edge].ref;if(!best||!ref)return null;
  const chain:Point[]=[];for(let id=best.node;id>=0;id=previous[id])chain.push(graph.nodes[id]);chain.reverse();
  const path=[source.point,...chain,best.point].filter((p,i,a)=>!i||Math.hypot(p.x-a[i-1].x,p.y-a[i-1].y)>0.01).map(p=>({x:p.x,y:p.y}));if(path.length===1)path.push({...path[0]});
  return {path,distanceM:best.cost,targetM:best.m,source:{...ref}};
}
