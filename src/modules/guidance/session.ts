import { createGuidance, type GuidanceState } from './engine.ts';
import { createSimulator, type Scenario, type SimulationCommand } from './simulator.ts';
import type { Coordinate } from './geometry.ts';

export type SimulationSession = ReturnType<typeof createSimulationSession>;
export function createSimulationSession(points: readonly Coordinate[], scenario: Scenario) {
  const engine = createGuidance(points), source = createSimulator(points, scenario);
  let playing = false, speed = 1, lastClock = 0, remainder = 0;
  const initial = source.sample(); if (initial) engine.ingest(initial);
  function snapshot() { return { ...engine.snapshot(), playing, speed }; }
  function update(clock: number) {
    if (!Number.isFinite(clock)) throw new Error('모의 주행 시계를 확인할 수 없어요.');
    if (playing) {
      remainder += Math.max(0, clock - lastClock) * speed;
      // Each fix remains one virtual second apart even at 30x or after a delayed render.
      let steps = 0;
      while (remainder >= 1000 && playing && steps++ < 300) {
        const fix = source.step();
        if (fix) engine.ingest(fix); else engine.tick(source.elapsed());
        remainder -= 1000;
        if (engine.snapshot().status === 'arrived') playing = false;
      }
    }
    lastClock = clock;
    return snapshot();
  }
  return {
    snapshot, update,
    play(clock: number) { lastClock = clock; if (engine.snapshot().status !== 'arrived') playing = true; return snapshot(); },
    pause(clock: number) { update(clock); playing = false; return snapshot(); },
    setSpeed(value: number, clock: number) { if (![1, 5, 10, 30].includes(value)) throw new Error('지원하지 않는 배속이에요.'); update(clock); speed = value; return snapshot(); },
    command(value: SimulationCommand) { source.command(value); },
  };
}
export type SimulationSnapshot = GuidanceState & { playing: boolean; speed: number };
