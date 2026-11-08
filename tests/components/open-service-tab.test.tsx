import { openServiceTab } from '../../src/features/service/open-service-tab';
import { runFinishDestination } from '../../src/modules/running/finish-destination';

const mockNavigate=jest.fn(),mockDismiss=jest.fn();
let mockCanDismiss=false;
jest.mock('expo-router',()=>({router:{
  canDismiss:()=>mockCanDismiss,
  dismissAll:()=>{if(!mockCanDismiss)throw Error('Unhandled POP_TO_TOP');mockDismiss();},
  navigate:(href:unknown)=>mockNavigate(href),
}}));
beforeEach(()=>{mockCanDismiss=false;mockNavigate.mockClear();mockDismiss.mockClear();});

test('ending an unfinished run at the tab root reaches saved courses without an unhandled pop',()=>{
  const destination=runFinishDestination({id:'run',courseOutcome:'stopped'});
  expect(()=>openServiceTab(destination)).not.toThrow();
  expect(mockNavigate).toHaveBeenCalledWith({pathname:'/courses',params:{view:'courses'}});
  expect(mockDismiss).not.toHaveBeenCalled();
});

test('leaving a pushed detail closes it before selecting the running tab with its course',()=>{
  mockCanDismiss=true;
  openServiceTab({pathname:'/run',params:{courseId:'saved-course'}});
  expect(mockDismiss).toHaveBeenCalledTimes(1);
  expect(mockNavigate).toHaveBeenCalledWith({pathname:'/run',params:{courseId:'saved-course'}});
  expect(mockDismiss.mock.invocationCallOrder[0]).toBeLessThan(mockNavigate.mock.invocationCallOrder[0]);
});
