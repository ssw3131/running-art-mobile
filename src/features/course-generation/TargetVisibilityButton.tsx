import { Image } from 'expo-image';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useThemeColors } from '@/theme/ThemeProvider';

export function TargetVisibilityButton({ checked, onChange, testID, style }: {
  checked: boolean; onChange(value: boolean): void; testID: string; style?: StyleProp<ViewStyle>;
}) {
  const c = useThemeColors();
  return <Pressable testID={testID} accessibilityRole="switch" accessibilityLabel="도형 점선 보기"
    accessibilityState={{ checked }} onPress={() => onChange(!checked)}
    style={[{ width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }, style]}>
    <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
      <Image source={checked ? require('../../../assets/generation/figma-20261107-detail/eyeOn.svg') : require('../../../assets/generation/figma-20261107-detail/eyeOff.svg')}
        style={{ width: checked ? 20 : 16, height: checked ? 20 : 16 }} contentFit="contain" accessible={false} />
    </View>
  </Pressable>;
}
