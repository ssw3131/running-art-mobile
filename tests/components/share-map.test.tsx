import React from 'react';
import { Text } from 'react-native';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { useShareMap } from '../../src/features/achievements/use-share-map';
const mockImage=jest.fn();
jest.mock('@maplibre/maplibre-react-native',()=>({StaticMapImageManager:{createImage:(...a:any[])=>mockImage(...a)}}));
const data:any={run:{id:'record',distanceM:100},points:[{segment:0,longitude:127,latitude:37},{segment:0,longitude:127.001,latitude:37.001}],course:null};
function Probe({owner}:{owner:string}){const map=useShareMap(data,owner,true,false);return <Text testID="map-state">{JSON.stringify(map)}</Text>;}
const savedFetch=global.fetch,savedKey=process.env.EXPO_PUBLIC_MAPTILER_API_KEY;
beforeEach(()=>{process.env.EXPO_PUBLIC_MAPTILER_API_KEY='test-map-key';mockImage.mockReset();global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({sources:{},layers:[]})});});
afterEach(()=>{global.fetch=savedFetch;if(savedKey===undefined)delete process.env.EXPO_PUBLIC_MAPTILER_API_KEY;else process.env.EXPO_PUBLIC_MAPTILER_API_KEY=savedKey;});
test('a failed static map finishes preparation so the record outline can still be shared',async()=>{
 mockImage.mockRejectedValue(new Error('offline'));
 await render(<Probe owner="owner"/>);
 await waitFor(()=>expect(screen.getByTestId('map-state')).toHaveTextContent(/"pending":false/));
 expect(screen.getByTestId('map-state').props.children).not.toContain('file:');
});
test('a late map for a previous account never becomes the current preview',async()=>{
 let finish!:(value:string)=>void;
 mockImage.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce('file:///new.png');
 const view=await render(<Probe owner="before"/>);
 await waitFor(()=>expect(mockImage).toHaveBeenCalledTimes(1));
 await view.rerender(<Probe owner="after"/>);
 await waitFor(()=>expect(screen.getByTestId('map-state')).toHaveTextContent(/new.png/));
 await act(async()=>finish('file:///old.png'));
 expect(screen.getByTestId('map-state').props.children).not.toContain('old.png');
});
