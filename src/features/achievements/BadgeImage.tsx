import { Image } from 'expo-image';
import { View } from 'react-native';
import { badgeImages } from './badge-images';
const large:typeof badgeImages={
 heart:require('../../../assets/achievements/figma-20261108/heart-large.png'),
 'collection-3':require('../../../assets/achievements/figma-20261108/collection-3-large.png'),
 'region-variation':require('../../../assets/achievements/figma-20261108/region-variation-large.png'),
 'distance-50':require('../../../assets/achievements/figma-20261108/distance-50-large.png'),
 'time-5':require('../../../assets/achievements/figma-20261108/time-5-large.png'),
 animals:require('../../../assets/achievements/figma-20261108/animals-large.png'),
 'distance-variation':require('../../../assets/achievements/figma-20261108/distance-variation-large.png'),
};
export function BadgeImage({id,size=80,earned=true,onLoad}:{id:string;size?:number;earned?:boolean;onLoad?():void}){
 const exported=size>=130&&large[id],scale=size/170;
 return <View testID={`badge-image-${id}`} style={{width:size,height:size,...(!earned?{filter:[{grayscale:1}],opacity:.42}:{})}}>
  <Image source={exported||badgeImages[id]} contentFit="contain" accessible={false} onLoad={onLoad} style={exported?{position:'absolute',width:190*scale,height:190*scale,left:-6*scale,top:-6*scale}:{width:size,height:size}}/>
 </View>;
}
