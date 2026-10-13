import { Image, Linking, Pressable, View } from 'react-native';
import { AppText } from '@/components/ui';
export function MapCredits() {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', paddingVertical: 6 }}>
    <Image source={require('../../../assets/images/maptiler-logo.png')} style={{ width: 62, height: 16 }} resizeMode="contain" />
    <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://www.maptiler.com/copyright/').catch(() => {})}><AppText variant="caption">© MapTiler</AppText></Pressable>
    <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://www.openstreetmap.org/copyright').catch(() => {})}><AppText variant="caption">© OpenStreetMap contributors · ODbL</AppText></Pressable>
  </View>;
}
