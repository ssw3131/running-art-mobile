import { trackingDriver } from '../../src/modules/running/native-driver';
const mockFeedback=jest.fn();
jest.mock('expo-location',()=>({}));
jest.mock('expo-task-manager',()=>({}));
jest.mock('../../src/modules/guidance/native',()=>({guidanceNative:{feedbackLive:(...args:any[])=>mockFeedback(...args)}}));
test('voice on speaks a turn only; voice off remains silent while off-route vibration is preserved',()=>{
 const event=(id:string,kind:any,text:string,vibrate=false)=>({id,kind,text,vibrate,timestamp:0});
 trackingDriver.feedback!([event('return','returned','돌아왔어요')],true);expect(mockFeedback).not.toHaveBeenCalled();
 trackingDriver.feedback!([event('left','turn','좌회전하세요')],true);expect(mockFeedback).toHaveBeenLastCalledWith('left','좌회전하세요',false);
 trackingDriver.feedback!([event('right','turn','우회전하세요')],false);expect(mockFeedback).toHaveBeenLastCalledWith('right','',false);
 trackingDriver.feedback!([event('off','off-route','벗어났어요',true)],true);expect(mockFeedback).toHaveBeenLastCalledWith('off','',true);
});
