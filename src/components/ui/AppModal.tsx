import { useCallback, useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { AccessibilityInfo, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, radius, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/ThemeProvider';
import { AppText } from './AppText';
import { Button } from './Button';

export type AppModalProps = {
  visible: boolean; title: string; children: ReactNode; onClose(): void;
  busy?: boolean; dismissOnBackdrop?: boolean; icon?: ReactNode; footer?: ReactNode;
  returnFocusRef?: RefObject<View | null>;
};
export function AppModal({ visible, title, children, onClose, busy = false, dismissOnBackdrop = false, icon, footer, returnFocusRef }: AppModalProps) {
  const c = useThemeColors(); const insets = useSafeAreaInsets(); const titleRef = useRef<Text>(null);
  const opened = useRef(false); const focusReturned = useRef(false);
  const restoreFocus = useCallback(() => {
    if (visible || !opened.current || focusReturned.current || !returnFocusRef?.current) return;
    focusReturned.current = true;
    AccessibilityInfo.sendAccessibilityEvent(returnFocusRef.current, 'focus');
  }, [visible, returnFocusRef]);
  useEffect(() => {
    if (visible) { opened.current = true; focusReturned.current = false; return; }
    // onDismiss is iOS-only. Restore after Android's fade; cancel if reopened/unmounted.
    const timer = setTimeout(restoreFocus, 700);
    return () => clearTimeout(timer);
  }, [visible, restoreFocus]);
  const close = () => { if (!busy) onClose(); };
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={close} onDismiss={restoreFocus}
    onShow={() => { if (titleRef.current) AccessibilityInfo.sendAccessibilityEvent(titleRef.current, 'focus'); }}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.overlay }}>
      <Pressable accessible={false} onPress={dismissOnBackdrop ? close : undefined} style={{ position: 'absolute', inset: 0 }} />
      <View pointerEvents="box-none" style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 24) }}>
        <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 348, alignSelf: 'center', maxHeight: '100%', backgroundColor: c.surface,
          borderRadius: radius.card, paddingHorizontal: 24, paddingVertical: 25, gap: 25,
          boxShadow: '0px 0px 5px rgba(0,0,0,0.15)' }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10, alignItems: 'center' }}>
            {icon}
            <Text ref={titleRef} accessible accessibilityRole="header" style={{ width: '100%', textAlign: 'center', color: c.text, fontFamily: fonts.noto.bold, ...typography.heading, includeFontPadding: false }}>{title}</Text>
            {children}
          </ScrollView>
          {footer}
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

export function ConfirmDialog({ visible, title, description, confirmLabel = '확인', cancelLabel = '취소', busy = false, onConfirm, onCancel, icon, returnFocusRef }: {
  visible: boolean; title: string; description: string; confirmLabel?: string; cancelLabel?: string; busy?: boolean;
  onConfirm(): void; onCancel(): void; icon?: ReactNode;
  returnFocusRef?: RefObject<View | null>;
}) {
  const c = useThemeColors(); const submitted = useRef(false);
  useEffect(() => { if (!visible || !busy) submitted.current = false; }, [visible, busy]);
  const confirm = () => { if (!busy && !submitted.current) { submitted.current = true; onConfirm(); } };
  return <AppModal visible={visible} title={title} onClose={onCancel} busy={busy} icon={icon} returnFocusRef={returnFocusRef}
    footer={<View style={{ flexDirection: 'row', gap: 8, width: 254, maxWidth: '100%', alignSelf: 'center' }}>
      <Button compact variant="outline" label={cancelLabel} disabled={busy} onPress={onCancel} style={{ flex: 1 }} />
      <Button compact label={confirmLabel} loading={busy} onPress={confirm} style={{ flex: 1 }} />
    </View>}>
    <AppText variant="caption" style={{ color: c.subtle, textAlign: 'center' }}>{description}</AppText>
  </AppModal>;
}
