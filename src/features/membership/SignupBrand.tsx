import { Image } from 'expo-image';
import { View } from 'react-native';

/** Original UI 253:7204: cropped runner and wordmark, not a screenshot. */
export function SignupBrand() {
  return <View accessible accessibilityLabel="RunPen" style={{ alignItems: 'center', alignSelf: 'center', width: 172, height: 106 }}>
    <View style={{ width: 112, height: 50, overflow: 'hidden' }}>
      <Image source={require('../../../assets/signup/brand-runner.png')} style={{ width: 112, height: 56 }} contentFit="fill" accessible={false} />
    </View>
    <View style={{ width: 172, height: 53, overflow: 'hidden' }}>
      <Image source={require('../../../assets/signup/brand-name.png')} style={{ width: 172, height: 57.33, top: -4 }} contentFit="fill" accessible={false} />
    </View>
  </View>;
}
