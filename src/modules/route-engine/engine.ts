// Ported from the preserved v0.2 source in tests/reference/v02.
// Numeric operations, ordering and search limits are unchanged. Search-local
// routing storage/cache avoids repeated work; generators expose cancellation points.
import type { Point, Origin, Tags, OsmElement, GraphNode, GraphEdge, Graph, SearchOptions, ProgressCallback, Steps, Placement, EvaluatedCandidate, Usage, Score, SearchResult } from './types.ts';

function point(x: number, y: number): Point {
  return { x, y };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lerp(a: Point, b: Point, t: number): Point {
  return point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
}


function starTemplate() {
  const pts = [];
  const tips = 5;
  for (let i = 0; i <= tips * 2; i += 1) {
    const r = i % 2 === 0 ? 1 : 0.43;
    const a = -Math.PI / 2 + (Math.PI * i) / tips;
    pts.push(point(Math.cos(a) * r, Math.sin(a) * r));
  }
  return pts;
}

function catTemplate() {
  const raw = [
    [-1.18, 0.08], [-1.38, -0.08], [-1.52, -0.28], [-1.42, -0.43],
    [-1.17, -0.34], [-0.86, -0.22], [-0.45, -0.34], [0.08, -0.38],
    [0.56, -0.28], [0.92, -0.12], [1.14, -0.28], [1.34, -0.72],
    [1.48, -0.18], [1.28, 0.08], [1.02, 0.22], [0.93, 0.54],
    [0.72, 0.84], [0.48, 0.50], [0.18, 0.46], [-0.12, 0.86],
    [-0.35, 0.48], [-0.82, 0.42], [-1.05, 0.55], [-1.26, 0.76],
    [-1.42, 0.58], [-1.24, 0.34], [-1.02, 0.23], [-1.18, 0.08]
  ].map(([x, y]) => point(x, y));
  return raw;
}

function rabbitTemplate() {
  const raw = [
    [-1.32, 0.38], [-1.18, 0.08], [-0.88, -0.12], [-0.46, -0.22],
    [0.02, -0.24], [0.46, -0.18], [0.78, -0.03], [0.93, -0.28],
    [0.78, -1.12], [0.98, -1.44], [1.16, -0.96], [1.16, -0.28],
    [1.30, -0.46], [1.58, -1.22], [1.82, -1.42], [1.78, -0.88],
    [1.50, -0.24], [1.33, 0.08], [1.56, 0.28], [1.43, 0.53],
    [1.05, 0.47], [0.72, 0.58], [0.34, 0.72], [-0.08, 0.80],
    [-0.52, 0.78], [-0.94, 0.67], [-1.20, 0.52], [-1.32, 0.38]
  ].map(([x, y]) => point(x, y));
  return raw;
}

const SHAPES = [
  {id:'heart',name:'하트',description:'계단형 윤곽으로 사랑을 그리는 코스'},
  {id:'star',name:'별',description:'다섯 꼭짓점을 따라 만드는 별 모양'},
  {id:'cat',name:'고양이',description:'귀와 꼬리를 살린 고양이 옆모습'},
  {id:'rabbit',name:'토끼',description:'긴 귀가 특징인 토끼 옆모습'},
  {id:'house',name:'집',description:'지붕과 네모난 몸체로 표현하는 단순한 윤곽',added:true},
  {id:'diamond',name:'다이아몬드',description:'네 번의 큰 방향 전환으로 만드는 마름모',added:true},
  {id:'bolt',name:'번개',description:'직선과 지그재그로 표현하는 번개',added:true},
  {id:'fish',name:'물고기',description:'각진 몸통과 꼬리를 한 바퀴로 잇는 윤곽',added:true},
  {id:'arrow',name:'화살표',description:'격자 도로에 맞추기 쉬운 직선 중심의 윤곽',added:true}
];
const polygonTemplates: Record<string, number[][]> = {
  house:[[0,-1.2],[1.1,-0.25],[1.1,1],[-1.1,1],[-1.1,-0.25],[0,-1.2]],
  diamond:[[0,-1.2],[1,0],[0,1.2],[-1,0],[0,-1.2]],
  bolt:[[0.25,-1.3],[-0.95,0.2],[-0.15,0.2],[-0.4,1.3],[0.95,-0.3],[0.15,-0.3],[0.25,-1.3]],
  fish:[[-1.3,-0.7],[-0.65,-0.25],[0,-0.75],[0.85,-0.55],[1.35,0],[0.85,0.55],[0,0.75],[-0.65,0.25],[-1.3,0.7],[-1.3,-0.7]],
  arrow:[[-1.3,-0.4],[0.25,-0.4],[0.25,-1],[1.3,0],[0.25,1],[0.25,0.4],[-1.3,0.4],[-1.3,-0.4]]
};
function templateFor(name: string): Point[] {
  const factories: Record<string, () => Point[]> = {heart:heartTemplate,star:starTemplate,cat:catTemplate,rabbit:rabbitTemplate};
  const factory=factories[name];
  if(factory) return factory();
  if(polygonTemplates[name]) return polygonTemplates[name].map(([x,y])=>point(x,y));
  throw new Error('지원하지 않는 도형입니다.');
}

function densify(points: Point[], count: number): Point[] {
  if (!points.length) return [];
  if (points.length === 1 || count <= 1) return [points[0]];
  const lengths = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += dist(points[i - 1], points[i]);
    lengths.push(total);
  }
  const out = [points[0]];
  for (let i = 1; i < count; i += 1) {
    const target = (total * i) / (count - 1);
    let seg = lengths.findIndex((value) => value >= target);
    if (seg === -1) seg = lengths.length - 1;
    seg = Math.max(0, Math.min(seg, points.length - 2));
    const prevLength = seg === 0 ? 0 : lengths[seg - 1];
    const span = lengths[seg] - prevLength || 1;
    out.push(lerp(points[seg], points[seg + 1], (target - prevLength) / span));
  }
  return out;
}

