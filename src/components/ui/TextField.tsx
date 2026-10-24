import { useId, useState, type ReactNode } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';
import { fonts, radius, size, type FontFamily } from '@/theme/tokens';
import { useThemeColors } from '@/theme/ThemeProvider';
import { AppText } from './AppText';

export type TextFieldProps = Omit<TextInputProps, 'value' | 'defaultValue' | 'onChangeText'> & {
  label: string; value: string; onChangeText(value: string): void; error?: string; hint?: string; family?: FontFamily;
  labelContent?: ReactNode; clearable?: boolean;
};
export function TextField({ label, labelContent, clearable = false, value, onChangeText, error, hint, family = 'noto', style, editable = true, onFocus, onBlur, ...props }: TextFieldProps) {
  const c = useThemeColors(); const id = useId(); const [focused, setFocused] = useState(false);
  return <View style={{ gap: labelContent ? 15 : 8 }}>
    <AppText nativeID={id} variant="label" weight="medium">{labelContent ?? label}</AppText>
    <View>
    <TextInput {...props} value={value} onChangeText={onChangeText} editable={editable}
      accessibilityLabel={props.accessibilityLabel ?? label} accessibilityHint={error ?? hint ?? props.accessibilityHint} accessibilityLabelledBy={id}
      accessibilityState={{ disabled: !editable }} placeholderTextColor={c.placeholder} selectionColor={c.selected}
      onFocus={e => { setFocused(true); onFocus?.(e); }} onBlur={e => { setFocused(false); onBlur?.(e); }}
      style={[{ minHeight: size.field, backgroundColor: c.surface, borderWidth: 1, borderColor: error ? c.danger : focused ? c.selected : c.border,
        borderRadius: radius.field, paddingHorizontal: 16, paddingVertical: 12, color: c.text, fontFamily: fonts[family].regular,
        fontSize: 16, includeFontPadding: false, opacity: editable ? 1 : 0.45, textAlignVertical: props.multiline ? 'top' : 'center',
        ...(clearable ? { paddingRight: 52 } : {}) }, style]} />
      {clearable && !!value && <Pressable testID={props.testID ? `${props.testID}-clear` : undefined} accessibilityRole="button" accessibilityLabel={`${label} 지우기`}
        accessibilityState={{ disabled: !editable }} disabled={!editable} onPress={() => onChangeText('')}
        style={{ position: 'absolute', right: 4, top: 4, bottom: 4, width: 48, alignItems: 'center', justifyContent: 'center' }}>
        <AppText style={{ fontSize: 24 }} accessible={false}>×</AppText>
      </Pressable>}
    </View>
    {!!(error || hint) && <AppText variant="caption" accessibilityLiveRegion={error ? 'polite' : 'none'} style={{ color: error ? c.danger : c.subtle }}>{error || hint}</AppText>}
  </View>;
}
