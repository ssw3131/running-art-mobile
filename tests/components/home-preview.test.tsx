import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { HomePreview } from '../../src/features/service/HomePreview';
import { homeThumbnail } from '../../src/features/service/home-thumbnail';
jest.mock('../../src/modules/map/config',()=>({mapStyleUrl:()=> 'https://map.invalid/style.json',themedMapStyle:(url:string)=>url}));
jest.mock('../../src/features/service/home-thumbnail',()=>({homeThumbnail:jest.fn()}));
const paths:[number,number][][]=[[[127,37],[127.01,37.01]]];
beforeEach(()=>jest.mocked(homeThumbnail).mockReset());
test('scrolling cards render images, requesting an offscreen snapshot only when visible',async()=>{
  jest.mocked(homeThumbnail).mockResolvedValue('file:///preview.png');
  const view=await render(<HomePreview paths={paths} active={false} label="경로"/>);
  expect(homeThumbnail).not.toHaveBeenCalled();expect(screen.getByTestId('home-preview-image')).toBeVisible();
  await act(async()=>view.rerender(<HomePreview paths={paths} active label="경로"/>));
  expect(homeThumbnail).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('home-preview-image').props.source[0].uri).toBe('file:///preview.png');
  await view.rerender(<HomePreview paths={paths} active={false} label="경로"/>);
  expect(screen.getByTestId('home-preview-image').props.source[0].uri).toBe('file:///preview.png');
  expect(screen.queryByTestId('home-preview-map')).toBeNull();
});
test('a failed snapshot leaves a local trace image without a live map',async()=>{
  jest.mocked(homeThumbnail).mockRejectedValue(new Error('offline'));
  await act(async()=>render(<HomePreview paths={paths} active label="경로"/>));
  expect(screen.getByTestId('home-preview-image').props.source[0].uri).toMatch(/^data:image\/svg/);
  expect(screen.queryByTestId('home-preview-map')).toBeNull();
});
test('a late previous route snapshot cannot replace the current route',async()=>{
  let resolve!:(value:string)=>void;
  jest.mocked(homeThumbnail).mockImplementationOnce(()=>new Promise(done=>{resolve=done;})).mockResolvedValue('file:///second.png');
  const view=await render(<HomePreview paths={paths} active label="경로"/>);
  await act(async()=>view.rerender(<HomePreview paths={[[[128,38],[128.01,38.01]]]} active label="경로"/>));
  await act(async()=>resolve('file:///old.png'));
  expect(screen.getByTestId('home-preview-image').props.source[0].uri).toBe('file:///second.png');
});
