import { useEffect, useState, useSyncExternalStore } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { guidance } from '@/modules/guidance/runtime';
import { SCENARIOS, type Scenario, type SimulationCommand } from '@/modules/guidance/simulator';
import type { Coordinate } from '@/modules/guidance/geometry';
import { getStorage } from '@/modules/storage/database';
import { durationLabel, paceLabel } from '@/modules/running/model';
import GuidanceMap from '@/features/guidance/GuidanceMap';

const arrows = { straight: '↑', left: '↰', right: '↱', uturn: '↶', arrival: '✓', unknown: '…' };
function Button({ label, id, onPress, light = false, disabled = false }: { label: string; id?: string; onPress(): void; light?: boolean; disabled?: boolean }) {
  return <Pressable testID={id} accessibilityRole="button" disabled={disabled} accessibilityState={{ disabled }} onPress={onPress} style={[s.button, light && s.lightButton, disabled && { opacity: 0.45 }]}><Text style={[s.buttonText, light && s.lightButtonText]}>{label}</Text></Pressable>;
}
export default function GuidanceScreen() {
  const params = useLocalSearchParams<{ courseId?: string }>();
  return <GuidanceContent key={params.courseId ?? 'demo'} />;
}
function GuidanceContent() {
  const router = useRouter(), params = useLocalSearchParams<{ courseId?: string }>();
  const view = useSyncExternalStore(guidance.subscribe, guidance.snapshot, guidance.snapshot), state = view.state;
  const [ready, setReady] = useState(false), [loadingError, setLoadingError] = useState('');
  const [course, setCourse] = useState<{ name: string; points: Coordinate[] } | null>(null);
  const [settings, setSettings] = useState(false), [panel, setPanel] = useState(false), [result, setResult] = useState(false);
  const [scenario, setScenario] = useState<Scenario>('normal');
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        // Recheck storage ownership even when resuming the same in-memory course.
        const saved = params.courseId ? await (await getStorage()).courses.get(params.courseId) : null;
        if (!active) return;
        const current = guidance.snapshot();
        if (current.state && !current.ended && current.courseId === (params.courseId ?? null)) {
          if (active) {
            if (current.courseId) setCourse({ name: current.name, points: guidance.route() });
            setReady(true); setScenario(current.scenario);
          }
          return;
        }
        if (current.state && !current.ended && (current.state.playing || current.state.elapsedMs > 0)) throw new Error('진행 중인 모의 시험을 먼저 종료한 뒤 다른 코스를 열어 주세요.');
        if (saved) setCourse({ name: saved.name, points: saved.snapshot.route });
        guidance.load(saved?.name ?? '시험 코스', saved?.snapshot.route ?? null, 'normal', saved?.id ?? null);
        setReady(true);
      } catch (error) { if (active) setLoadingError(error instanceof Error ? error.message : '시험 코스를 열지 못했어요.'); }
    }
    void load(); return () => { active = false; };
  }, [params.courseId]);
  function stop() { Alert.alert('모의 주행을 종료할까요?', '시험 결과는 실제 러닝 기록에 저장하지 않아요.', [{ text: '계속하기', style: 'cancel' }, { text: '시험 종료', onPress: () => { guidance.finish(); setResult(true); setSettings(false); } }]); }
  function restart() { guidance.restart(); setResult(false); setPanel(false); }
  function select(value: Scenario) { setScenario(value); guidance.load(course?.name ?? '시험 코스', course?.points ?? null, value, params.courseId ?? null); }
  if (!ready || !state) return <SafeAreaView style={s.white}><View style={s.padding}><Text style={s.eyebrow}>RUNPEN · 모의 주행</Text>{loadingError ? <Text accessibilityRole="alert">{loadingError}</Text> : <ActivityIndicator />}<Button label="돌아가기" light onPress={() => router.back()} /></View></SafeAreaView>;
  const started = state.elapsedMs > 0 || state.playing;
  const arrived = state.status === 'arrived';
  const off = state.status === 'off-route', weak = state.status === 'weak';
  const focus = view.options.mode === 'focus';
  const background = weak ? '#4B6071' : off ? '#FF5900' : '#059E53';
  const normalText = weak ? '위치를 확인하고 있어요' : off ? '코스를 벗어났어요' : arrived ? '코스를 완주했어요' : '코스를 따라 달리고 있어요';
  const stats = (inverse: boolean) => <View style={s.stats}>
    <View style={s.stat}><Text style={[s.statLabel, inverse && s.inverse]}>남은 거리</Text><Text testID="guidance-remaining" style={[s.statValue, inverse && s.inverse]}>{(state.remainingM / 1000).toFixed(2)}<Text style={s.unit}> km</Text></Text></View>
    <View style={s.stat}><Text style={[s.statLabel, inverse && s.inverse]}>모의 러닝 시간</Text><Text testID="guidance-time" style={[s.statValue, inverse && s.inverse]}>{durationLabel(state.elapsedMs)}</Text></View>
    <View style={s.stat}><Text style={[s.statLabel, inverse && s.inverse]}>평균 페이스</Text><Text testID="guidance-pace" style={[s.statValue, inverse && s.inverse]}>{paceLabel(state.elapsedMs, state.distanceM)}</Text></View>
  </View>;
  if (result || view.ended) return <SafeAreaView style={s.white}><View style={[s.padding, { flex: 1, justifyContent: 'space-between' }]}>
    <Text style={s.eyebrow}>RUNPEN · 모의 주행 결과</Text>
    <View style={{ alignItems: 'center', gap: 20 }}><View style={s.trophy}><Text style={{ fontSize: 56, color: '#FF5900' }}>{arrived ? '✓' : '■'}</Text></View><Text testID="guidance-result-title" style={s.title}>{arrived ? '완주를 축하합니다!' : '모의 주행을 종료했어요'}</Text><Text style={s.muted}>{view.name} · 실제 러닝 기록에 저장되지 않아요.</Text></View>
    <View style={s.resultCard}><Text style={s.statLabel}>총 모의 이동 거리</Text><Text style={s.distance}>{(state.distanceM / 1000).toFixed(2)}<Text style={s.unit}> km</Text></Text>{stats(false)}</View>
    <View style={{ gap: 12 }}><Button id="guidance-retry" label="다시 시험하기" onPress={restart} /><Button label="코스 상세로 돌아가기" light onPress={() => { guidance.finish(); router.back(); }} /></View>
  </View></SafeAreaView>;
  return <SafeAreaView style={[s.screen, focus && { backgroundColor: background }]} edges={['top', 'bottom']}>
    <View style={[s.header, focus && { backgroundColor: background }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="뒤로 가기" onPress={() => router.back()}><Text style={[s.back, focus && s.inverse]}>‹</Text></Pressable>
      <Text style={[s.eyebrow, focus && s.inverse]}>RUNPEN · 모의 주행</Text>
      <Pressable testID="guidance-mode" accessibilityRole="button" onPress={() => guidance.options({ mode: focus ? 'map' : 'focus' })}><Text style={[s.mode, focus && s.inverse]}>{focus ? '지도 보기' : '집중 모드'}</Text></Pressable>
    </View>
    {!started && <View style={s.setup}>
      <Text style={s.title}>러닝 안내 시험</Text><Text style={s.muted}>{view.name} · 실제 GPS 없이 코스를 따라가요.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
        {SCENARIOS.filter(item => !course || ['normal', 'detour', 'jitter', 'loss'].includes(item.id)).map(item => <Pressable key={item.id} testID={`guidance-scenario-${item.id}`} accessibilityRole="button" accessibilityState={{ selected: scenario === item.id }} style={[s.chip, scenario === item.id && s.selected]} onPress={() => select(item.id)}><Text style={scenario === item.id && { color: '#FF5900', fontWeight: '700' }}>{item.name}</Text></Pressable>)}
      </ScrollView>
    </View>}
    <View style={s.body}>
      {focus ? <View style={s.focusContent}>
        <View><Text testID="guidance-status" style={s.focusTitle}>{normalText}</Text><Text style={s.focusSubtitle}>{!state.playing && !arrived ? '일시정지 · 재생하면 이어서 안내해요' : off ? '지나온 길을 따라 코스로 돌아가세요' : '방향 안내를 확인하며 달려보세요'}</Text></View>
        <View><Text testID="guidance-distance" style={s.focusDistance}>{(state.distanceM / 1000).toFixed(2)}<Text style={{ fontSize: 25 }}> km</Text></Text>{stats(true)}</View>
        <View style={s.directionCircle}><Text style={s.directionArrow}>{arrows[state.direction]}</Text></View>
        <View><Text testID="guidance-instruction" style={s.focusInstruction}>{state.instruction}</Text><Text style={s.focusSubtitle}>{weak ? '확인될 때까지 방향 판단을 보류해요' : `약 ${Math.round(state.instructionM)}m${off ? ' 되돌아가기' : ''}`}</Text></View>
      </View> : <>
        <GuidanceMap route={guidance.route()} state={state} />
        <View pointerEvents="box-none" style={s.mapStats}><View style={s.card}><Text testID="guidance-distance" style={s.distance}>{(state.distanceM / 1000).toFixed(2)}<Text style={s.unit}> km</Text></Text>{stats(false)}<Text testID="guidance-status" style={[s.smallStatus, { color: off ? '#BF4700' : weak ? '#4B6071' : '#078950' }]}>{normalText}</Text></View></View>
        <View pointerEvents="box-none" style={s.mapInstruction}><View style={s.instructionCard}><Text style={[s.smallArrow, { color: off ? '#FF5900' : '#05A65C' }]}>{arrows[state.direction]}</Text><View style={{ flex: 1 }}><Text testID="guidance-instruction" style={s.instruction}>{state.instruction}</Text><Text style={s.muted}>{weak ? '위치 판단 보류' : `약 ${Math.round(state.instructionM)}m`}</Text></View></View></View>
      </>}
    </View>
    {!!view.error && <Text accessibilityRole="alert" style={s.error}>{view.error}</Text>}
    {!!view.native?.voiceError && <Text style={[s.voiceNotice, focus && s.inverse]}>{view.native.voiceError}</Text>}
    {arrived ? <View style={s.footer}><Button id="guidance-result" label="완주 결과 보기" onPress={() => { guidance.pause(); setResult(true); }} /></View> : <View style={s.footer}>
      <Pressable testID="guidance-settings" accessibilityRole="button" accessibilityLabel="러닝 설정" style={s.round} onPress={() => setSettings(true)}><Text style={{ fontSize: 22 }}>⚙</Text></Pressable>
      <View style={{ flex: 1 }}><Button id="guidance-play" label={state.playing ? 'Ⅱ  일시정지' : started ? '▶  이어서 재생' : '▶  모의 주행 시작'} onPress={() => state.playing ? guidance.pause() : void guidance.play()} /></View>
      <Pressable testID="guidance-stop" accessibilityRole="button" accessibilityLabel="시험 종료" style={s.round} onPress={stop}><Text style={{ fontSize: 19 }}>■</Text><Text style={{ fontSize: 10 }}>종료</Text></Pressable>
    </View>}
    <Pressable testID="guidance-panel" accessibilityRole="button" style={s.panelToggle} onPress={() => setPanel(true)}><Text style={[s.panelToggleText, focus && s.inverse]}>시험 조작 · {state.speed}배 · 진행 {Math.round(state.progressM / state.totalM * 100)}%  ⌃</Text></Pressable>
    <Modal visible={settings} animationType="slide" onRequestClose={() => setSettings(false)}>
      <SafeAreaView style={s.white}><View style={s.header}><Text style={s.eyebrow}>모의 주행</Text><Text style={s.title}>러닝 설정</Text></View><ScrollView testID="guidance-settings-scroll" contentContainerStyle={[s.padding, { flexGrow: 1, gap: 20 }]}>
        <View style={s.settingCard}><Text style={s.settingTitle}>러닝 화면 설정</Text><Text style={s.muted}>모의 주행은 설정 중에도 계속돼요.</Text><View style={s.row}><Button label="지도 모드" light={view.options.mode !== 'map'} onPress={() => guidance.options({ mode: 'map' })} /><Button label="집중 모드" light={view.options.mode !== 'focus'} onPress={() => guidance.options({ mode: 'focus' })} /></View></View>
        <View style={[s.settingCard, s.row]}><View style={{ flex: 1 }}><Text style={s.settingTitle}>음성 피드백</Text><Text style={s.muted}>방향·이탈·복귀를 한국어로 안내해요.</Text></View><Switch testID="guidance-voice-switch" value={view.options.voice} trackColor={{ true: '#FF5900' }} onValueChange={voice => guidance.options({ voice })} /></View>
        <View style={[s.settingCard, s.row]}><View style={{ flex: 1 }}><Text style={s.settingTitle}>화면 꺼져도 안내</Text><Text style={s.muted}>잠금 중에도 모의 주행을 계속해요.{ '\n' }끄면 앱을 내릴 때 일시정지해요.</Text></View><Switch testID="guidance-background-switch" value={view.options.background} trackColor={{ true: '#FF5900' }} onValueChange={background => guidance.options({ background })} /></View>
        <Text style={s.muted}>모의 주행 결과는 저장·동기화하지 않아요.</Text><View style={{ flex: 1 }} /><Button label="러닝 화면으로 돌아가기 ›" id="guidance-settings-close" onPress={() => setSettings(false)} /><Button label={state.playing ? '일시정지' : '이어서 재생'} light onPress={() => state.playing ? guidance.pause() : void guidance.play()} /><Button label="시험 종료" light onPress={stop} />
      </ScrollView></SafeAreaView>
    </Modal>
    <Modal visible={panel} transparent animationType="slide" onRequestClose={() => setPanel(false)}><View style={s.scrim}><SafeAreaView style={s.sheet} edges={['bottom']}><ScrollView contentContainerStyle={s.padding}>
      <View style={[s.row, { justifyContent: 'space-between' }]}><Text style={s.title}>모의 주행 시험 조작</Text><Pressable accessibilityRole="button" testID="guidance-panel-close" onPress={() => setPanel(false)}><Text style={s.close}>닫기 ✕</Text></Pressable></View>
      <Text style={s.muted}>기준 6분/km · 배속은 모의 시간을 가속해요.</Text><View style={s.row}>{[1, 5, 10, 30].map(speed => <Button key={speed} id={`guidance-speed-${speed}`} label={`${speed}배`} light={state.speed !== speed} onPress={() => guidance.speed(speed)} />)}</View>
      <View style={s.wrap}>{([['depart', '이탈 시작'], ['return', '지나온 길로 복귀'], ['weak', '위치 불량'], ['lost', '신호 끊기'], ['normal', '정상 수신']] as [SimulationCommand, string][]).map(([command, label]) => <Button key={command} id={`guidance-command-${command}`} label={label} light onPress={() => guidance.command(command)} />)}</View>
      <Button id="guidance-restart" label="처음부터 · 일시정지" light onPress={restart} />
      <Text testID="guidance-diagnostics" style={s.diagnostics}>상태 {state.status} · 경로와 {state.separationM.toFixed(1)}m · 진행 {state.progressM.toFixed(1)}/{state.totalM.toFixed(1)}m{ '\n' }복귀 {state.returnM.toFixed(1)}m · 음성 완료 {view.native?.spoken ?? 0} · 진동 {view.native?.vibrations ?? 0}</Text>
      <Text style={s.settingTitle}>안내 발생 기록</Text>{state.events.slice(-12).reverse().map(event => <Text key={event.id} style={s.log}>{durationLabel(event.timestamp)} · {event.text}</Text>)}
    </ScrollView></SafeAreaView></View></Modal>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F5F3' }, white: { flex: 1, backgroundColor: '#FFF' }, padding: { padding: 22, gap: 16 },
  header: { height: 55, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, backgroundColor: '#FFF' },
  eyebrow: { color: '#5E6B72', fontSize: 12, fontWeight: '700', letterSpacing: 1 }, back: { fontSize: 36, color: '#142D40' }, mode: { color: '#142D40', fontSize: 13, fontWeight: '700' },
  title: { fontSize: 23, fontWeight: '800', color: '#172A37' }, muted: { fontSize: 12, lineHeight: 19, color: '#6A737B' }, setup: { backgroundColor: '#FFF', padding: 18, gap: 6 },
  chip: { paddingVertical: 10, paddingHorizontal: 13, borderRadius: 22, borderWidth: 1, borderColor: '#DCE1E3', backgroundColor: '#FFF' }, selected: { backgroundColor: '#FFF0E9', borderColor: '#FF5900' },
  body: { flex: 1, minHeight: 240 }, mapStats: { position: 'absolute', top: 18, left: 22, right: 22 }, card: { padding: 16, backgroundColor: '#FFF', borderRadius: 22, elevation: 4 },
  distance: { fontSize: 38, fontWeight: '800', color: '#0E1D27', textAlign: 'center' }, unit: { fontSize: 14, fontWeight: '600' }, stats: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', gap: 6, paddingVertical: 10 }, stat: { alignItems: 'center', minWidth: 75 }, statLabel: { fontSize: 11, color: '#737D83', marginBottom: 5 }, statValue: { fontSize: 16, fontWeight: '800', color: '#182B3B' }, smallStatus: { textAlign: 'center', fontSize: 12, fontWeight: '600' },
  mapInstruction: { position: 'absolute', left: 22, right: 22, bottom: 35 }, instructionCard: { backgroundColor: '#FFF', padding: 16, borderRadius: 18, elevation: 4, flexDirection: 'row', alignItems: 'center', gap: 12 }, smallArrow: { fontSize: 45, fontWeight: '900' }, instruction: { fontSize: 17, fontWeight: '800', color: '#132B3E' },
  focusContent: { flex: 1, paddingHorizontal: 24, paddingVertical: 18, alignItems: 'stretch', justifyContent: 'space-around', gap: 8 }, focusTitle: { fontSize: 20, fontWeight: '800', color: '#FFF', textAlign: 'center' }, focusSubtitle: { fontSize: 13, color: '#FFF', textAlign: 'center', marginTop: 7 }, focusDistance: { fontSize: 64, fontWeight: '800', color: '#FFF', textAlign: 'center', letterSpacing: -2 }, inverse: { color: '#FFF' },
  directionCircle: { width: 132, height: 132, borderRadius: 70, backgroundColor: '#00000033', justifyContent: 'center', alignItems: 'center', alignSelf: 'center' }, directionArrow: { color: '#FFF', fontWeight: '900', fontSize: 88, lineHeight: 105 }, focusInstruction: { fontSize: 25, fontWeight: '800', color: '#FFF', textAlign: 'center' },
  footer: { flexDirection: 'row', gap: 16, alignItems: 'center', paddingHorizontal: 22, paddingTop: 14, paddingBottom: 6 }, round: { backgroundColor: '#FFF', width: 48, height: 48, borderRadius: 26, alignItems: 'center', justifyContent: 'center', elevation: 2 },
  button: { backgroundColor: '#122D46', paddingVertical: 15, paddingHorizontal: 17, borderRadius: 28, alignItems: 'center' }, buttonText: { color: '#FFF', fontSize: 14, fontWeight: '700' }, lightButton: { backgroundColor: '#F0F3F4' }, lightButtonText: { color: '#193446' }, panelToggle: { padding: 12, alignItems: 'center' }, panelToggleText: { fontSize: 12, color: '#546775' }, error: { padding: 10, backgroundColor: '#FFF0E9', color: '#A73313' }, voiceNotice: { fontSize: 11, paddingHorizontal: 20, paddingTop: 4, color: '#656F78' },
  settingCard: { borderRadius: 20, padding: 20, backgroundColor: '#FFF', elevation: 4, gap: 12, borderWidth: 1, borderColor: '#F0F0F0' }, settingTitle: { fontSize: 16, fontWeight: '800', color: '#142D3B' }, row: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000055' }, sheet: { maxHeight: '85%', backgroundColor: '#FFF', borderTopLeftRadius: 26, borderTopRightRadius: 26 }, close: { color: '#7B471D', padding: 8 }, diagnostics: { fontSize: 12, lineHeight: 20, backgroundColor: '#F1F4F6', padding: 12, borderRadius: 10 }, log: { fontSize: 12, lineHeight: 20, color: '#4B5A66' }, trophy: { width: 132, height: 132, borderRadius: 70, backgroundColor: '#FFF0E7', alignItems: 'center', justifyContent: 'center' }, resultCard: { backgroundColor: '#F6F7F8', padding: 24, borderRadius: 24 },
});
