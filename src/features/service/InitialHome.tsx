import { Image } from 'expo-image';
import { Pressable, ScrollView, View } from 'react-native';
import { AppText } from '@/components/ui';
import type { HomeChallenge } from '@/modules/home/recommendation';
import { useThemeColors } from '@/theme/ThemeProvider';
import { HomeBadgeChallenge } from './HomeBadges';

export const initialShapes = [
 {id:'icecream',name:'아이스크림',source:require('../../../assets/home/first-visit-20261122/icecream.svg'),width:48,height:48},
 {id:'strawberry',name:'딸기',source:require('../../../assets/home/first-visit-20261122/strawberry.svg'),width:48,height:48},
 {id:'fish',name:'물고기',source:require('../../../assets/home/first-visit-20261122/fish.svg'),width:45,height:45},
 {id:'bone',name:'뼈다귀',source:require('../../../assets/home/first-visit-20261122/bone.svg'),width:48,height:48},
 {id:'whale',name:'고래',source:require('../../../assets/home/first-visit-20261122/whale.svg'),width:48,height:48},
] as const;
export type InitialShape=typeof initialShapes[number]['id'];
export function InitialHome({shape,onShape,challenge,onChallenge,onAllShapes}:{shape:InitialShape;onShape(shape:InitialShape):void;challenge:HomeChallenge|null;onChallenge():void;onAllShapes():void}) {
 const c=useThemeColors();
 return <View testID="home-initial" style={{gap:10}}>
  <AppText variant="heading" weight="medium">오늘은 어떤 그림을 달릴까요?</AppText>
  <AppText variant="label" style={{color:c.muted}}>마음에 드는 모양을 골라보세요.{'\n'}익숙한 길이 나만의 러닝 아트가 됩니다.</AppText>
  <View accessible accessibilityLabel="RunPen, 달린 경로로 만드는 나만의 그림" style={{width:'100%',aspectRatio:366/288,overflow:'hidden',borderRadius:15,marginTop:16}}>
   <Image source={require('../../../assets/home/intro.png')} contentFit="fill" accessible={false} style={{position:'absolute',width:'129.23%',height:'109.49%',left:'-4.63%',top:'-3.82%'}}/>
  </View>
  {challenge&&<HomeBadgeChallenge challenge={challenge} onPress={onChallenge} style={{marginTop:18,marginBottom:7}}/>}
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8}}>
   <AppText weight="bold" style={{fontSize:18}}>추천 코스 선택</AppText>
   <Pressable testID="home-all-shapes" accessibilityRole="button" accessibilityLabel="전체보기" onPress={onAllShapes} style={{minHeight:48,flexDirection:'row',gap:4,alignItems:'center'}}><AppText weight="medium" style={{fontSize:16,color:c.subtle}}>전체보기</AppText><Image source={require('../../../assets/ui/chevron-right.svg')} tintColor={c.subtle} contentFit="contain" style={{width:20,height:20}} accessible={false}/></Pressable>
  </View>
  <ScrollView horizontal testID="home-shapes-carousel" showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:11,paddingVertical:2}}>
   {initialShapes.map(asset=><Pressable key={asset.id} testID={`home-shape-${asset.id}`} accessibilityRole="button" accessibilityLabel={asset.name} accessibilityState={{selected:shape===asset.id}} onPress={()=>onShape(asset.id)}
    style={{width:96,minHeight:96,borderRadius:10,borderWidth:2,borderColor:c.background==='#FFFFFF'?'#D9D9D9':c.outline,backgroundColor:c.surface,alignItems:'center',justifyContent:'center',paddingVertical:8,gap:5}}>
    <View style={{width:48,height:48,alignItems:'center',justifyContent:'center'}}><Image source={asset.source} style={{width:asset.width,height:asset.height,...(asset.id==='bone'?{transform:[{scaleX:-1}]}:{})}} accessible={false} contentFit="contain"/></View>
    <AppText weight="bold" style={{fontSize:asset.id==='bone'?16:14,lineHeight:22,color:c.selected,textAlign:'center'}}>{asset.name}</AppText>
   </Pressable>)}
  </ScrollView>
 </View>;
}
