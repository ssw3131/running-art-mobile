import { fetch as expoFetch } from 'expo/fetch';
import { authConfig } from '../auth/config';
import { authentication, authClient } from '../auth/runtime';
import { getStorage } from '../storage/database';
import { personalSync } from '../sync/runtime';
import { shareBase, RunShareError } from './model';
import { createRunShareRemote } from './remote';
import { createRunSharing } from './service';

const config = authConfig(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
const base = shareBase(process.env.EXPO_PUBLIC_RUN_SHARE_URL);
export const runSharing = config && base && authClient ? createRunSharing({
  base,
  owner: () => authentication.getSnapshot().account?.id ?? null,
  exclusive: work => authentication.withAccountOperation(work),
  load: async id => {
    const repo = (await getStorage()).runs;
    const run = await repo.get(id), points = await repo.points(id), guidance = await repo.guidance(id);
    return { run, points, course: guidance?.course ?? null };
  },
  sync: async owner => {
    const repo = (await getStorage()).sync;
    if (!(await repo.status(owner)).enabled) throw new RunShareError('내 계정의 동기화를 켠 뒤 경로를 공유해 주세요.');
    await personalSync.sync();
    const status = await repo.status(owner);
    if (status.conflicts.length || status.pending) throw new RunShareError('기록 동기화를 완료한 뒤 공유해 주세요. 동기화 화면에서 상태를 확인할 수 있어요.');
  },
  remote: async owner => {
    const session = await authClient?.auth.getSession();
    if (!session || session.error || session.data.session?.user.id !== owner) throw new RunShareError('같은 계정으로 다시 로그인해 주세요.');
    return createRunShareRemote({ ...config, token: session.data.session.access_token, fetch: expoFetch as unknown as typeof fetch });
  },
}) : null;