function transformPoints(points: Point[], scale: number, rotation: number, tx: number, ty: number): Point[] {
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  return points.map((p) => point(tx + (p.x * c - p.y * s) * scale, ty + (p.x * s + p.y * c) * scale));
}


class MinHeap {
  private ids = new Int32Array(64);
  private costs = new Float64Array(64);
  private distances = new Float64Array(64);
  length = 0;
  id = 0;
  g = 0;

  clear() { this.length = 0; }

  push(id: number, g: number, distance: number) {
    if (this.length === this.ids.length) {
      const capacity = this.length * 2;
      const ids = new Int32Array(capacity), costs = new Float64Array(capacity), distances = new Float64Array(capacity);
      ids.set(this.ids); costs.set(this.costs); distances.set(this.distances);
      this.ids = ids; this.costs = costs; this.distances = distances;
    }
    const ids = this.ids, costs = this.costs, distances = this.distances;
    let index = this.length++;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (distances[parent] <= distance) break;
      ids[index] = ids[parent]; costs[index] = costs[parent]; distances[index] = distances[parent];
      index = parent;
    }
    ids[index] = id; costs[index] = g; distances[index] = distance;
  }

  pop() {
    const ids = this.ids, costs = this.costs, distances = this.distances;
    this.id = ids[0]; this.g = costs[0];
    const length = --this.length;
    if (!length) return;
    const id = ids[length], g = costs[length], distance = distances[length];
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      let best=distance;
      if (left < length && distances[left] < best) {smallest=left;best=distances[left];}
      if (right < length && distances[right] < best) smallest=right;
      if (smallest === index) break;
      ids[index] = ids[smallest]; costs[index] = costs[smallest]; distances[index] = distances[smallest];
      index = smallest;
    }
    ids[index] = id; costs[index] = g; distances[index] = distance;
  }
}


function pathLength(points: Point[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i += 1) sum += dist(points[i - 1], points[i]);
  return sum;
}

function directedHausdorff(a: Point[], b: Point[]): number {
  let maxMin = 0;
  a.forEach((pa) => {
    let min = Infinity;
    b.forEach((pb) => {
      min = Math.min(min, dist(pa, pb));
    });
    maxMin = Math.max(maxMin, min);
  });
  return maxMin;
}

function discreteFrechet(a: Point[], b: Point[]): number {
  const ca = Array.from({ length: a.length }, () => new Array<number>(b.length).fill(-1));
  function c(i: number, j: number): number {
    if (ca[i][j] > -1) return ca[i][j];
    const d = dist(a[i], b[j]);
    if (i === 0 && j === 0) ca[i][j] = d;
    else if (i > 0 && j === 0) ca[i][j] = Math.max(c(i - 1, 0), d);
    else if (i === 0 && j > 0) ca[i][j] = Math.max(c(0, j - 1), d);
    else ca[i][j] = Math.max(Math.min(c(i - 1, j), c(i - 1, j - 1), c(i, j - 1)), d);
    return ca[i][j];
  }
  return c(a.length - 1, b.length - 1);
}

function angleSeries(points: Point[], count = 40): number[] {
  const samples = densify(points, count + 2);
  const out = [];
  for (let i = 1; i < samples.length - 1; i += 1) {
    const a = Math.atan2(samples[i].y - samples[i - 1].y, samples[i].x - samples[i - 1].x);
    const b = Math.atan2(samples[i + 1].y - samples[i].y, samples[i + 1].x - samples[i].x);
    let delta = Math.abs(b - a);
    while (delta > Math.PI) delta = Math.abs(delta - Math.PI * 2);
    out.push(delta);
  }
  return out;
}

function angleSimilarity(a: Point[], b: Point[]): number {
  const aa = angleSeries(a);
  const bb = angleSeries(b);
  let error = 0;
  for (let i = 0; i < aa.length; i += 1) error += Math.abs(aa[i] - bb[i]);
  return clamp01(1 - error / (aa.length * Math.PI * 0.65));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}


