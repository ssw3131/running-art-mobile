import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { decodeContourPng } from './png';

export async function pickContourImage() {
  const result = await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'], allowsEditing:true, quality:1, exif:false, base64:false});
  if(result.canceled) return null;
  const asset=result.assets[0];
  if(!asset?.width || !asset.height || asset.width*asset.height>64_000_000 || (asset.fileSize??0)>30*1024*1024) throw new Error('64MP·30MB 이하의 이미지를 선택해 주세요.');
  const context=ImageManipulator.manipulate(asset.uri);
  let rendered:Awaited<ReturnType<typeof context.renderAsync>>|undefined;
  let output:File|undefined;
  try {
    const scale=Math.min(1,192/Math.max(asset.width,asset.height));
    context.resize({width:Math.max(1,Math.round(asset.width*scale)),height:Math.max(1,Math.round(asset.height*scale))});
    rendered=await context.renderAsync();
    const saved=await rendered.saveAsync({format:SaveFormat.PNG});
    output=new File(saved.uri);
    return decodeContourPng(await output.bytes());
  } finally {
    try { if(output?.exists) output.delete(); } finally { rendered?.release();context.release(); }
  }
}
