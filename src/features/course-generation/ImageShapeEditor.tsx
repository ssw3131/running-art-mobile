import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AppModal, AppText, Button } from '@/components/ui';
import DrawingEditor, { DrawingPreview } from '@/features/route-lab/DrawingEditor';
import { imageContour, type ContourImage } from '@/modules/image-contour/contour';
import { pickContourImage } from '@/modules/image-contour/picker';
import type { Point } from '@/modules/route-engine/types';

export default function ImageShapeEditor({onApply,onCancel}:{onApply(points:Point[]):void;onCancel():void}) {
  const [image,setImage]=useState<ContourImage|null>(null),[threshold,setThreshold]=useState(50);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[editing,setEditing]=useState(false);
  const request=useRef(0),pending=useRef(false);
  useEffect(()=>()=>{request.current++;},[]);
  const contour=useMemo(()=>{
    if(!image)return {points:null,error:''};
    try{return {points:imageContour(image,threshold),error:''};}
    catch(e){return {points:null,error:e instanceof Error?e.message:'윤곽을 찾지 못했어요.'};}
  },[image,threshold]);
  const pick=async()=>{
    if(pending.current)return;
    pending.current=true;const token=++request.current;setBusy(true);setError('');
    try {const next=await pickContourImage();if(token===request.current && next)setImage(next);}
    catch(e){if(token===request.current)setError(e instanceof Error?e.message:'이미지를 선택하지 못했어요.');}
    finally{pending.current=false;if(token===request.current)setBusy(false);}
  };
  const cancel=()=>{request.current++;onCancel();};
  if(editing && contour.points)return <DrawingEditor initial={contour.points} onApply={onApply} onCancel={()=>setEditing(false)} />;
  return <AppModal visible title="이미지에서 도형 만들기" onClose={cancel} presentation="sheet"
    footer={<View style={{gap:10}}>
      <Button label="이 도형 사용" testID="image-shape-apply" disabled={busy || !contour.points} onPress={()=>{if(contour.points)onApply(contour.points);}} />
      <Button variant="outline" label="취소" testID="image-shape-cancel" onPress={cancel} />
    </View>}>
    <AppText variant="label">단색 배경에 큰 모양 하나가 있는 이미지를 선택해 주세요. 바깥 윤곽만 사용하며 구멍과 내부 선은 제외해요.</AppText>
    <AppText variant="caption">원본 이미지는 기기에서 처리해요. 코스를 생성할 때 추출한 윤곽만 계산 서버로 전달돼요.</AppText>
    <Button variant="outline" label={image?'다른 이미지 선택':'이미지 선택'} testID="image-shape-pick" disabled={busy} onPress={()=>void pick()} />
    {busy && <ActivityIndicator accessibilityLabel="윤곽 분석 중" />}
    {!!(error || contour.error) && <AppText accessibilityRole="alert">{error || contour.error}</AppText>}
    {image && <><AppText variant="label">배경과 구분할 차이</AppText><View style={{flexDirection:'row',gap:8,flexWrap:'wrap'}}>
      {[30,50,90,140].map(n=><Button key={n} compact label={String(n)} variant={threshold===n?'primary':'outline'} onPress={()=>setThreshold(n)} disabled={busy} />)}
    </View></>}
    {contour.points && <><DrawingPreview template={contour.points}/><AppText variant="caption">코스에 사용할 윤곽이에요. 확인 후 적용해 주세요.</AppText>
      <Button variant="outline" label="윤곽 다시 그리기" testID="image-shape-edit" disabled={busy} onPress={()=>setEditing(true)} /></>}
  </AppModal>;
}
