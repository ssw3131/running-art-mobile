import * as Location from 'expo-location';
import { PermissionsAndroid, Platform } from 'react-native';
import { trackingDriver } from '../../src/modules/running/native-driver';
import { RunPermissionError } from '../../src/modules/running/model';

jest.mock('expo-location',()=>({
  getForegroundPermissionsAsync:jest.fn(),requestForegroundPermissionsAsync:jest.fn(),
  getBackgroundPermissionsAsync:jest.fn(),requestBackgroundPermissionsAsync:jest.fn(),
  hasServicesEnabledAsync:async()=>true,
}));
jest.mock('expo-task-manager',()=>({isAvailableAsync:async()=>true}));
jest.mock('../../src/modules/guidance/activity',()=>({guidanceActivity:{active:()=>false}}));
jest.mock('../../src/modules/guidance/native',()=>({guidanceNative:null}));
beforeEach(()=>{
 Object.defineProperty(Platform,'Version',{configurable:true,value:32});
 jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({granted:true,android:{accuracy:'fine'}} as any);
 jest.mocked(Location.getBackgroundPermissionsAsync).mockResolvedValue({granted:true} as any);
 jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({granted:false} as any);
 jest.mocked(Location.requestBackgroundPermissionsAsync).mockResolvedValue({granted:false} as any);
});
test.each(['foreground','precise','background'])('missing %s permission produces a settings prompt error before recording',async kind=>{
 if(kind==='foreground')jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({granted:false} as any);
 if(kind==='precise')jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({granted:true,android:{accuracy:'coarse'}} as any);
 if(kind==='background')jest.mocked(Location.getBackgroundPermissionsAsync).mockResolvedValue({granted:false} as any);
 await expect(trackingDriver.prepare()).rejects.toBeInstanceOf(RunPermissionError);
});
test('granted permissions allow preparation without another permission request',async()=>{
 await expect(trackingDriver.prepare()).resolves.toBeUndefined();
 expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
 expect(Location.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
});

test('missing notification permission still requires settings before starting',async()=>{
 Object.defineProperty(Platform,'Version',{configurable:true,value:33});
 const check=jest.spyOn(PermissionsAndroid,'check').mockResolvedValue(false);
 const request=jest.spyOn(PermissionsAndroid,'request').mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);
 try{await expect(trackingDriver.prepare()).rejects.toBeInstanceOf(RunPermissionError);}
 finally{check.mockRestore();request.mockRestore();}
});
