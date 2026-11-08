import { Camera, GeoJSONSource, Layer, Map, type CameraRef } from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { FeatureCollection, LineString } from 'geojson';
import type { RunPoint } from '@/modules/running/model';
import { mapStyleUrl } from '@/modules/map/config';
import { MapCredits } from '@/features/course-generation/MapCredits';
import type { CourseSnapshot } from '@/modules/courses/model';
import { COURSE_GUIDE_COLOR,RECORDED_TRAIL_COLOR } from '@/modules/running/route-colors';

const offlineStyle = { version: 8 as const, sources: {}, layers: [{ id: 'background', type: 'background' as const, paint: { 'background-color': '#E8EDE7' } }] };
const padding = { top: 30, bottom: 30, left: 30, right: 30 };
export default function RunPath({ points, background = false,course }: { points: RunPoint[]; background?: boolean;course?:CourseSnapshot }) {
  const styleUrl = background ? mapStyleUrl(process.env.EXPO_PUBLIC_MAPTILER_API_KEY) : null;
  const [failed,setFailed]=useState(false),[loaded,setLoaded]=useState(false);
  useEffect(()=>{
    if(!styleUrl||failed||loaded)return;
    const timer=setTimeout(()=>setFailed(true),12000);return()=>clearTimeout(timer);
  },[styleUrl,failed,loaded]);
  const camera = useRef<CameraRef>(null);
  const drawing = useMemo(() => {
    const segments: RunPoint[][] = [];
    for (const point of points) {
      if (!segments.length || segments[segments.length - 1][0].segment !== point.segment) segments.push([]);
      segments[segments.length - 1].push(point);
    }
    const data: FeatureCollection<LineString> = { type: 'FeatureCollection', features: segments.filter(s => s.length > 1).map(segment => {
      // Keep segment endpoints while bounding rendering work. Stored coordinates remain complete.
      const stride = Math.max(1, Math.ceil(points.length / 2000));
      return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: segment.filter((_, i) => i === 0 || i === segment.length - 1 || i % stride === 0).map(p => [p.longitude, p.latitude]) } };
    }) };
    let west = 180, east = -180, south = 90, north = -90;
    for (const p of points) { west = Math.min(west, p.longitude); east = Math.max(east, p.longitude); south = Math.min(south, p.latitude); north = Math.max(north, p.latitude); }
    for(const [lng,lat] of course?.route??[]){west=Math.min(west,lng);east=Math.max(east,lng);south=Math.min(south,lat);north=Math.max(north,lat);}
    return { data, bounds: [west - 0.0002, south - 0.0002, east + 0.0002, north + 0.0002] as [number, number, number, number] };
  }, [points,course]);
  useEffect(() => { if (points.length||course) camera.current?.fitBounds(drawing.bounds, { padding, duration: 0 }); }, [drawing, points.length,course]);
  const last = points[points.length - 1];
  if (!last&&!course) return <View style={{ height: 180, backgroundColor: '#E8EDE7', padding: 24, justifyContent: 'center' }}><Text>GPS 위치를 받으면 이곳에 궤적을 표시해요.</Text></View>;
  return <View style={{ height: background ? course?416:360 : 260, borderRadius: background ? 0 : 16, overflow: 'hidden' }}>
    <Map key={failed?'offline':'background'} style={{ flex: 1 }} mapStyle={!failed&&styleUrl || offlineStyle} attribution={false} logo={false}
      onDidFailLoadingMap={()=>setFailed(true)}
      onDidFinishLoadingMap={() => {setLoaded(true);camera.current?.fitBounds(drawing.bounds, { padding, duration: 0 });}}>
      <Camera ref={camera} initialViewState={{ center: last?[last.longitude,last.latitude]:course!.route[0], zoom: 16 }} />
      {course&&<GeoJSONSource id="record-course" data={{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:course.route}}}><Layer id="record-course-line" type="line" layout={{'line-cap':'round','line-join':'round'}} paint={{'line-color':COURSE_GUIDE_COLOR,'line-width':10,'line-opacity':.7}}/></GeoJSONSource>}
      <GeoJSONSource id="running-track" data={drawing.data}>
        <Layer id="running-line" afterId={course?'record-course-line':undefined} type="line" layout={{'line-cap':'round','line-join':'round'}} paint={{ 'line-color': RECORDED_TRAIL_COLOR, 'line-width': course?6:4 }} />
      </GeoJSONSource>
      {last&&<GeoJSONSource id="running-position" data={{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [last.longitude, last.latitude] } }}>
        <Layer id="running-dot" type="circle" paint={{ 'circle-color': '#2563EB', 'circle-radius': 7, 'circle-stroke-width': 2, 'circle-stroke-color': '#FFFFFF' }} />
      </GeoJSONSource>}
    </Map>
    {!!styleUrl && !failed && <MapCredits/>}
    {failed && <Text style={{padding:6,fontSize:12}}>배경 지도 연결 없이 기록된 경로를 표시합니다.</Text>}
  </View>;
}
