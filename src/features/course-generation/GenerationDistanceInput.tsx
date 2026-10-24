import { Image } from 'expo-image';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { PanResponder, Pressable, View } from 'react-native';
import { AppModal, AppText, Button, TextField } from '@/components/ui';
import { GENERATION_DISTANCES, MAX_GENERATION_DISTANCE } from '@/modules/route-engine/service-shapes';
import { useThemeColors } from '@/theme/ThemeProvider';

/** The slider is interactive geometry; the tick marks use the original Figma asset. */
export function GenerationDistanceInput({ value, onChange }: { value: number; onChange(value: number): void }) {
  const c = useThemeColors();
  const [open, setOpen] = useState(false), [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  useFocusEffect(useCallback(() => () => setOpen(false), []));
  const width = useRef(300), touchStart = useRef(0);
  const change = useRef(onChange);
  useLayoutEffect(() => { change.current = onChange; }, [onChange]);
  const moreButton = useRef<View>(null);
  // Native responder construction only registers callbacks; refs are read on gesture events.
  // Keep this resource stable even when the parent's onChange closure is replaced.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() => {
    const select = (x: number) => change.current(Math.max(1, Math.min(10, Math.round(x / width.current * 9) + 1)));
    let direction: 'pending' | 'horizontal' | 'vertical' = 'pending';
    return PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 6 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    // A touch can become a vertical page scroll. Do not change the distance
    // until it is a horizontal drag or a released tap.
    onPanResponderGrant: event => { touchStart.current = event.nativeEvent.locationX; direction = 'pending'; },
    onPanResponderMove: (_event, gesture) => {
      if (direction === 'pending' && Math.max(Math.abs(gesture.dx), Math.abs(gesture.dy)) > 6) {
        direction = Math.abs(gesture.dx) > Math.abs(gesture.dy) ? 'horizontal' : 'vertical';
      }
      if (direction === 'horizontal') select(touchStart.current + gesture.dx);
    },
    onPanResponderRelease: (_event, gesture) => {
      if (direction === 'horizontal') select(touchStart.current + gesture.dx);
      else if (direction === 'pending' && Math.max(Math.abs(gesture.dx), Math.abs(gesture.dy)) <= 6) select(touchStart.current);
      direction = 'pending';
    },
    onPanResponderTerminationRequest: () => direction !== 'horizontal',
    onPanResponderTerminate: () => { direction = 'pending'; },
    onShouldBlockNativeResponder: () => false,
    });
  });
  const apply = () => {
    const km = Number(draft.trim());
    if (!/^\d+$/.test(draft.trim()) || km < 11 || km > MAX_GENERATION_DISTANCE) {
      setError(`11~${MAX_GENERATION_DISTANCE}km 사이의 정수를 입력해 주세요.`); return;
    }
    onChange(km); setOpen(false);
  };
  const sliderValue = Math.min(10, value), percent = (sliderValue - 1) / 9 * 100;
  return <View style={{ gap: 12, marginTop: 20 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
      <AppText variant="heading" weight="bold">2. 목표 러닝 거리</AppText>
      <Pressable ref={moreButton} testID="distance-more" accessibilityRole="button" onPress={() => {
        setDraft(value > 10 ? String(value) : ''); setError(''); setOpen(true);
      }} style={{ minHeight: 48, justifyContent: 'center' }}>
        <AppText style={{ color: c.subtle }}>더 먼 거리 설정 ›</AppText>
      </Pressable>
    </View>
    <AppText testID="distance-value" family="roboto" weight="black" variant="metric" style={{ textAlign: 'center' }}>
      {value}<AppText weight="black" variant="heading"> km</AppText>
    </AppText>
    {value > 10 && <AppText variant="caption" style={{ textAlign: 'center', color: c.subtle }}>직접 입력한 거리 · 슬라이더를 움직이면 1~10km로 변경돼요.</AppText>}
    <View style={{ width: 308, maxWidth: '100%', alignSelf: 'center', paddingHorizontal: 4 }}>
      <View testID="distance-slider" accessible accessibilityRole="adjustable" accessibilityLabel="목표 러닝 거리 1~10km"
        accessibilityValue={{ min: 1, max: 10, now: sliderValue, text: value > 10 ? `직접 입력 ${value}km. 조절하면 1~10km로 변경` : `${value}km` }}
        accessibilityActions={[{ name: 'increment', label: '1km 늘리기' }, { name: 'decrement', label: '1km 줄이기' }]}
        onAccessibilityAction={event => { const action = event.nativeEvent.actionName;
          if (action === 'increment' || action === 'decrement') onChange(Math.max(1, Math.min(10, sliderValue + (action === 'increment' ? 1 : -1))));
        }}
        onLayout={event => { width.current = Math.max(1, event.nativeEvent.layout.width); }}
        {...responder.panHandlers} style={{ height: 48, justifyContent: 'center' }}>
        <View pointerEvents="none" style={{ height: 4, borderRadius: 2, backgroundColor: c.divider }}>
          <View style={{ height: 4, width: `${percent}%`, borderRadius: 2, backgroundColor: value > 10 ? c.subtle : c.action }} />
          <View style={{ position: 'absolute', top: -7, left: `${percent}%`, marginLeft: -9, width: 18, height: 18, borderRadius: 9, backgroundColor: value > 10 ? c.subtle : c.action }} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: -12, marginTop: -8 }}>
        {GENERATION_DISTANCES.map(km => <Pressable key={km} testID={`distance-${km}`} accessibilityRole="button" accessibilityLabel={`${km} km`}
          accessibilityState={{ selected: value === km }} onPress={() => onChange(km)} style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
          <Image source={require('../../../assets/generation/distance-tick.svg')} accessible={false} style={{ width: 3, height: 3 }} />
        </Pressable>)}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>{[1, 5, 10].map(km => <AppText key={km} variant="caption" style={{ color: c.muted }}>{km}km</AppText>)}</View>
    </View>
    <AppModal visible={open} title="더 먼 거리 설정" onClose={() => setOpen(false)} returnFocusRef={moreButton}
      footer={<View style={{ gap: 8 }}><Button label="적용" testID="distance-apply" onPress={apply} />
        <Button label="취소" testID="distance-cancel" variant="outline" onPress={() => setOpen(false)} /></View>}>
      <View style={{ width: '100%' }}><TextField label="목표 러닝 거리 (km)" testID="distance-input" value={draft}
        onChangeText={text => { setDraft(text); setError(''); }} keyboardType="number-pad" returnKeyType="done"
        onSubmitEditing={apply} error={error} hint={`11~${MAX_GENERATION_DISTANCE}km · 1km 단위`} /></View>
    </AppModal>
  </View>;
}
