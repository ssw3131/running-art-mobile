import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { radius, size } from '@/theme/tokens';
import { useThemeColors } from '@/theme/ThemeProvider';
import { AppText } from './AppText';
import { AppModal } from './AppModal';
import { Button } from './Button';
import { Icon } from './Icon';

export type SelectOption = { value: string; label: string; disabled?: boolean };
export function SelectField({ label, value, options, onChange, placeholder = '선택해주세요.', disabled = false, error, testID }: {
  label: string; value: string | null; options: readonly SelectOption[]; onChange(value: string): void;
  placeholder?: string; disabled?: boolean; error?: string; testID?: string;
}) {
  const c = useThemeColors(); const [open, setOpen] = useState(false);
  const triggerRef = useRef<View>(null);
  const selected = options.find(option => option.value === value);
  return <View style={{ gap: 8 }}>
    <AppText variant="label" weight="medium">{label}</AppText>
    <Pressable ref={triggerRef} accessible testID={testID} accessibilityRole="combobox" accessibilityLabel={label} accessibilityValue={{ text: selected?.label ?? placeholder }}
      accessibilityState={{ disabled, expanded: open }} disabled={disabled} onPress={() => setOpen(true)}
      style={({ pressed }) => ({ minHeight: size.field, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: error ? c.danger : c.border,
        borderRadius: radius.field, backgroundColor: c.surface, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: disabled ? 0.45 : pressed ? 0.7 : 1 })}>
      <AppText weight={selected ? 'medium' : 'regular'} style={{ flex: 1, color: selected ? c.text : c.placeholder }}>{selected?.label ?? placeholder}</AppText>
      <Icon name="chevronDown" />
    </Pressable>
    {!!error && <AppText variant="caption" accessibilityLiveRegion="polite" style={{ color: c.danger }}>{error}</AppText>}
    <AppModal visible={open && !disabled} title={label} onClose={() => setOpen(false)} returnFocusRef={triggerRef} footer={<Button compact variant="outline" label="닫기" onPress={() => setOpen(false)} />}>
      {options.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: option.value === value, disabled: !!option.disabled }}
        disabled={option.disabled} onPress={() => { onChange(option.value); setOpen(false); }}
        style={({ pressed }) => ({ width: '100%', minHeight: size.touch, justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 8,
          backgroundColor: option.value === value ? c.navigation : c.surface, borderRadius: radius.field, opacity: option.disabled ? 0.45 : pressed ? 0.7 : 1 })}>
        <AppText weight={option.value === value ? 'bold' : 'regular'} style={{ color: option.value === value ? c.selected : c.text }}>{option.label}</AppText>
      </Pressable>)}
      {options.length === 0 && <AppText variant="caption">선택할 항목이 없습니다.</AppText>}
    </AppModal>
  </View>;
}
