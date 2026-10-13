import React from 'react';
import { act,fireEvent,render,screen } from '@testing-library/react-native';
import ImageShapeEditor from '../../src/features/course-generation/ImageShapeEditor';
import { pickContourImage } from '../../src/modules/image-contour/picker';
jest.mock('../../src/modules/image-contour/picker',()=>({pickContourImage:jest.fn()}));
jest.mock('../../src/features/route-lab/DrawingEditor',()=>({__esModule:true,default:()=>null,DrawingPreview:()=>null}));
function image(){const data=new Uint8Array(32*32*4).fill(255);for(let y=8;y<24;y++)for(let x=8;x<24;x++)data.set([0,0,0,255],(y*32+x)*4);return {width:32,height:32,rgba:data};}
test('UI-IMAGE-01: explicit apply only after extracting one outline; system cancellation preserves previous outline',async()=>{
 const onApply=jest.fn();jest.mocked(pickContourImage).mockResolvedValueOnce(image()).mockResolvedValueOnce(null);
 await render(<ImageShapeEditor onApply={onApply} onCancel={jest.fn()}/>);expect(screen.getByTestId('image-shape-apply')).toBeDisabled();
 await fireEvent.press(screen.getByTestId('image-shape-pick'));expect(screen.getByTestId('image-shape-apply')).toBeEnabled();expect(onApply).not.toHaveBeenCalled();
 await fireEvent.press(screen.getByTestId('image-shape-pick'));expect(screen.getByTestId('image-shape-apply')).toBeEnabled();
 await fireEvent.press(screen.getByTestId('image-shape-apply'));expect(onApply).toHaveBeenCalledTimes(1);const points=onApply.mock.calls[0][0];expect(points.length).toBeGreaterThan(3);
});
test('UI-IMAGE-02: dismissed pending picker cannot apply a late image or duplicate a pick',async()=>{
 let finish!:(value:any)=>void;jest.mocked(pickContourImage).mockImplementation(()=>new Promise(r=>{finish=r;}));const onApply=jest.fn(),onCancel=jest.fn();
 await render(<ImageShapeEditor onApply={onApply} onCancel={onCancel}/>);await fireEvent.press(screen.getByTestId('image-shape-pick'));expect(screen.getByTestId('image-shape-pick')).toBeDisabled();
 await fireEvent.press(screen.getByTestId('image-shape-cancel'));expect(onCancel).toHaveBeenCalledTimes(1);await screen.unmount();await act(async()=>finish(image()));expect(onApply).not.toHaveBeenCalled();
});
