import React from 'react';
import { act,fireEvent,render,screen } from '@testing-library/react-native';
import GuidanceMap from '../../src/features/guidance/GuidanceMap';
const mockJump=jest.fn(),mockEase=jest.fn();
jest.mock('../../src/modules/map/config',()=>({mapStyleUrl:()=>null,themedMapStyle:(v:any)=>v}));
jest.mock('../../src/modules/map/buildings',()=>({hideMapBuildings:async()=>{}}));
jest.mock('@maplibre/maplibre-react-native',()=>{
 const React=require('react'),{View}=require('react-native');
 return {Map:React.forwardRef((props:any,ref:any)=>{React.useImperativeHandle(ref,()=>({}));return <View {...props}/>;}),Camera:React.forwardRef((_props:any,ref:any)=>{React.useImperativeHandle(ref,()=>({jumpTo:(...args:any[])=>mockJump(...args),easeTo:(...args:any[])=>mockEase(...args)}));return null;}),GeoJSONSource:({id,...props}:any)=><View testID={'source-'+id} {...props}/>,Layer:({id,...props}:any)=><View testID={'layer-'+id} {...props}/>};
});
beforeEach(()=>jest.useFakeTimers());
afterEach(()=>jest.useRealTimers());
const trailSource=()=>screen.getByTestId(/^source-guidance-recorded-/);
const trailLine=()=>screen.getByTestId(/^layer-guidance-recorded-\d+-line$/);
const flushTrail=()=>act(async()=>{jest.advanceTimersByTime(250);});
const state:any={position:[127,37],returnPath:[],trace:[[[127,37],[127.001,37]],[[127.002,37],[127.003,37]]],phase:'lap',lapStart:[127,37]};
test('recorded segments keep their GPS gaps and render orange above the blue course guide',async()=>{
 await render(<GuidanceMap route={[[127,37],[127.01,37]]} state={state} followLock heading={90}/>);
 const course=screen.getByTestId('layer-guidance-course-line'),trail=trailLine();
 expect(course.props.paint['line-color']).toBe('#1F6BFF');expect(trail.props.paint['line-color']).toBe('#FC5602');expect(trail.props.paint['line-width']).toBeGreaterThan(course.props.paint['line-width']);expect(trail.props.afterId).toBe(course.props.id??'guidance-course-line');
 expect(trailSource().props.data.features.filter((f:any)=>f.properties.role==='trace').map((f:any)=>f.geometry.coordinates)).toEqual(state.trace);
});
test('locked map cannot drift by a gesture and immediately centers each new position and heading',async()=>{
 const view=await render(<GuidanceMap route={[[127,37],[127.01,37]]} state={state} followLock heading={90}/>);
 const map=screen.getByTestId('guidance-map');expect(map.props.dragPan).toBe(false);expect(map.props.touchRotate).toBe(false);
 await fireEvent(map,'didFinishLoadingStyle');await fireEvent(map,'didFinishLoadingMap');
 await fireEvent(map,'regionWillChange',{nativeEvent:{userInteraction:true}});
 await view.rerender(<GuidanceMap route={[[127,37],[127.01,37]]} state={{...state,position:[127.002,37]}} followLock heading={180}/>);
 expect(mockJump).toHaveBeenLastCalledWith({center:[127.002,37],bearing:180,zoom:16.5});
});

test('a first accepted GPS fix is visible and later traces replace only the overlay',async()=>{
 const view=await render(<GuidanceMap route={[[127,37],[127.01,37]]} state={{...state,trace:[[[127,37]]]}}/>);
 const source=()=>trailSource().props.data.features.filter((f:any)=>f.properties.role==='trace');
 expect(source()[0].geometry.type).toBe('Point');
 expect(screen.getByTestId(/^layer-guidance-recorded-\d+-point$/).props.paint['circle-color']).toBe('#FC5602');
 await view.rerender(<GuidanceMap route={[[127,37],[127.01,37]]} state={state}/>);await flushTrail();
 expect(source().map((f:any)=>f.geometry.coordinates)).toEqual(state.trace);
});

test('pedestrian approach and return guide cannot cover the real orange trail',async()=>{
 await render(<GuidanceMap route={[[127,37],[127.01,37]]} state={{...state,phase:'approach',returnPath:state.trace[0]}}/>);
 expect(screen.getByTestId('layer-guidance-return-line').props.beforeId).toBe('guidance-course-outline');
 expect(trailLine().props.afterId).toBe('guidance-course-line');
});

test('the mounted map paints growing simulation breadcrumbs even when route and trace references stay the same',async()=>{
 const {createRunningSimulation}=require('../../src/modules/running/simulation');
 const {offset}=require('../../src/modules/guidance/geometry');
 const route=[[0,0],[0,240],[240,240],[240,0],[0,0]].map(([x,y])=>offset([127,37],x,y));
 const player=createRunningSimulation(route),initial=player.play(0);
 const view=await render(<GuidanceMap route={route} state={initial}/>);
 const source=()=>trailSource().props.data;
 const previous=JSON.stringify(source());
 const moving=player.update(1000);
 expect(moving.trace).toBe(initial.trace);
 expect(moving.trace.flat().length).toBeGreaterThan(1);
 await view.rerender(<GuidanceMap route={route} state={moving}/>);await flushTrail();
 expect(JSON.stringify(source())).not.toBe(previous);
 expect(source().features.filter((f:any)=>f.properties.role==='trace')[0].geometry.type).toBe('LineString');
 const rendered=source(),frozen=JSON.stringify(rendered),next=player.update(2000);
 expect(JSON.stringify(rendered)).toBe(frozen);
 await view.rerender(<GuidanceMap route={route} state={next}/>);await flushTrail();
 expect(JSON.stringify(source())).not.toBe(frozen);
});

test('continuous updates cannot starve the overlay and the trailing paused sample is kept',async()=>{
 const route=[[127,37],[127.01,37]],trace=[[[127,37]]];
 const view=await render(<GuidanceMap route={route} state={{...state,trace}}/>);
 const first=trailSource().props.data;
 for(let i=1;i<=5;i++){
  trace[0].push([127+i*.0001,37]);
  await view.rerender(<GuidanceMap route={route} state={{...state,trace}}/>);
  await act(async()=>{jest.advanceTimersByTime(100);});
 }
 expect(trailSource().props.data).not.toBe(first);
 await flushTrail();
 expect(trailSource().props.data.features[0].geometry.coordinates).toEqual(trace[0]);
 expect(screen.getByTestId('source-guidance-paths').props.data.features).toHaveLength(1);
 expect(trailLine().props.afterId).toBe('guidance-course-line');
 await view.unmount();await act(async()=>{jest.runOnlyPendingTimers();});
});
