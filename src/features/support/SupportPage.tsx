import { Stack } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TextField, type TextFieldProps } from '@/components/ui/TextField';
import { useThemeColors } from '@/theme/ThemeProvider';

const InputVisibility = createContext<{
  focus(input: TextInput | null): void;
  blur(input: TextInput | null): void;
  height: number;
} | null>(null);

export function SupportTextField(props: TextFieldProps) {
  const visibility = useContext(InputVisibility), input = useRef<TextInput>(null);
  const blur = visibility?.blur;
  useEffect(() => {
    const node = input.current;
    return () => blur?.(node);
  }, [blur]);
  return <TextField {...props} inputRef={input}
    onFocus={event => { visibility?.focus(input.current); props.onFocus?.(event); }}
    onBlur={event => { blur?.(input.current); props.onBlur?.(event); }}
    style={[props.style, props.multiline && { minHeight: visibility?.height ?? 180, maxHeight: visibility?.height ?? 180 }]} />;
}

export function SupportPage({ title, children, footer }: PropsWithChildren<{ title: string; footer?: ReactNode }>) {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null), focused = useRef<TextInput | null>(null);
  const scrollY = useRef(0), keyboardTop = useRef<number | null>(null), frame = useRef<number | null>(null);
  const [bottomInset, setBottomInset] = useState(0), [inputHeight, setInputHeight] = useState(180);
  const revealInput = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const input = focused.current, top = keyboardTop.current ?? Keyboard.metrics()?.screenY;
      if (!input?.isFocused() || top === undefined) return;
      const current = () => focused.current === input && input.isFocused() && (keyboardTop.current ?? Keyboard.metrics()?.screenY) === top;
      // Measure after resize/layout. Padding covers only the part still hidden by
      // the IME; adjustResize devices already have a shorter scroll viewport.
      scroll.current?.getNativeScrollRef()?.measureInWindow((_x, y, _width, height) => {
        if (!current()) return;
        const bottom = Math.min(y + height, top);
        setBottomInset(Math.max(0, y + height - top));
        setInputHeight(Math.min(180, Math.max(48, bottom - y - 32)));
        input.measureInWindow((_inputX, inputY, _inputWidth, inputSize) => {
          if (!current()) return;
          const delta = inputY < y + 16 ? inputY - y - 16 : Math.max(0, inputY + inputSize + 16 - bottom);
          if (delta) scroll.current?.scrollTo({ y: Math.max(0, scrollY.current + delta), animated: false });
        });
      });
    });
  }, []);
  const focus = useCallback((input: TextInput | null) => { focused.current = input; revealInput(); }, [revealInput]);
  const blur = useCallback((input: TextInput | null) => { if (focused.current === input) focused.current = null; }, []);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', event => { keyboardTop.current = event.endCoordinates.screenY; revealInput(); });
    const hidden = Keyboard.addListener('keyboardDidHide', () => { keyboardTop.current = null; setBottomInset(0); setInputHeight(180); });
    return () => { shown.remove(); hidden.remove(); focused.current = null; if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, [revealInput]);
  const visibility = useMemo(() => ({ focus, blur, height: inputHeight }), [focus, blur, inputHeight]);
  return <InputVisibility.Provider value={visibility}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.background }}>
    <Stack.Screen options={{ title }} />
    <ScrollView ref={scroll} testID="support-scroll" keyboardShouldPersistTaps="handled" onLayout={revealInput} onContentSizeChange={revealInput}
      onScroll={event => { scrollY.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}
      contentContainerStyle={{ padding: 24, paddingBottom: 40 + bottomInset, gap: 20, width: '100%', maxWidth: 680, alignSelf: 'center' }}>{children}</ScrollView>
    {footer && <View style={{ padding: 16, paddingBottom: Math.max(16, insets.bottom), borderTopWidth: 1, borderColor: c.divider, width: '100%', maxWidth: 680, alignSelf: 'center' }}>{footer}</View>}
  </KeyboardAvoidingView></InputVisibility.Provider>;
}
