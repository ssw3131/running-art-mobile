import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { routeTrailData } from '@/modules/running/recorded-paths';
import { COURSE_GUIDE_COLOR, RECORDED_TRAIL_COLOR, COURSE_GUIDE_WIDTH, RECORDED_TRAIL_WIDTH } from '@/modules/running/route-colors';

export function RouteTrailLayers({id,route,paths}:{id:string;route:number[][];paths:number[][][]}) {
  // The guidance player appends to its trace arrays in place. A reference-only
  // memo keeps the initial Point forever, even while position/metrics advance.
  const data=routeTrailData(route,paths);
  return <GeoJSONSource id={`${id}-paths`} data={data}>
    <Layer id={`${id}-course-outline`} type="line" filter={['==',['get','role'],'course']} layout={{'line-cap':'round','line-join':'round'}} paint={{'line-color':'#FFFFFF','line-width':COURSE_GUIDE_WIDTH+2}}/>
    <Layer id={`${id}-course-line`} afterId={`${id}-course-outline`} type="line" filter={['==',['get','role'],'course']} layout={{'line-cap':'round','line-join':'round'}} paint={{'line-color':COURSE_GUIDE_COLOR,'line-width':COURSE_GUIDE_WIDTH}}/>
    <Layer id={`${id}-trace-line`} afterId={`${id}-course-line`} type="line" filter={['all',['==',['get','role'],'trace'],['==',['geometry-type'],'LineString']]} layout={{'line-cap':'round','line-join':'round'}} paint={{'line-color':RECORDED_TRAIL_COLOR,'line-width':RECORDED_TRAIL_WIDTH}}/>
    <Layer id={`${id}-trace-point`} afterId={`${id}-trace-line`} type="circle" filter={['all',['==',['get','role'],'trace'],['==',['geometry-type'],'Point']]} paint={{'circle-color':RECORDED_TRAIL_COLOR,'circle-radius':RECORDED_TRAIL_WIDTH/2}}/>
  </GeoJSONSource>;
}
