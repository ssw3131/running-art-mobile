import { useUsage } from '@/features/usage/use-usage';
import { resolveAchievementRegion } from '@/modules/achievements/regions';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';
import { useAuth } from '@/features/auth/use-auth';
import { getStorage } from '@/modules/storage/database';
import { storageErrorMessage } from '@/modules/storage/types';
import type { Achievements } from '@/modules/achievements/model';

export function useAchievements() {
  const usage=useUsage();
  const auth = useAuth(), owner = auth.ready ? auth.account?.id ?? '' : null;
  const [state, setState] = useState<{ owner: string | null; data: Achievements | null; error: string }>({ owner: null, data: null, error: '' });
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(useCallback(() => {
    if (owner === null) return;
    let current = true, busy = false;
    setState({ owner, data: null, error: '' });
    const refresh = async () => {
      if (busy || !current || AppState.currentState !== 'active') return;
      busy = true;
      try {
        const data = await (await getStorage()).achievements.read();
        if (current) setState({ owner, data, error: '' });
      } catch (error) { if (current) setState({ owner, data: null, error: storageErrorMessage(error) }); }
      finally { busy = false; }
    };
    const controller=new AbortController();
    void refresh();
    void getStorage().then(db=>db.achievements.resolveRegions((point,signal)=>resolveAchievementRegion(point,process.env.EXPO_PUBLIC_MAPTILER_API_KEY,signal),controller.signal)).then(()=>{if(current)void refresh();}).catch(()=>{});
    const listener = AppState.addEventListener('change', value => { if (value === 'active') void refresh(); });
    const timer = setInterval(() => void refresh(), 10000);
    return () => { current = false; controller.abort(); listener.remove(); clearInterval(timer); };
    // A retry explicitly re-enters the focused read lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, attempt]));
  const visible=state.owner===owner&&owner!==null?state:{data:null,error:''};
  const data=visible.data;
  const awards=data?.awards??[];
  return {...visible,data:data&&usage.data&&usage.data.generation.used>0&&!awards.some(a=>a.id==='first-generation')?{...data,awards:[{id:'first-generation',label:'첫 스케치'},...awards]}:data,retry:()=>setAttempt(value=>value+1)};
}
