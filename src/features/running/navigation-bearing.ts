import { bearing, positionAt, prepareRoute, type Coordinate } from '@/modules/guidance/geometry';
import { loopAt } from '@/modules/guidance/loop-engine';
import type { GuidanceState } from '@/modules/guidance/engine';
import type { RunGuidanceCheckpoint } from '@/modules/running/guidance';
/** Forward course tangent, rather than the phone's incidental orientation. */
export function navigationBearing(route:Coordinate[],state:GuidanceState,checkpoint:RunGuidanceCheckpoint):number|undefined{
  if(checkpoint.version===2){
    if(state.returnPath.length>1){const path=prepareRoute(state.returnPath),at=Math.min(path.totalMeters,checkpoint.navigationProgress);return bearing(positionAt(path,at),positionAt(path,Math.min(path.totalMeters,at+15)));}
    if(checkpoint.origin!==null&&checkpoint.direction){const path=loopAt(prepareRoute(route),checkpoint.origin,checkpoint.direction),at=Math.min(path.totalMeters,checkpoint.cursor);return bearing(positionAt(path,at),positionAt(path,Math.min(path.totalMeters,at+15)));}
  }
  const trace=state.trace.at(-1);if(trace&&trace.length>1)return bearing(trace.at(-2)!,trace.at(-1)!);
  return undefined;
}
