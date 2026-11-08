import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useRecommendationApproach } from '../../src/features/course-generation/use-recommendation-approach';
const mockPermission=jest.fn(),mockFix=jest.fn(),mockPlan=jest.fn();
jest.mock('expo-location',()=>({Accuracy:{High:4},getForegroundPermissionsAsync:(...a:any[])=>mockPermission(...a),getCurrentPositionAsync:(...a:any[])=>mockFix(...a)}));
jest.mock('expo-router',()=>({useFocusEffect:(effect:any)=>require('react').useEffect(effect,[effect])}));
jest.mock('../../src/modules/running/navigation',()=>({planApproach:(...a:any[])=>mockPlan(...a)}));
const grid=require('../../assets/route-lab/grid.json');
const baseline=require('../fixtures/route-engine/grid-heart-v02.json').result;
const result:any={result:{...baseline,candidates:baseline.candidates.slice(0,1)},origin:grid.origin,options:{...grid.options,shape:'heart',targetKm:3},liveRoads:true};
function Probe(){const states=useRecommendationApproach(result,true);return <Text testID="walking">{JSON.stringify(states)}</Text>;}
beforeEach(()=>{mockPermission.mockReset();mockFix.mockReset();mockPlan.mockReset();mockPermission.mockResolvedValue({granted:true});});
test('background walking distance does not opt the user into Google accuracy settings and keeps unavailable GPS explicit',async()=>{
 mockFix.mockRejectedValue(new Error('GPS unavailable'));
 await render(<Probe/>);
 await waitFor(()=>expect(screen.getByTestId('walking')).toHaveTextContent(/error/));
 expect(mockFix).toHaveBeenCalledWith({accuracy:4,mayShowUserSettingsDialog:false});
 expect(mockPlan).not.toHaveBeenCalled();
});
test('walking distance uses the available accurate fix and pedestrian route result',async()=>{
 mockFix.mockResolvedValue({timestamp:Date.now(),coords:{longitude:127,latitude:37,accuracy:5}});
 mockPlan.mockResolvedValue({distanceM:321});
 await render(<Probe/>);
 await waitFor(()=>expect(screen.getByTestId('walking')).toHaveTextContent(/321/));
 expect(mockPlan).toHaveBeenCalledWith(expect.objectContaining({position:[127,37],accuracy:5}),expect.any(AbortSignal));
});
