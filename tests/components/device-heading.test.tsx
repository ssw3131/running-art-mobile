import React from 'react';
import {AppState,Text} from 'react-native';
import {act,render,screen,waitFor} from '@testing-library/react-native';
import {useDeviceHeading} from '../../src/features/running/use-device-heading';
const mockWatch=jest.fn(),mockRemove=jest.fn();let callback:(v:any)=>void;
jest.mock('expo-router',()=>({useFocusEffect:(f:any)=>require('react').useEffect(f,[f])}));
jest.mock('expo-location',()=>({watchHeadingAsync:(cb:any)=>mockWatch(cb)}));
function Probe(){const value=useDeviceHeading(true);return <Text testID="heading">{value??'none'}</Text>;}
test('heading follows the phone, smooths across north and removes the sensor subscription on exit',async()=>{
 AppState.currentState='active';mockWatch.mockImplementation(async(cb:any)=>{callback=cb;return{remove:mockRemove};});const view=await render(<Probe/>);await waitFor(()=>expect(mockWatch).toHaveBeenCalled());
 await act(()=>callback({accuracy:3,trueHeading:359,magHeading:359}));expect(screen.getByTestId('heading')).toHaveTextContent('359');
 await act(()=>callback({accuracy:3,trueHeading:3,magHeading:3}));const value=Number(screen.getByTestId('heading').props.children);expect(value<5||value>355).toBe(true);
 await act(()=>callback({accuracy:0,trueHeading:180,magHeading:180}));expect(Number(screen.getByTestId('heading').props.children)).toBe(value);
 await view.unmount();expect(mockRemove).toHaveBeenCalledTimes(1);
});
