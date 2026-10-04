import { requireOptionalNativeModule } from 'expo';
export type NativeStatus = { running: boolean; voiceReady: boolean; voiceError: string; utterances: number; spoken: number; vibrations: number };
export const guidanceNative = requireOptionalNativeModule<{
  start(token: string): Promise<void>; stop(): void; clock(): number; commands(): string[];
  nextTick(token: string): Promise<boolean>;
  status(): NativeStatus; publish(text: string, diagnostic: string): void;
  feedback(id: string, text: string, vibrate: boolean): void; silence(): void;
  prepareLive(): void; feedbackLive(id: string, text: string, vibrate: boolean): void;
  silenceLive(): void; liveStatus(): Omit<NativeStatus, 'running'>;
}>('RunPenGuidance');