// Orthogonal pixel outline; its perimeter, not its bounding box, determines scale.
function heartTemplate() {
  return [[0,-2],[1,-2],[1,-3],[3,-3],[3,-2],[4,-2],[4,0],[3,0],
    [3,1],[2,1],[2,2],[1,2],[1,3],[0,3],[-1,3],[-1,2],[-2,2],
    [-2,1],[-3,1],[-3,0],[-4,0],[-4,-2],[-3,-2],[-3,-3],[-1,-3],[-1,-2],[0,-2]]
    .map(([x,y]) => point(x,y));
}
function projection(origin: Origin) {
  return {lat: 111195, lng: 111195 * Math.cos(origin.lat * Math.PI / 180)};
}
function toPoint(lat: number, lng: number, origin: Origin): Point {
  const m = projection(origin);
  return point((lng-origin.lng)*m.lng, (origin.lat-lat)*m.lat);
}
function toLatLng(p: Point, origin: Origin): [number, number] {
  const m = projection(origin);
  return [origin.lat-p.y/m.lat, origin.lng+p.x/m.lng];
}
function runnable(tags: Tags = {}): boolean {
  const h = tags.highway ?? '';
  if (!/^(residential|living_street|service|unclassified|tertiary|tertiary_link|secondary|secondary_link|primary|primary_link|pedestrian|footway|path|track|steps|cycleway)$/.test(h || '')) return false;
  if (['no','private','use_sidepath'].includes(tags.foot ?? '') || ['no','private'].includes(tags.access ?? '')) return false;
  if (tags.indoor === 'yes' || tags.area === 'yes' || tags.construction || tags['access:conditional'] || tags['foot:conditional']) return false;
  if (['primary','primary_link','cycleway'].includes(h) && !['yes','designated','permissive'].includes(tags.foot ?? '')) return false;
  if (tags.sidewalk === 'no' && !['yes','designated','permissive'].includes(tags.foot ?? '')) return false;
  return true;
}
function *buildGraphSteps(elements: OsmElement[], origin: Origin, radius: number): Steps<Graph> {
  const nodes: GraphNode[] = [], edges: GraphEdge[] = [], index = new Map<string, number>(), edgeKeys = new Set<string>();
  // Only actual OSM node IDs join roads: overpasses and nearby roads stay separate.
  function node(key: string, p: Point): number {
    if (index.has(key)) return index.get(key)!;
    const id = nodes.length;
    nodes.push({...p, id, links: []}); index.set(key,id); return id;
  }
  function edge(a: number,b: number,forward: boolean,backward: boolean,tags: Tags,ref: import('./types.ts').RoadSegmentRef) {
    if(a===b) return;
    const key = `${a}:${b}:${forward}:${backward}`;
    if(edgeKeys.has(key)) return;
    edgeKeys.add(key);
    const length = dist(nodes[a],nodes[b]), id = edges.length;
    edges.push({a,b,length,tags,ref});
    if(forward) nodes[a].links.push({to:b,length,id});
    if(backward) nodes[b].links.push({to:a,length,id});
  }
  for(const way of elements) {
    yield;
    if(way.type!=='way' || !runnable(way.tags) || !way.nodes || !way.geometry) continue;
    const forward = way.tags!['oneway:foot'] !== '-1';
    const backward = !['yes','1','true'].includes(way.tags!['oneway:foot'] ?? '');
    for(let i=1;i<way.geometry.length;i++) {
      const a=way.geometry[i-1], b=way.geometry[i];
      if(!a || !b) continue;
      const pa=toPoint(a.lat,a.lon,origin), pb=toPoint(b.lat,b.lon,origin);
      if(Math.hypot(pa.x,pa.y)>radius || Math.hypot(pb.x,pb.y)>radius) continue;
      let last=node(`osm:${way.nodes[i-1]}`,pa);
      // Intermediate samples are edge-specific, so long roads are snappable without false junctions.
      const count=Math.max(1,Math.ceil(dist(pa,pb)/40));
      for(let j=1;j<=count;j++) {
        if(j%64===0) yield;
        const next=node(j===count ? `osm:${way.nodes[i]}` : `way:${way.id}:${i}:${j}`,lerp(pa,pb,j/count));
        edge(last,next,forward,backward,way.tags!,{way:way.id,from:way.nodes[i-1],to:way.nodes[i],start:(j-1)/count,end:j/count,bidirectional:forward&&backward}); last=next;
      }
    }
  }
  for(const n of nodes) {
    if(n.id%128===0) yield;
    const neighbors=[...new Set(n.links.map(l=>l.to))];
    n.turn=neighbors.length!==2;
    if(neighbors.length===2) {
      const a=nodes[neighbors[0]],b=nodes[neighbors[1]];
      const cosine=((a.x-n.x)*(b.x-n.x)+(a.y-n.y)*(b.y-n.y))/(dist(a,n)*dist(b,n));
      n.turn=cosine>-0.85;
    }
  }
  const grid=new Map<string, number[]>(), cell=100;
  for(const n of nodes) {
    if(n.id%128===0) yield;
    const key=`${Math.floor(n.x/cell)},${Math.floor(n.y/cell)}`;
    if(!grid.has(key)) grid.set(key,[]);
    grid.get(key)!.push(n.id);
  }
  return {nodes,edges,grid,cell,origin};
}
type SpatialColumns = Map<number,Map<number,number[]>>;
const EMPTY_NODE_IDS: readonly number[]=[];
function *searchIndexesSteps(graph: Graph,reachable: Set<number>): Steps<{all: SpatialColumns; turns: SpatialColumns}> {
  const all: SpatialColumns=new Map(),turns: SpatialColumns=new Map();let visited=0;
  for(const [key,ids] of graph.grid) {
    if(visited++%32===0) yield;
    const [x,y]=key.split(',').map(Number),allIds: number[]=[],turnIds: number[]=[];
    for(const id of ids) if(reachable.has(id)) {
      allIds.push(id);
      if(graph.nodes[id].turn && graph.nodes[id].links.length>=2) turnIds.push(id);
    }
    if(!all.has(x)) {all.set(x,new Map());turns.set(x,new Map());}
    all.get(x)!.set(y,allIds);turns.get(x)!.set(y,turnIds);
  }
  return {all,turns};
}
function nearestNode(graph: Graph,p: Point,limit=180,turnOnly=false,columns?: SpatialColumns): GraphNode | null {
  let best: GraphNode | null=null, bestD=limit;
  const {cell,grid,nodes,reachable}=graph;
  const maxX=Math.floor((p.x+limit)/cell),minY=Math.floor((p.y-limit)/cell),maxY=Math.floor((p.y+limit)/cell);
  for(let x=Math.floor((p.x-limit)/cell);x<=maxX;x++) {
    const column=columns?.get(x);
    if(columns && !column) continue;
    for(let y=minY;y<=maxY;y++) {
      for(const id of (columns?column?.get(y):grid.get(`${x},${y}`))??EMPTY_NODE_IDS) {
        const n=nodes[id];
        if((turnOnly && !n.turn) || (!columns && reachable && !reachable.has(id))) continue;
        // Axis distances are lower bounds; retain the original hypot and strict tie test.
        if(Math.abs(n.x-p.x)>bestD || Math.abs(n.y-p.y)>bestD) continue;
        const d=dist(n,p);
        if(d<bestD) {best=n;bestD=d;}
      }
    }
  }
  return best;
}
export type SearchDiagnostics = {
  pathRequests: number; pathCacheHits: number; pathSearches: number; pathVisits: number;
  maxCachedPaths: number; maxCachedNodes: number;
};
const MAX_CACHED_PATHS=8192, MAX_CACHED_NODES=262144;
// Owned by one search, never by a graph or a module singleton. Interleaved jobs,
// cancellation and a later call with an edited graph cannot reuse stale state.
function routingContext(graph: Graph, diagnostics?: SearchDiagnostics) {
  const size=graph.nodes.length;
  return {costs:new Float64Array(size),previous:new Int32Array(size),stamps:new Uint32Array(size),
    heuristic:new Float64Array(size),heuristicTargets:new Int32Array(size).fill(-1),
    generation:0,cache:new Map<string,number[]>(),cacheKeys:new Array<string>(MAX_CACHED_PATHS),cacheHead:0,cachedNodes:0,
    turnColumns:undefined as SpatialColumns | undefined,queue:new MinHeap(),diagnostics};
}
type RoutingContext = ReturnType<typeof routingContext>;
function *shortestPathSteps(graph: Graph,start: number,end: number,maxLength=Infinity,context: RoutingContext=routingContext(graph)): Steps<number[]> {
  const {diagnostics}=context;
  if(diagnostics) diagnostics.pathRequests++;
  if(start===end) return [start];
  // Direction and exact budget both matter, including cached failures.
  const key=`${start}:${end}:${maxLength}`,cached=context.cache.get(key);
  if(cached) {if(diagnostics) diagnostics.pathCacheHits++;return cached;}
  if(diagnostics) diagnostics.pathSearches++;
  const {costs,previous,stamps,heuristic,heuristicTargets,queue}=context;
  queue.clear();
  context.generation=(context.generation+1)>>>0;
  if(!context.generation) {stamps.fill(0);context.generation=1;}
  const generation=context.generation;
  costs[start]=0;stamps[start]=generation;
  queue.push(start,0,dist(graph.nodes[start],graph.nodes[end]));
  let visits=0;
  function remember(path: number[]) {
    if(diagnostics) diagnostics.pathVisits+=visits;
    if(path.length>MAX_CACHED_NODES) return path;
    while(context.cache.size>=MAX_CACHED_PATHS || context.cachedNodes+path.length>MAX_CACHED_NODES) {
      const first=context.cacheKeys[context.cacheHead];
      context.cacheHead=(context.cacheHead+1)%MAX_CACHED_PATHS;
      context.cachedNodes-=context.cache.get(first)!.length;context.cache.delete(first);
    }
    context.cacheKeys[(context.cacheHead+context.cache.size)%MAX_CACHED_PATHS]=key;
    context.cache.set(key,path);context.cachedNodes+=path.length;
    if(diagnostics) {
      diagnostics.maxCachedPaths=Math.max(diagnostics.maxCachedPaths,context.cache.size);
      diagnostics.maxCachedNodes=Math.max(diagnostics.maxCachedNodes,context.cachedNodes);
    }
    return path;
  }
  while(queue.length) {
    if(visits++%32===0) yield;
    queue.pop();
    const currentId=queue.id,currentCost=queue.g;
    if(stamps[currentId]!==generation || currentCost!==costs[currentId]) continue;
    if(currentId===end) {
      const path=[end]; let id=end;
      while(id!==start) {id=previous[id];path.push(id);}
      return remember(path.reverse());
    }
    for(const link of graph.nodes[currentId].links) {
      const g=currentCost+link.length;
      if(g >= (stamps[link.to]===generation?costs[link.to]:Infinity)) continue;
      if(heuristicTargets[link.to]!==end) {
        heuristic[link.to]=dist(graph.nodes[link.to],graph.nodes[end]);heuristicTargets[link.to]=end;
      }
      const f=g+heuristic[link.to];
      if(f>maxLength) continue;
      costs[link.to]=g;previous[link.to]=currentId;stamps[link.to]=generation;
      queue.push(link.to,g,f);
    }
  }
  return remember([]);
}
function nearbyTurns(graph: Graph,p: Point,limit=230,columns?: SpatialColumns): { id: number; d: number }[] {
  const out=[],{cell,grid,nodes,reachable}=graph;
  const maxX=Math.floor((p.x+limit)/cell),minY=Math.floor((p.y-limit)/cell),maxY=Math.floor((p.y+limit)/cell);
  for(let x=Math.floor((p.x-limit)/cell);x<=maxX;x++) {
    const column=columns?.get(x);
    for(let y=minY;y<=maxY;y++)
      for(const id of (columns?column?.get(y):grid.get(`${x},${y}`))??EMPTY_NODE_IDS) {
        const n=nodes[id];
        if(!columns && (!n.turn || n.links.length<2 || (reachable && !reachable.has(id)))) continue;
        const d=dist(n,p);if(d<=limit) out.push({id,d});
      }
  }
  out.sort((a,b)=>a.d-b.d);
  const selected: { id: number; d: number }[]=[];
  for(const item of out) {
    if(selected.every(o=>dist(nodes[o.id],nodes[item.id])>35)) selected.push(item);
    if(selected.length===5) break;
  }
  if(!selected.length) {const n=nearestNode(graph,p,180);if(n) selected.push({id:n.id,d:dist(n,p)});}
  return selected;
}
function *routeFromTemplateSteps(graph: Graph,target: Point[],maxLength: number,context: RoutingContext=routingContext(graph)): Steps<number[] | null> {
  // Preserve the actual corners; extra mid-edge snaps can force detours on long straight sides.
  const samples=target, choices=samples.slice(0,-1).map(p=>nearbyTurns(graph,p,230,context.turnColumns));
  if(choices.some(c=>!c.length)) return null;
  let beam=choices[0].slice(0,3).map(n=>({ids:[n.id],length:0,cost:n.d*1.5,start:n.id,seen:new Set<string>()}));
  type PathGeometry = { ids: number[]; length: number; keys: string[]; lengths: number[]; repeated: boolean[] };
  const cache=new Map<string, PathGeometry>();
  for(let i=1;i<=choices.length;i++) {
    yield;
    const next=[];
    for(const prev of beam) {
      const last=prev.ids[prev.ids.length-1];
      for(const n of i===choices.length?[{id:prev.start,d:0}]:choices[i]) {
        const key=`${last}:${n.id}`;
        let path=cache.get(key);
        if(!path) {
          const ids=yield* shortestPathSteps(graph,last,n.id,Math.min(maxLength,dist(graph.nodes[last],graph.nodes[n.id])*4+400),context);
          path={ids,length:0,keys:[],lengths:[],repeated:[]};
          const seen=new Set<string>();
          for(let j=1;j<ids.length;j++) {
            const a=ids[j-1],b=ids[j],d=dist(graph.nodes[a],graph.nodes[b]),k=a<b?`${a}:${b}`:`${b}:${a}`;
            path.length+=d;path.keys.push(k);path.lengths.push(d);path.repeated.push(seen.has(k));seen.add(k);
          }
          cache.set(key,path);
        }
        if(!path.ids.length || prev.length+path.length>maxLength) continue;
        let repeated=0;
        for(let j=0;j<path.keys.length;j++) if(path.repeated[j] || prev.seen.has(path.keys[j])) repeated+=path.lengths[j];
        next.push({prev,path,length:prev.length+path.length,cost:prev.cost+path.length+n.d*1.5+repeated*2,start:prev.start});
      }
    }
    next.sort((a,b)=>a.cost-b.cost);
    beam=[];
    for(const candidate of next) {
      if(beam.some(b=>b.start===candidate.start && b.ids.at(-1)===candidate.path.ids.at(-1))) continue;
      const seen=new Set(candidate.prev.seen);
      for(const key of candidate.path.keys) seen.add(key);
      beam.push({ids:[...candidate.prev.ids,...candidate.path.ids.slice(1)],length:candidate.length,cost:candidate.cost,start:candidate.start,seen});
      if(beam.length===3) break;
    }
    if(!beam.length) return null;
  }
  return beam.find(b=>b.ids.length>3)?.ids||null;
}
function edgeUsage(graph: Graph,ids: number[]): Usage {
  const edges=new Map<string, number>();let repeated=0,total=0;
  for(let i=1;i<ids.length;i++) {
    const a=ids[i-1],b=ids[i],key=a<b?`${a}:${b}`:`${b}:${a}`,length=dist(graph.nodes[a],graph.nodes[b]);
    if(edges.has(key)) repeated+=length;
    edges.set(key,length);total+=length;
  }
  return {edges,repeated,total};
}
function scoreCandidate(target: Point[],loop: Point[],route: Point[],targetMeters: number,usage: Usage): Score {
  // Shared coordinates and scale prevent small, displaced routes from scoring as perfect matches.
  const a=densify(target,64).map(p=>point(p.x/targetMeters,p.y/targetMeters));
  const b=densify(loop,64).map(p=>point(p.x/targetMeters,p.y/targetMeters));
  const contour=clamp01(1-Math.max(directedHausdorff(a,b),directedHausdorff(b,a))/0.09);
  const flow=clamp01(1-discreteFrechet(a,b)/0.12);
  const angles=angleSimilarity(a,b);
  const length=pathLength(route),distanceFit=clamp01(1-Math.abs(length-targetMeters)/(targetMeters*0.25));
  const reuse=usage.repeated/Math.max(length,1);
  const raw=100*clamp01(contour*0.45+flow*0.25+angles*0.20+distanceFit*0.10-reuse*0.20);
  return {raw,total:Math.round(raw),contour:Math.round(contour*100),flow:Math.round(flow*100),
    angles:Math.round(angles*100),distanceFit:Math.round(distanceFit*100),reusePenalty:Math.round(reuse*20),lengthKm:length/1000};
}
function overlap(a: Map<string, number>,b: Map<string, number>): number {
  let common=0,la=0,lb=0;
  for(const [key,length] of a) {la+=length;if(b.has(key)) common+=Math.min(length,b.get(key)!);}
  for(const length of b.values()) lb+=length;
  return common/Math.max(1,Math.min(la,lb));
}
function uniqueCandidates<T extends { score: { raw: number }; usage: { edges: Map<string, number> } }>(candidates: T[],limit=5): T[] {
  const out: T[]=[];
  for(const c of [...candidates].sort((a,b)=>b.score.raw-a.score.raw)) {
    if(out.every(other=>overlap(c.usage.edges,other.usage.edges)<0.80)) out.push(c);
    if(out.length===limit) break;
  }
  return out;
}
function validateCustomTemplate(points: Point[]): Point[] {
  if(!Array.isArray(points)||points.length<4||points.length>49||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>10||Math.abs(p.y)>10)||dist(points[0],points.at(-1)!)>0.00001||pathLength(points)<0.1)throw new Error('사용자 도형의 윤곽이 올바르지 않습니다. 다시 저장해주세요.');
  return points.map(p=>point(p.x,p.y));
}
function roadInfo(graph: Graph,ids: number[]) {
  const crowdWeights: Record<string, number>={pedestrian:75,primary:70,primary_link:70,secondary:65,secondary_link:65,tertiary:55,tertiary_link:55,footway:45,steps:40,service:35,residential:30,living_street:25,unclassified:30,cycleway:25,path:20,track:15};
  let total=0,crowd=0,steps=0;
  for(let i=1;i<ids.length;i++){const link=graph.nodes[ids[i-1]].links.find(l=>l.to===ids[i]);if(!link)continue;const edge=graph.edges[link.id],tags=edge.tags||{};total+=edge.length;crowd+=edge.length*(crowdWeights[tags.highway ?? ""]??40);if(tags.highway==='steps')steps+=edge.length;}
  return {crowd:total?crowd/total:null,stepsKm:steps/1000};
}
// A missing snap rejects this placement regardless of its remaining samples.
// Successful placements retain the original sample order and numeric operations.
function placementError(graph: Graph,target: Point[],start: GraphNode,targetMeters: number,columns: SpatialColumns,free=false): number | null {
  const samples=densify(target,33),near: GraphNode[]=[];
  for(const sample of samples) {
    const node=nearestNode(graph,sample,180,false,columns);
    if(!node) return null;
    near.push(node);
  }
  const approach=free?0:Math.min(...near.map(n=>dist(start,n)));
  if(approach*2>targetMeters*0.35) return null;
  return near.reduce((sum,n,i)=>sum+dist(n,samples[i]),0)/near.length+approach*0.10;
}
function *searchSteps(graph: Graph,options: SearchOptions,progress: ProgressCallback=()=>{},diagnostics?: SearchDiagnostics): Steps<SearchResult> {
  const free=options.mode==='free-loop';
  if(free) {
    // A reversible course cannot contain a pedestrian one-way edge. Keep IDs
    // stable so persisted OSM references and the routing caches remain valid.
    const nodes:GraphNode[]=[];
    for(const n of graph.nodes){if(n.id%128===0)yield;nodes.push({...n,links:n.links.filter(l=>graph.nodes[l.to].links.some(back=>back.to===n.id&&back.id===l.id))});}
    graph={...graph,reachable:undefined,nodes};
  }
  if(diagnostics) Object.assign(diagnostics,{pathRequests:0,pathCacheHits:0,pathSearches:0,pathVisits:0,maxCachedPaths:0,maxCachedNodes:0});
  const routing=routingContext(graph,diagnostics);
  const targetMeters=options.targetKm*1000, radius=options.radiusKm*1000;
  const foundStart=free?{id:-1,x:0,y:0,links:[]}:nearestNode(graph,point(0,0),100);
  if(!foundStart) throw new Error('출발지 100m 안에 연결 가능한 보행 도로가 없습니다. 지도에서 출발 위치를 다시 선택하세요.');
  const start=foundStart;
  const reachable=new Set(free?graph.nodes.filter(n=>n.links.length>0).map(n=>n.id):[start.id]),queue=free?[]:[start.id];
  for(let i=0;i<queue.length;i++) {
    if(i%128===0) yield;
    for(const link of graph.nodes[queue[i]].links)
      if(!reachable.has(link.to)) {reachable.add(link.to);queue.push(link.to);}
  }
  graph.reachable=reachable;
  // Preserve cell/node iteration order while avoiding repeated string keys and
  // reachability/turn filtering for every placement sample.
  const indexes=yield* searchIndexesSteps(graph,reachable);
  routing.turnColumns=indexes.turns;
  const base=options.customTemplate?validateCustomTemplate(options.customTemplate):templateFor(options.shape),scale=targetMeters/pathLength(base);
  const fixed=transformPoints(base,scale,0,0,0), anchors=densify(fixed,33).slice(0,-1);
  const placements: Placement[]=[], keys=new Set<string>();let checked=0;
  function *add(tx: number,ty: number,rotation: number): Steps<void> {
    yield;
    const key=`${Math.round(tx/30)},${Math.round(ty/30)},${Math.round(rotation*180/Math.PI)}`;
    if(keys.has(key)) return; keys.add(key);checked++;
    const target=transformPoints(base,scale,rotation,tx,ty);
    if(target.some(p=>Math.hypot(p.x,p.y)>radius)) return;
    const error=placementError(graph,target,start,targetMeters,indexes.all,free);
    if(error===null) return;
    placements.push({target,rotation,scale,offset:point(tx,ty),error});
  }
  const step=Math.max(250,targetMeters/12),reach=free?radius:Math.min(radius,targetMeters*0.7);
  for(let deg=0;deg<360;deg+=15) {
    const rotation=deg*Math.PI/180,c=Math.cos(rotation),s=Math.sin(rotation);
    if(!free) for(const a of anchors) yield* add(start.x-(a.x*c-a.y*s),start.y-(a.x*s+a.y*c),rotation);
    for(let x=-reach;x<=reach;x+=step) for(let y=-reach;y<=reach;y+=step) yield* add(x,y,rotation);
    progress({phase:'placement',text:`고정 크기 도형 비교 중 · ${deg+15}° / 360° · ${checked.toLocaleString()}개 배치`});
  }
  const coarse=[...placements].sort((a,b)=>a.error-b.error).slice(0,24);
  for(const p of coarse) for(const dx of [-100,0,100]) for(const dy of [-100,0,100]) for(const dr of [-5,0,5])
    yield* add(p.offset.x+dx,p.offset.y+dy,(p.rotation+dr*Math.PI/180+Math.PI*2)%(Math.PI*2));
  placements.sort((a,b)=>a.error-b.error);
  // Keep spatial/angular diversity so one promising neighborhood cannot consume every routing attempt.
  const shortlist: Placement[]=[],buckets=new Map<string, number>();
  for(const p of placements) {
    const key=`${Math.round(p.offset.x/250)},${Math.round(p.offset.y/250)},${Math.floor(p.rotation/(Math.PI/6))}`;
    if((buckets.get(key)||0)>=2) continue;
    shortlist.push(p);buckets.set(key,(buckets.get(key)||0)+1);
    if(shortlist.length>=200) break;
  }
  function *evaluate(p: Placement): Steps<EvaluatedCandidate | null> {
    const loopIds=yield* routeFromTemplateSteps(graph,p.target,targetMeters*1.25,routing);
    if(!loopIds) return null;
    const loop=loopIds.map(id=>graph.nodes[id]),loopLength=pathLength(loop);
    if(free) {
      const usage=edgeUsage(graph,loopIds);
      if(usage.total<targetMeters*0.75 || usage.total>targetMeters*1.25 || usage.repeated/usage.total>0.30) return null;
      return {...p,ids:loopIds,route:loop,usage,access:[],loop,score:scoreCandidate(p.target,loop,loop,targetMeters,usage),loopKm:loopLength/1000,accessKm:0};
    }
    const entries=[...new Set(loopIds.slice(0,-1))].sort((a,b)=>dist(start,graph.nodes[a])-dist(start,graph.nodes[b])).slice(0,6);
    let best: Pick<EvaluatedCandidate, "ids" | "route" | "usage" | "access"> | null=null;
    for(const entry of entries) {
      const budget=targetMeters*1.25-loopLength;
      const outward=yield* shortestPathSteps(graph,start.id,entry,budget,routing);
      if(!outward.length) continue;
      const back=yield* shortestPathSteps(graph,entry,start.id,budget-pathLength(outward.map(id=>graph.nodes[id])),routing);
      if(!back.length) continue;
      const pos=loopIds.indexOf(entry),around=[...loopIds.slice(pos,-1),...loopIds.slice(0,pos+1)];
      const ids=[...outward,...around.slice(1),...back.slice(1)],route=ids.map(id=>graph.nodes[id]);
      const usage=edgeUsage(graph,ids);
      if(usage.total<targetMeters*0.75 || usage.total>targetMeters*1.25 || usage.repeated/usage.total>0.30) continue;
      if(!best || usage.total<best.usage.total) best={ids,route,usage,access:[outward,back].map(path=>path.map(id=>graph.nodes[id]))};
    }
    if(!best) return null;
    const score=scoreCandidate(p.target,loop,best.route,targetMeters,best.usage);
    return {...p,...best,loop,score,loopKm:loopLength/1000,accessKm:Math.max(0,(best.usage.total-loopLength)/1000)};
  }
  const candidates: EvaluatedCandidate[]=[];let routed=0;
  const evaluated=new Set();
  const placementKey=(p: Omit<Placement, "error">)=>`${p.scale.toFixed(4)}:${p.rotation.toFixed(6)}:${p.offset.x.toFixed(2)}:${p.offset.y.toFixed(2)}`;
  function *routeBatch(batch: Placement[],phase: string): Steps<void> {
    for(let i=0;i<batch.length;i++) {
      const p=batch[i],key=placementKey(p);if(evaluated.has(key))continue;evaluated.add(key);routed++;
      progress({phase:'routing',text:`${phase} · ${i+1} / ${batch.length} · 유효 후보 ${candidates.length}개`});
      yield;
      const c=yield* evaluate(p);if(c)candidates.push(c);
    }
  }
  // Always retain the complete v0.1 pool; added exploration cannot lower the best evaluated score.
  yield* routeBatch(shortlist,'기본 경로 탐색');
  const baseline=uniqueCandidates(candidates).map(c=>({score:c.score.total,raw:c.score.raw,lengthKm:c.score.lengthKm}));
  const baselineValid=candidates.length,baselineRouted=routed;
  const version=options.version==='0.1'?'0.1':'0.2';
  if(version==='0.2') {
    function diverse<T extends Placement>(pool: T[],limit: number): T[] {
      const out: T[]=[];
      for(const p of pool) {
        if(out.every(q=>dist(p.offset,q.offset)>150||Math.abs(Math.sin((p.rotation-q.rotation)/2))>0.2))out.push(p);
        if(out.length>=limit)break;
      }
      return out;
    }
    function *variants(seeds: Placement[],factors: number[],moves: number[][],angles: number[]): Steps<Placement[]> {
      const pool: Placement[]=[],seen=new Set<string>();
      for(const seed of seeds)for(const factor of factors)for(const [dx,dy] of moves)for(const angle of angles) {
        yield;
        const nextScale=seed.scale*factor,ratio=nextScale/scale;
        if(ratio<0.85-1e-8||ratio>1.15+1e-8)continue;
        const rotation=(seed.rotation+angle*Math.PI/180+Math.PI*2)%(Math.PI*2);
        const offset=point(seed.offset.x+dx,seed.offset.y+dy),target=transformPoints(base,nextScale,rotation,offset.x,offset.y);
        const p: Placement={target,rotation,scale:nextScale,offset,scaleRatio:ratio,error:0};const key=placementKey(p);
        if(evaluated.has(key)||seen.has(key))continue;seen.add(key);checked++;
        if(target.some(t=>Math.hypot(t.x,t.y)>radius))continue;
        const error=placementError(graph,target,start,targetMeters,indexes.all,free);if(error===null)continue;
        p.error=error;
        pool.push(p);
      }
      pool.sort((a,b)=>a.error-b.error);
      // Reserve opportunities across scale and location instead of routing only one dense cluster.
      const selected=[],buckets=new Map();
      for(const p of pool){const k=`${Math.round(p.scale/scale*25)}:${Math.round(p.offset.x/120)}:${Math.round(p.offset.y/120)}:${Math.floor(p.rotation/(Math.PI/12))}`;if((buckets.get(k)||0)>=2)continue;buckets.set(k,(buckets.get(k)||0)+1);selected.push(p);}
      return selected;
    }
    progress({phase:'refine',text:'크기·위치 추가 탐색을 준비하고 있어요.'});
    const seeds=[...diverse([...candidates].sort((a,b)=>b.score.raw-a.score.raw),8),...diverse(placements,8)];
    const moves=[[0,0],[-120,0],[120,0],[0,-120],[0,120],[-60,-60],[-60,60],[60,-60],[60,60]];
    yield* routeBatch((yield* variants(seeds,[0.88,0.94,1,1.06,1.12],moves,[-5,0,5])).slice(0,140),'크기·위치 추가 탐색');
    const winners=diverse([...candidates].sort((a,b)=>b.score.raw-a.score.raw),8);
    yield* routeBatch((yield* variants(winners,[0.98,1,1.02],[[0,0],[-30,0],[30,0],[0,-30],[0,30]],[-2.5,0,2.5])).slice(0,80),'우수 후보 미세 조정');
  }
  const selected=uniqueCandidates(candidates);
  return {...(free?{mode:'free-loop' as const}:{}),version,baseline:{candidates:baseline,valid:baselineValid,routed:baselineRouted},candidates:selected.map(c=>({...c,...(free?{roadSegments:routeReferences(graph,c.ids)}:{}),scaleRatio:c.scale/scale,templatePerimeter:pathLength(c.target),roadInfo:roadInfo(graph,c.ids),route:c.route.map(({x,y})=>point(x,y)),loop:c.loop.map(({x,y})=>point(x,y)),
    access:c.access.map(path=>path.map(({x,y})=>point(x,y))),ids:undefined,usage:undefined})),
    stats:{placements:checked,routed,extraRouted:routed-baselineRouted,valid:candidates.length,roads:graph.edges.length},
    start:point(start.x,start.y),snapMeters:dist(start,point(0,0)),
    template:{width:Math.max(...fixed.map(p=>p.x))-Math.min(...fixed.map(p=>p.x)),height:Math.max(...fixed.map(p=>p.y))-Math.min(...fixed.map(p=>p.y)),perimeter:targetMeters}};
}

