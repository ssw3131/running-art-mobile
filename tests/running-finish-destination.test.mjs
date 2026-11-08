import test from 'node:test';
import assert from 'node:assert/strict';
import { runFinishDestination } from '../src/modules/running/finish-destination.ts';
test('only persisted finished outcomes enter celebration; unfinished and free runs return to saved courses',()=>{
 for(const courseOutcome of ['stopped','active','arrival-pending',null,undefined])assert.deepEqual(runFinishDestination({id:'a',courseOutcome}),{pathname:'/courses',params:{view:'courses'}});
 assert.deepEqual(runFinishDestination({id:'b',courseOutcome:'finished'}),{pathname:'/run-result',params:{id:'b'}});
});
