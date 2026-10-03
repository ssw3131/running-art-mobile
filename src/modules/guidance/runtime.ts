import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { getStorage } from '../storage/database';
import { createSimulationSession, type SimulationSession, type SimulationSnapshot } from './session';
import { guidanceNative as native, type NativeStatus } from './native';
import { guidanceActivity } from './activity';
import { demoCourse, type Scenario, type SimulationCommand } from './simulator';
import type { Coordinate } from './geometry';

type Options = { mode: 'map' | 'focus'; voice: boolean; background: boolean };
type View = { state: SimulationSnapshot | null; name: string; courseId: string | null; scenario: Scenario; options: Options; error: string; native: NativeStatus | null; ended: boolean };
let session: SimulationSession | null = null, token = '', timer: ReturnType<typeof setInterval> | null = null;
let release: (() => void) | null = null, lastFeedback = -Infinity;
let events = new Set<string>(), pending = false;
let coordinates: Coordinate[] = demoCourse('normal');
let view: View = { state: null, name: '시험 코스', courseId: null, scenario: 'normal', options: { mode: 'map', voice: true, background: true }, error: '', native: null, ended: false };
const listeners = new Set<() => void>();
const clock = () => native?.clock() ?? performance.now();
function publish() {
  view = { ...view, state: session?.snapshot() ?? null, native: native?.status() ?? null };
  for (const listener of listeners) listener();
}
function cleanup() {
  if (timer) clearInterval(timer);
  timer = null; native?.silence(); native?.stop(); release?.(); release = null;
}
function pause() { if (session) session.pause(clock()); cleanup(); publish(); }
function finish() { pause(); view = { ...view, ended: true }; guidanceActivity.set(false); publish(); }
function fail(error: unknown) {
  if (session) session.pause(clock()); cleanup();
  view = { ...view, error: error instanceof Error ? error.message : '모의 주행을 중단했어요. 다시 시작해 주세요.' }; publish();
}
function tick() {
  if (!session || !native) return;
  try {
    for (const command of native.commands()) {
      if (command === 'pause') { pause(); return; }
      if (command === 'stop') { finish(); return; }
      if (command === 'error') throw new Error('백그라운드 실행이 중단됐어요. 다시 시작해 주세요.');
    }
    if (!native.status().running) throw new Error('모의 주행 서비스가 종료됐어요. 앱에서 다시 재개해 주세요.');
    const state = session.update(clock());
    const fresh = state.events.filter(e => !events.has(e.id));
    fresh.forEach(e => events.add(e.id));
    const latest = fresh.findLast(e => e.kind !== 'turn') ?? fresh.at(-1);
    if (latest && (latest.kind !== 'turn' || clock() - lastFeedback >= 3500)) {
      native.feedback(latest.id, view.options.voice ? latest.text : '', latest.vibrate); lastFeedback = clock();
    }
    native.publish(`${state.instruction} · ${(state.distanceM / 1000).toFixed(2)}km`, `${state.status}|time=${state.elapsedMs}|distance=${state.distanceM.toFixed(1)}|progress=${state.progressM.toFixed(1)}|events=${state.events.map(e => e.id).join(',')}`);
    publish();
    if (state.status === 'arrived') {
      // Let the one arrival utterance complete while keeping the task alive briefly.
      if (timer) clearInterval(timer); timer = null;
      const finishedSession = session;
      setTimeout(() => { if (session === finishedSession && session?.snapshot().status === 'arrived') { cleanup(); publish(); } }, 7000);
    }
  } catch (error) { fail(error); }
}
export const guidance = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  snapshot: () => view,
  route: () => coordinates,
  load(name: string, points: Coordinate[] | null, scenario: Scenario, courseId: string | null = null) {
    cleanup(); guidanceActivity.set(false);
    coordinates = (points ?? demoCourse(scenario)).map(p => [...p]);
    session = createSimulationSession(coordinates, scenario); events = new Set();
    view = { ...view, name, courseId, scenario, ended: false, error: '' }; publish();
  },
  async play() {
    if (pending || session?.snapshot().playing) return;
    pending = true;
    try {
      if (!native || Platform.OS !== 'android') throw new Error('Android 설치 앱에서 모의 주행을 시험해 주세요.');
      if (AppState.currentState !== 'active') throw new Error('앱 화면에서 시작해 주세요.');
      if ((await (await getStorage()).runs.active())?.status === 'running') throw new Error('실제 GPS 러닝을 일시정지하거나 종료한 뒤 시험해 주세요.');
      if (Number(Platform.Version) >= 33 && !await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)) {
        if (await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS) !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('모의 주행의 일시정지·종료 알림을 허용해 주세요.');
      }
      if (!session) guidance.load('시험 코스', null, 'normal');
      view = { ...view, error: '', ended: false };
      guidanceActivity.set(true); token = `${Date.now()}-${Math.random()}`;
      await native.start(token);
      // Headless task owns the clock and loop; UI only observes it.
    } catch (error) { guidanceActivity.set(false); fail(error); }
    finally { pending = false; }
  },
  async task(data: { token: string }) {
    console.info('RunPenGuidance task', { tokenMatches: data.token === token, sessionPresent: !!session, nativePresent: !!native });
    if (data.token !== token || !session || !native) { native?.stop(); return; }
    await new Promise<void>(resolve => {
      release = resolve; session!.play(clock());
      timer = setInterval(tick, 250); tick();
    });
  },
  pause, finish,
  restart() { guidance.load(view.name, coordinates, view.scenario, view.courseId); },
  speed(value: number) { session?.setSpeed(value, clock()); publish(); },
  command(value: SimulationCommand) { session?.command(value); },
  options(options: Partial<Options>) {
    view = { ...view, options: { ...view.options, ...options } };
    if (options.voice === false) native?.silence();
    if (!view.options.background && AppState.currentState !== 'active') pause(); else publish();
  },
};
AppState.addEventListener('change', state => {
  if (state !== 'active' && !view.options.background && session?.snapshot().playing) pause();
  if (state === 'active') publish();
});
