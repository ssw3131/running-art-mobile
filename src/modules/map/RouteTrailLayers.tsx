import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { useEffect,useMemo,useRef,useState } from 'react';
import { routeTrailData } from '@/modules/running/recorded-paths';
import { COURSE_GUIDE_COLOR, RECORDED_TRAIL_COLOR, COURSE_GUIDE_WIDTH, RECORDED_TRAIL_WIDTH } from '@/modules/running/route-colors';

/** Bound native overlay work while keeping the latest sample, including pause/end. */
function useTrailFrame(paths:number[][][]){
  const signature=JSON.stringify(paths),latest=useRef(signature);
  const [frame,setFrame]=useState({signature,revision:0});
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>{
    latest.current=signature;
    if(signature===frame.signature||timer.current!==null)return;
    // Throttle, not debounce: continuous simulation updates must not postpone drawing.
    timer.current=setTimeout(()=>{timer.current=null;const next=latest.current;setFrame(old=>next===old.signature?old:{signature:next,revision:old.revision+1});},250);
  },[signature,frame.signature]);
  useEffect(()=>()=>{if(timer.current!==null)clearTimeout(timer.current);},[]);
  return frame;
}
export function RouteTrailLayers({id,route,paths}:{id:string;route:number[][];paths:number[][][]}) {
  const course=useMemo(()=>routeTrailData(route,[]),[route]);
  const frame=useTrailFrame(paths),trace=useMemo(()=>routeTrailData([],JSON.parse(frame.signature)),[frame.signature]);
  const traceId=`${id}-recorded-${frame.revision}`;
  return <>
    <GeoJSONSource id={`${id}-paths`} data={course}>
      <Layer id={`${id}-course-outline`} type="line" layout={{'line-cap':'round','line-join':'round'}} paint={{'line-color':'#FFFFFF','line-width':COURSE_GUIDE_WIDTH+2}}/>
      <Layer id={`${id}-course-line`} afterId={`${id}-course-outline`} type="line" layout={{'line-cap':'round','line-join':'round'}} paint={{'line-color':COURSE_GUIDE_COLOR,'line-width':COURSE_GUIDE_WIDTH}}/>
    </GeoJSONSource>
    {/* Rebind only the small trail overlay. Android can retain stale mixed-source
        geometry during live updates; the map, camera and blue course stay mounted. */}
    <GeoJSONSource key={traceId} id={traceId} data={trace}>
      <Layer id={`${traceId}-line`} afterId={`${id}-course-line`} type="line" filter={['==',['geometry-type'],'LineString']} layout={{'line-cap':'round','line-join':'round'}} paint={{'line-color':RECORDED_TRAIL_COLOR,'line-width':RECORDED_TRAIL_WIDTH}}/>
      <Layer id={`${traceId}-point`} afterId={`${traceId}-line`} type="circle" filter={['==',['geometry-type'],'Point']} paint={{'circle-color':RECORDED_TRAIL_COLOR,'circle-radius':RECORDED_TRAIL_WIDTH/2}}/>
    </GeoJSONSource>
  </>;
}
