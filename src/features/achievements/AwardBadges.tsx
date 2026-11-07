import { View } from 'react-native';
import { Image } from 'expo-image';
import { AppText } from '@/components/ui';
import type { Award } from '@/modules/achievements/awards';
import { badgeImages } from './badge-images';
export function AwardBadges({awards}:{awards:Award[]}){
  if(!awards.length)return null;
  return <View testID="achievement-awards" style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>{awards.map(award=><View key={award.id} accessible accessibilityLabel={award.label} style={{width:96,alignItems:'center',gap:6}}>{badgeImages[award.id]&&<Image source={badgeImages[award.id]} style={{width:80,height:80}}/>}<AppText variant="caption" weight="bold" style={{textAlign:'center'}}>{award.label}</AppText></View>)}</View>;
}