export function routeReferences(graph: Graph,ids: number[]) {
  return ids.slice(1).map((b,i)=>{
    const a=ids[i],link=graph.nodes[a].links.find(l=>l.to===b),edge=link&&graph.edges[link.id];
    if(!edge?.ref) throw new Error('코스의 도로 참조를 확인할 수 없어요.');
    return edge.a===a?{...edge.ref}:{...edge.ref,start:edge.ref.end,end:edge.ref.start};
  });
}

// Synchronous entry points are used by regression tests and small pure operations.
// The app drains the same generators cooperatively through runner.ts.
function finish<T>(steps: Steps<T>): T {
  let next=steps.next();
  while(!next.done) next=steps.next();
  return next.value;
}
function buildGraph(elements: OsmElement[], origin: Origin, radius: number): Graph {
  return finish(buildGraphSteps(elements,origin,radius));
}
function shortestPath(graph: Graph,start: number,end: number,maxLength=Infinity): number[] {
  return finish(shortestPathSteps(graph,start,end,maxLength));
}
function routeFromTemplate(graph: Graph,target: Point[],maxLength: number): number[] | null {
  return finish(routeFromTemplateSteps(graph,target,maxLength));
}
function search(graph: Graph,options: SearchOptions,progress: ProgressCallback=()=>{},diagnostics?: SearchDiagnostics): SearchResult {
  return finish(searchSteps(graph,options,progress,diagnostics));
}
export { validateCustomTemplate, roadInfo, SHAPES, point, dist, densify, heartTemplate,
  templateFor, pathLength, transformPoints, toPoint, toLatLng, runnable, buildGraph,
  nearestNode, shortestPath, routeFromTemplate, scoreCandidate, edgeUsage,
  uniqueCandidates, search, buildGraphSteps, searchSteps };
