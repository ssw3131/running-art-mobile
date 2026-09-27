importScripts('./route-engine.js');
self.onmessage = ({data}) => {
  try {
    self.postMessage({type:'progress',text:'보행 도로 연결망을 구성하는 중입니다.'});
    const graph=RouteEngine.buildGraph(data.elements,data.origin,data.options.radiusKm*1000);
    if(graph.edges.length<20) throw new Error('이 반경에 보행 가능한 도로 정보가 부족합니다. 출발 위치나 반경을 바꿔주세요.');
    let last=0;
    const result=RouteEngine.search(graph,data.options,p=>{
      if(Date.now()-last>180) {self.postMessage({type:'progress',...p});last=Date.now();}
    });
    self.postMessage({type:'result',result});
  } catch(error) { self.postMessage({type:'error',message:error.message}); }
};
