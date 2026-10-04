import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Point } from '@/modules/route-engine/types';
import { DRAWING_POINTS_MAX, drawingTemplate, templatePreview } from './drawing';

function Stroke({ points, size, color = '#23694C' }: { points: Point[]; size: number; color?: string }) {
  // Bound native view count while retaining the last touch in the live preview.
  const step = Math.max(1, Math.ceil(points.length / 256));
  const visiblePoints = points.filter((_, i) => i % step === 0 || i === points.length - 1);
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {visiblePoints.slice(1).map((p, i) => {
      const a = visiblePoints[i], dx = (p.x - a.x) * size, dy = (p.y - a.y) * size;
      return <View key={i} style={{ position: 'absolute', left: (a.x + p.x) * size / 2 - Math.hypot(dx, dy) / 2,
        top: (a.y + p.y) * size / 2 - 1.5, width: Math.hypot(dx, dy), height: 3, borderRadius: 2,
        backgroundColor: color, transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }] }} />;
    })}
    {!!points.length && <View style={{ position: 'absolute', left: points[0].x * size - 5, top: points[0].y * size - 5,
      width: 10, height: 10, borderRadius: 5, backgroundColor: '#B36F28' }} />}
  </View>;
}

export function DrawingPreview({ template }: { template: Point[] }) {
  return <View accessibilityLabel="직접 그린 도형 미리보기" style={styles.preview}><Stroke points={templatePreview(template)} size={88} /></View>;
}

export default function DrawingEditor({ initial, onApply, onCancel }: {
  initial: Point[] | null; onApply(template: Point[]): void; onCancel(): void;
}) {
  const [stroke, setStroke] = useState<Point[]>(initial ? templatePreview(initial) : []);
  const [size, setSize] = useState(0), [drawing, setDrawing] = useState(false), [overflow, setOverflow] = useState(false);
  const draft = useRef(stroke), width = useRef(size), active = useRef(false), excessive = useRef(false);
  const result = useMemo(() => {
    if (drawing) return { template: null, error: '' };
    if (overflow) return { template: null, error: '선이 너무 길어요. 조금 더 단순하게 다시 그려 주세요.' };
    try { return { template: drawingTemplate(stroke), error: '' }; }
    catch (error) { return { template: null, error: error instanceof Error ? error.message : '다시 그려 주세요.' }; }
  }, [stroke, overflow, drawing]);
  const reset = () => { active.current = false; draft.current = []; excessive.current = false; setStroke([]); setDrawing(false); setOverflow(false); };
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => { if (state !== 'active' && active.current) reset(); });
    return () => listener.remove();
  }, []);
  const responder = useMemo(() => {
    const append = (x: number, y: number) => {
      if (!active.current || !width.current || excessive.current) return;
      const p = { x: Math.max(0, Math.min(1, x / width.current)), y: Math.max(0, Math.min(1, y / width.current)) };
      const last = draft.current.at(-1);
      if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.004) return;
      if (draft.current.length >= DRAWING_POINTS_MAX) { excessive.current = true; setOverflow(true); return; }
      draft.current = [...draft.current, p]; setStroke(draft.current);
    };
    // PanResponder registers these event callbacks; it does not invoke/read refs during render.
    // eslint-disable-next-line react-hooks/refs
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: event => {
        draft.current = []; active.current = true; excessive.current = false;
        setStroke([]); setOverflow(false); setDrawing(true);
        append(event.nativeEvent.locationX, event.nativeEvent.locationY);
      },
      onPanResponderMove: event => {
        if (event.nativeEvent.touches.length > 1) { reset(); return; }
        append(event.nativeEvent.locationX, event.nativeEvent.locationY);
      },
      onPanResponderRelease: event => {
        append(event.nativeEvent.locationX, event.nativeEvent.locationY);
        active.current = false; setDrawing(false);
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderTerminate: reset,
    });
  }, []);
  return <Modal visible animationType="slide" onRequestClose={onCancel}>
    <SafeAreaView style={styles.screen}>
      <ScrollView scrollEnabled={!drawing} contentContainerStyle={styles.content}>
        <Text style={styles.title}>직접 그리기</Text>
        <Text style={styles.body}>한 획으로 모양을 그리고 시작점으로 돌아와 주세요. 선이 겹치지 않는 닫힌 도형을 사용할 수 있어요.</Text>
        <View testID="drawing-canvas" accessibilityLabel="도형 그리기 영역" collapsable={false} style={styles.canvas}
          onLayout={event => { width.current = event.nativeEvent.layout.width; setSize(width.current); }} {...responder.panHandlers}>
          {!stroke.length && <View pointerEvents="none" style={styles.hint}><Text style={styles.body}>이 안에 크게 그려 주세요</Text></View>}
          <Stroke points={stroke} size={size} />
        </View>
        <Text style={styles.body}>갈색 점이 시작점이에요. 영역을 다시 터치하면 새로 그려요.</Text>
        {!drawing && !!stroke.length && <View testID={result.template ? 'drawing-valid' : 'drawing-invalid'} style={styles.feedback}>
          {result.template ? <><DrawingPreview template={result.template} /><Text style={styles.body}>적용할 모양이에요. 작은 틈을 닫고 선을 정리했어요.</Text></> :
            <Text accessibilityRole="alert" style={styles.error}>{result.error}</Text>}
        </View>}
        <Pressable testID="drawing-apply" accessibilityRole="button" disabled={drawing || !result.template}
          accessibilityState={{ disabled: drawing || !result.template }} style={[styles.primary, (drawing || !result.template) && styles.disabled]}
          onPress={() => { if (result.template && !active.current) onApply(result.template); }}><Text style={styles.primaryText}>이 도형 사용</Text></Pressable>
        <View style={styles.row}>
          <Pressable testID="drawing-clear" accessibilityRole="button" style={styles.secondary} onPress={reset}><Text style={styles.body}>모두 지우기</Text></Pressable>
          <Pressable testID="drawing-cancel" accessibilityRole="button" style={styles.secondary} onPress={onCancel}><Text style={styles.body}>취소</Text></Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F6F5F0' }, content: { padding: 20, gap: 14, paddingBottom: 32 },
  title: { color: '#183C32', fontSize: 22, fontWeight: '700' }, body: { color: '#57675F', fontSize: 14, lineHeight: 21, flexShrink: 1 },
  canvas: { width: '100%', maxWidth: 420, aspectRatio: 1, alignSelf: 'center', backgroundColor: '#FFF', borderRadius: 12, overflow: 'hidden' },
  hint: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  preview: { width: 88, height: 88, backgroundColor: '#FFF', borderRadius: 8, overflow: 'hidden' },
  feedback: { flexDirection: 'row', alignItems: 'center', gap: 12 }, error: { color: '#A1342C', lineHeight: 21 },
  primary: { backgroundColor: '#183C32', padding: 16, borderRadius: 12, alignItems: 'center' },
  primaryText: { color: '#FFF', fontWeight: '700' }, disabled: { opacity: 0.4 },
  row: { flexDirection: 'row', gap: 12 }, secondary: { flex: 1, padding: 14, alignItems: 'center', backgroundColor: '#E8EDE7', borderRadius: 12 },
});
