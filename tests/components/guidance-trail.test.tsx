import React from 'react';
import { fireEvent,render,screen } from '@testing-library/react-native';
import GuidanceMap from '../../src/features/guidance/GuidanceMap';
const mockJump=jest.fn(),mockEase=jest.fn();
jest.mock('../../src/modules/map/config',()=>({mapStyleUrl:()=>null,themedMapStyle:(v:any)=>v}));
jest.mock('../../src/modules/map/buildings',()=>({hideMapBuildings:async()=>{}}));
jest.mock('@maplibre/maplibre-react-native',()=>{
 const React=require('react'),{View}=require('react-native');
 return {Map:React.forwardRef((props:any,ref:any)=>{React.useImperativeHandle(ref,()=>({}));return <View {...props}/>;}),Camera:React.forwardRef((_props:any,ref:any)=>{React.useImperativeHandle(ref,()=>({jumpTo:(...args:any[])=>mockJump(...args),easeTo:(...args:any[])=>mockEase(...args)}));return null;}),GeoJSONSource:({id,...props}:any)=><View testID={'source-'+id} {...props}/>,Layer:({id,...props}:any)=><View testID={'layer-'+id} {...props}/>};
});
const state:any={position:[127,37],returnPath:[],trace:[[[127,37],[127.001,37]],[[127.002,37],[127.003,37]]],phase:'lap',lapStart:[127,37]};
test('recorded segments keep their GPS gaps and render blue above the separate red course guide',async()=>{
 await render(<GuidanceMap route={[[127,37],[127.01,37]]} state={state} followLock heading={90}/>);
 const course=screen.getByTestId('layer-guidance-course-line'),trail=screen.getByTestId('layer-guidance-trace-line');
 expect(course.props.paint['line-color']).not.toBe(trail.props.paint['line-color']);expect(trail.props.afterId).toBe(course.props.id??'guidance-course-line');
 expect(screen.getByTestId('source-guidance-trace').props.data.features.map((f:any)=>f.geometry.coordinates)).toEqual(state.trace);
});
test('locked map cannot drift by a gesture and immediately centers each new position and heading',async()=>{
 const view=await render(<GuidanceMap route={[[127,37],[127.01,37]]} state={state} followLock heading={90}/>);
 const map=screen.getByTestId('guidance-map');expect(map.props.dragPan).toBe(false);expect(map.props.touchRotate).toBe(false);
 await fireEvent(map,'didFinishLoadingStyle');await fireEvent(map,'didFinishLoadingMap');
 await fireEvent(map,'regionWillChange',{nativeEvent:{userInteraction:true}});
 await view.rerender(<GuidanceMap route={[[127,37],[127.01,37]]} state={{...state,position:[127.002,37]}} followLock heading={180}/>);
 expect(mockJump).toHaveBeenLastCalledWith({center:[127.002,37],bearing:180,zoom:16.5});
});
