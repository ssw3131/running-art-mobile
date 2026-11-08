import type { Run } from './model.ts';
/** Use the persisted outcome after finish, never the last rendered GPS snapshot. */
export function runFinishDestination(run:Pick<Run,'id'|'courseOutcome'>){
  return run.courseOutcome==='finished'?{pathname:'/run-result' as const,params:{id:run.id}}:{pathname:'/courses' as const,params:{view:'courses'}};
}
