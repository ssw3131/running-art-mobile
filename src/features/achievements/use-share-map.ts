import { useEffect, useState } from 'react';
import { StaticMapImageManager } from '@maplibre/maplibre-react-native';
import type { RunResult } from './use-run-result';
import { mapStyleUrl } from '@/modules/map/config';
import { COURSE_GUIDE_COLOR, RECORDED_TRAIL_COLOR } from '@/modules/running/route-colors';

/** A static image of this record, never an interactive map inside the export canvas. */
export function useShareMap(data:RunResult|null,owner:string,enabled:boolean,portrait:boolean){
 const key=JSON.stringify([owner,data?.run.id,data?.run.distanceM,data?.points.length,portrait]);
 const [state,setState]=useState<{key:string;uri?:string;pending:boolean}>({key:'',pending:false});
 useEffect(()=>{
  const styleUrl=mapStyleUrl(process.env.EXPO_PUBLIC_MAPTILER_API_KEY);
  if(!enabled||!data||!styleUrl)return;
  let active=true;const controller=new AbortController();
  const timer=setTimeout(()=>{controller.abort();if(active)setState({key,pending:false});},12000);
  void(async()=>{
   const response=await fetch(styleUrl,{signal:controller.signal});if(!response.ok)throw new Error('Map unavailable');
   const base=await response.json();
   const segments:number[][][]=[];let previousSegment:number|undefined;
   for(const point of data.points){if(previousSegment!==point.segment){segments.push([]);previousSegment=point.segment;}segments[segments.length-1].push([point.longitude,point.latitude]);}
   const stride=Math.max(1,Math.ceil(data.points.length/2000));
   const features=[...(data.course?[{type:'Feature',properties:{color:COURSE_GUIDE_COLOR},geometry:{type:'LineString',coordinates:data.course.snapshot.route}}]:[]),...segments.filter(s=>s.length>1).map(coordinates=>({type:'Feature',properties:{color:RECORDED_TRAIL_COLOR},geometry:{type:'LineString',coordinates:coordinates.filter((_,i)=>i===0||i===coordinates.length-1||i%stride===0)}}))];
   const points=features.flatMap(f=>f.geometry.coordinates);if(!points.length)throw new Error('No route');
   let west=180,east=-180,south=90,north=-90;for(const [x,y]of points){west=Math.min(west,x);east=Math.max(east,x);south=Math.min(south,y);north=Math.max(north,y);}
   const dx=Math.max(.0001,east-west)*.12,dy=Math.max(.0001,north-south)*.12;
   const uri=await StaticMapImageManager.createImage({mapStyle:{...base,sources:{...base.sources,shareTrace:{type:'geojson',data:{type:'FeatureCollection',features}}},layers:[...base.layers,{id:'share-trace-border',source:'shareTrace',type:'line',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'white','line-width':9}},{id:'share-trace',source:'shareTrace',type:'line',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['get','color'],'line-width':6}}]},bounds:[west-dx,south-dy,east+dx,north+dy],width:972,height:portrait?864:480,output:'file',logo:false});
   if(active&&!controller.signal.aborted)setState({key,uri,pending:false});
  })().catch(()=>{if(active)setState({key,pending:false});}).finally(()=>clearTimeout(timer));
  return()=>{active=false;controller.abort();clearTimeout(timer);};
 },[key,enabled,data,portrait]);
 return state.key===key?state:{key,pending:!!enabled&&!!mapStyleUrl(process.env.EXPO_PUBLIC_MAPTILER_API_KEY)};
}
