import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image as NativeImage, Pressable, ScrollView, Switch, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import { AppText, Button, SelectField } from '@/components/ui';
import { useAuth } from '@/features/auth/use-auth';
import { authentication } from '@/modules/auth/runtime';
import { useRunResult } from '@/features/achievements/use-run-result';
import { ShareCard } from '@/features/achievements/ShareCard';
import { cardContent, cardSize, defaultCardOptions } from '@/modules/achievements/card';
import { retainCard, saveCardFile, shareCardFile } from '@/modules/achievements/image-file';
import { openServiceTab } from '@/features/service/open-service-tab';
import RunSharePanel from '@/features/running/RunSharePanel';
import { useThemeColors } from '@/theme/ThemeProvider';

export default function RunCardScreen() {
  const params = useLocalSearchParams<{ id: string }>(), id = typeof params.id === 'string' ? params.id : '';
  const auth = useAuth(), owner = auth.account?.id ?? '', { data, error, retry } = useRunResult(id);
  const colors = useThemeColors(), window = useWindowDimensions();
  const [options, setOptions] = useState({...defaultCardOptions,format:'card' as 'story'|'feed'|'card'}), [readyKey, setReadyKey] = useState('');
  const [canvasAttempt, setCanvasAttempt] = useState(0), [assetError, setAssetError] = useState(false);
  const [image, setImage] = useState<{ key: string; uri: string } | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const canvas = useRef<View>(null), working = useRef(false), alive = useRef(true);
  const content = useMemo(() => data ? cardContent(data.run, data.course?.snapshot ?? null, data.points, auth.account?.name ?? '러너', options) : null, [data, auth.account?.name, options]);
  const key = JSON.stringify([owner, id, options, content]);
  const currentKey = useRef(key);
  useLayoutEffect(() => { currentKey.current = key; }, [key]);
  useFocusEffect(useCallback(() => { alive.current = true; return () => { alive.current = false; }; }, []));
  const uri = image?.key === key ? image.uri : null;
  const width = Math.min(window.width - 48, 360), height = cardSize(options.format).height / 3;
  async function act(action: 'preview' | 'save' | 'share') {
    if (working.current || !content) return;
    const request = key;
    const check = () => { if (!alive.current || currentKey.current !== request || (authentication.getSnapshot().account?.id ?? '') !== owner) throw new Error('Cancelled image operation'); };
    working.current = true; setBusy(true); setMessage('');
    let capture: string | undefined;
    try {
      check();
      let readyUri=uri;
      if (!readyUri) {
        if (readyKey !== key) throw new Error('Images not ready');
        const size = cardSize(options.format);
        capture = await captureRef(canvas, { format: 'png', result: 'tmpfile', width: size.width, height: size.height, quality: 1 });
        check();
        const measured = await NativeImage.getSize(capture);
        if (measured.width !== size.width || measured.height !== size.height) throw new Error('Unexpected image size');
        const retained = await retainCard(capture); check();
        readyUri=retained;setImage({ key: request, uri: retained }); setMessage(`${size.width} × ${size.height} PNG 미리보기예요. 이 파일을 저장·공유합니다.`);
      }
      if(action!=='preview'){
        if(!readyUri)throw new Error('Preview missing');
        if (action === 'save') {
          const result = await saveCardFile(readyUri, check); check();
          setMessage(result === 'saved' ? '선택한 폴더에 이미지를 저장했어요.' : '저장을 취소했어요. 미리보기는 유지됩니다.');
        } else {
          await shareCardFile(readyUri, check); check();
          setMessage('공유 창을 닫았어요. 전달 여부는 선택한 앱에서 확인해 주세요.');
        }
      }
    } catch { if (alive.current && currentKey.current === request) setMessage('이미지를 처리하지 못했어요. 저장 공간과 공유할 앱을 확인하고 다시 시도해 주세요.'); }
    finally { if (capture) releaseCapture(capture); working.current = false; if (alive.current) setBusy(false); }
  }
  return <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 24, gap: 18, alignItems: 'stretch', maxWidth: 600, width: '100%', alignSelf: 'center', paddingBottom: 48 }}>
    <Stack.Screen options={{ title: '공유하기' }} />
    {!data && !error && <ActivityIndicator color={colors.action} accessibilityLabel="카드 기록 확인 중" />}
    {!!error && <><AppText accessibilityRole="alert">{error}</AppText><Button label="다시 불러오기" onPress={retry} /></>}
    {content && <>
      {uri ? <Image testID="card-png-preview" source={{ uri }} style={{ width, height: height * width / 360, alignSelf: 'center', borderRadius: 20 }} contentFit="contain" />
        : <View style={{ width, height: height * width / 360, alignSelf: 'center', overflow: 'hidden', borderRadius: 20 }}>
          <View style={{ width: 360, height, transformOrigin: 'top left', transform: [{ scale: width / 360 }] }}>
            <ShareCard key={`${key}:${canvasAttempt}`} content={content} format={options.format} canvasRef={canvas} onReady={() => { setReadyKey(key); setAssetError(false); }} onError={() => { setReadyKey(''); setAssetError(true); setMessage('카드 이미지를 불러오지 못했어요. 다시 시도해 주세요.'); }} />
          </View>
        </View>}
      {!!message && <AppText testID="card-message" accessibilityRole="alert" variant="label">{message}</AppText>}
      {!uri && assetError && <Button label="카드 이미지 다시 불러오기" variant="outline" onPress={() => { setReadyKey(''); setAssetError(false); setMessage(''); setCanvasAttempt(value => value + 1); }} />}
      <View style={{padding:20,borderRadius:20,gap:16,backgroundColor:colors.surface,boxShadow:'0px 0px 5px rgba(0,0,0,0.2)'}}>
        <View style={{flexDirection:'row',gap:10}}><Image source={require('../../assets/achievements/sharing/image.svg')} style={{width:40,height:40}}/><View style={{flex:1,gap:3}}><AppText weight="bold" style={{fontSize:16}}>이미지로 공유</AppText><AppText style={{fontSize:12,lineHeight:18,color:colors.muted}}>완주 기록 이미지를 공유하거나 저장해요.</AppText></View></View>
        <View style={{flexDirection:'row',gap:8}}>{[{label:'Instagram',id:'card-share',asset:require('../../assets/achievements/sharing/instagram.png'),action:'share'},{label:'Story',id:'card-story',asset:require('../../assets/achievements/sharing/story.png'),action:'share'},{label:'저장',id:'card-save',asset:require('../../assets/achievements/sharing/save.png'),action:'save'}].map(item=><Pressable key={item.id} testID={item.id} accessibilityRole="button" accessibilityLabel={item.label} disabled={busy||(!uri&&readyKey!==key)} onPress={()=>void act(item.action as 'share'|'save')} style={{flex:1,minHeight:97,borderWidth:1,borderColor:colors.border,borderRadius:10,alignItems:'center',justifyContent:'center',gap:7,opacity:busy?.45:1}}><Image source={item.asset} style={{width:50,height:50}}/><AppText style={{fontSize:12,lineHeight:18}}>{item.label}</AppText></Pressable>)}</View>
        <AppText style={{fontSize:11,lineHeight:16,color:colors.muted}}>공유 창에서 Instagram 또는 Story를 선택해 주세요.</AppText>
      </View>
      <RunSharePanel card id={id} disabled={busy} onBusy={setBusy}/>
      <View style={{gap:12}}>
      <SelectField label="이미지 비율" testID="card-format" value={options.format} disabled={busy} options={[{value:'card',label:'기록 카드 · 1080×903'},{ value: 'story', label: '스토리 9:16 · 1080×1920' }, { value: 'feed', label: '피드 4:5 · 1080×1350' }]}
        onChange={value => { setOptions(previous => ({ ...previous, format: value as 'story' | 'feed' | 'card' })); setMessage(''); }} />
      {(['nickname', 'date'] as const).map(option => <View key={option} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <AppText style={{ flex: 1 }}>{option === 'nickname' ? '닉네임 표시' : '러닝 날짜 표시'}</AppText>
        <Switch testID={`card-${option}`} accessibilityLabel={option === 'nickname' ? '닉네임 표시' : '러닝 날짜 표시'} value={options[option]} disabled={busy} trackColor={{ false: colors.border, true: '#FFBF9B' }} thumbColor={options[option] ? colors.action : colors.muted}
          onValueChange={value => { setOptions(previous => ({ ...previous, [option]: value })); setMessage(''); }} />
      </View>)}
      <AppText variant="caption" style={{ color: colors.muted }}>지도·주소·좌표 숫자는 포함하지 않아요. 이미지로 전달한 정보는 링크 공유 중단으로 회수할 수 없어요.</AppText>
      </View>
      <Button label="PNG 미리보기 만들기" testID="card-preview" loading={busy} disabled={readyKey!==key||!!uri} onPress={()=>void act('preview')}/>
      {uri&&<Button label="미리보기 다시 만들기" variant="outline" disabled={busy} onPress={()=>{setImage(null);setReadyKey('');setMessage('');}}/>}
      <Button label="홈으로" variant="outline" onPress={()=>openServiceTab('/')}/>

    </>}
  </ScrollView>;
}
