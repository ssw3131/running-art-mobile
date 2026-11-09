import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Image as NativeImage, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import { useAuth } from '@/features/auth/use-auth';
import { authentication } from '@/modules/auth/runtime';
import { useRunResult } from '@/features/achievements/use-run-result';
import { SharingPlatformView } from '@/features/achievements/SharingPlatformView';
import { useShareMap } from '@/features/achievements/use-share-map';
import { usePointAddress } from '@/features/course-generation/use-point-address';
import { useProfilePhoto } from '@/features/account/use-profile-photo';
import { estimatedRunningKcal } from '@/modules/running/calories';
import { ShareCard } from '@/features/achievements/ShareCard';
import { cardContent, cardSize, defaultCardOptions } from '@/modules/achievements/card';
import { retainCard, saveCardFile, shareCardFile } from '@/modules/achievements/image-file';

export default function RunCardScreen() {
  const params = useLocalSearchParams<{ id: string }>(), id = typeof params.id === 'string' ? params.id : '';
  const auth = useAuth(), owner = auth.account?.id ?? '', { data, error, retry } = useRunResult(id);
  const [platform,setPlatform]=useState<'instagram'|'story'|'link'|'save'>('instagram');
  const [savedFormat,setSavedFormat]=useState<'square'|'story'>('square');
  const [options, setOptions] = useState({...defaultCardOptions,format:'square' as 'square'|'story'}), [readyKey, setReadyKey] = useState('');
  const [canvasAttempt, setCanvasAttempt] = useState(0), [assetError, setAssetError] = useState(false);
  const [image, setImage] = useState<{ key: string; uri: string } | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const canvas = useRef<View>(null), working = useRef(false), alive = useRef(true);
  const map=useShareMap(data,owner,true,options.format==='story');
  const address=usePointAddress(data?.course?.snapshot.origin);
  const uploaded=useProfilePhoto(auth.account?.id,auth.account?.picture==='uploaded'?auth.account?.photoPath:null);
  const avatar=auth.account?.picture==='provider'?auth.account.avatarUrl:uploaded;
  const kcal=data?estimatedRunningKcal(data.run.distanceM,data.weightKg):null;
  const content = useMemo(() => data ? cardContent(data.run, data.course?.snapshot ?? null, data.points, auth.account?.name ?? 'Runner', options,{mapUri:map.uri,avatarUri:avatar??undefined,address:address.address||undefined,calories:kcal===null?'— kcal':`${kcal} kcal`,mapCredits:!!map.uri,compactHeader:platform==='save'&&options.format==='story'}) : null, [data, auth.account?.name, options,map.uri,avatar,address.address,kcal,platform]);
  const key = JSON.stringify([owner, id, options, content]);
  const canvasKey = `${key}:${canvasAttempt}`;
  const currentCanvasKey = useRef(canvasKey);
  const currentKey = useRef(key);
  useLayoutEffect(() => { currentKey.current = key; currentCanvasKey.current = canvasKey; }, [key, canvasKey]);
  useFocusEffect(useCallback(() => { alive.current = true; if (!working.current) setBusy(false); return () => { alive.current = false; }; }, []));
  const uri = image?.key === key ? image.uri : null;
  const imageReady = !map.pending && (!!uri || readyKey === canvasKey);
  const imageLocked = busy || !imageReady;
  function reloadCard() { setImage(null); setReadyKey(''); setAssetError(false); setMessage(''); setCanvasAttempt(value => value + 1); }
  async function act(action: 'preview' | 'save' | 'share') {
    if (working.current || !content) return;
    const request = key;
    const check = () => { if (!alive.current || currentKey.current !== request || (authentication.getSnapshot().account?.id ?? '') !== owner) throw new Error('Cancelled image operation'); };
    working.current = true; setBusy(true); setMessage('');
    let capture: string | undefined;
    let stage: 'capture' | 'save' | 'share' = 'capture';
    try {
      check();
      let readyUri=uri;
      if (!readyUri) {
        if (readyKey !== canvasKey) throw new Error('Images not ready');
        // onDisplay confirms decoded pixels; allow the native view to finish drawing.
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        check();
        const size = cardSize(options.format);
        capture = await captureRef(canvas, { format: 'png', result: 'tmpfile', width: size.width, height: size.height, quality: 1 });
        check();
        const measured = await NativeImage.getSize(capture);
        if (measured.width !== size.width || measured.height !== size.height) throw new Error('Unexpected image size');
        const retained = await retainCard(capture); check();
        readyUri=retained;setImage({ key: request, uri: retained }); setMessage('공유할 이미지가 준비됐어요.');
      }
      if(action!=='preview'){
        if(!readyUri)throw new Error('Preview missing');
        if (action === 'save') {
          stage = 'save';
          const result = await saveCardFile(readyUri, check); check();
          setMessage(result === 'saved' ? '선택한 폴더에 이미지를 저장했어요.' : '저장을 취소했어요. 미리보기는 유지됩니다.');
        } else {
          stage = 'share';
          await shareCardFile(readyUri, check); check();
          setMessage('공유 창을 닫았어요. 전달 여부는 선택한 앱에서 확인해 주세요.');
        }
      }
    } catch { if (alive.current && currentKey.current === request) setMessage(stage === 'capture' ? '카드 이미지를 만들지 못했어요. 다시 시도해 주세요.' : stage === 'save' ? '이미지를 저장하지 못했어요. 저장할 폴더와 남은 공간을 확인해 주세요.' : '공유 창을 열지 못했어요. 공유할 앱이 설치되어 있는지 확인하고 다시 시도해 주세요.'); }
    finally { if (capture) releaseCapture(capture); working.current = false; if (alive.current) setBusy(false); }
  }
  const choose=(value:typeof platform)=>{if(busy)return;setPlatform(value);setOptions(previous=>({...previous,format:value==='story'?'story':value==='save'?savedFormat:'square'}));setMessage('');};
  return <SharingPlatformView id={id} platform={platform} choose={choose} format={options.format}
    setFormat={format=>{setSavedFormat(format);setOptions(previous=>({...previous,format}));setMessage('');}}
    busy={busy} data={data} content={content} error={error} retry={retry} uri={uri} imageReady={imageReady} imageLocked={imageLocked}
    assetError={assetError} message={message} reload={reloadCard} onBusy={setBusy} onAction={()=>void act(platform==='save'?'save':'share')}
    canvas={<ShareCard key={canvasKey} content={content!} format={options.format} canvasRef={canvas}
      onReady={()=>{if(currentCanvasKey.current===canvasKey){setReadyKey(canvasKey);setAssetError(false);}}}
      onError={()=>{if(currentCanvasKey.current===canvasKey){setReadyKey('');setAssetError(true);}}}/>}/>;
}
