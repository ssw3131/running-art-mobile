import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/features/auth/use-auth';
import { readUsage, usageChanges } from '@/modules/usage/runtime';
import type { UsageSummary } from '@/modules/usage/model';
export function useUsage() {
  const auth=useAuth(),owner=auth.account?.id??null,revision=useRef(0);
  const [state,setState]=useState<{owner:string|null;data:UsageSummary|null;error:string;loading:boolean}>({owner:null,data:null,error:'',loading:false});
  const refresh=useCallback(async()=>{
    if(!owner)return;const ticket=++revision.current;
    setState(old=>({...old,owner,data:old.owner===owner?old.data:null,loading:true,error:''}));
    try {const data=await readUsage();if(ticket===revision.current)setState({owner,data,error:'',loading:false});}
    catch(error){if(ticket===revision.current)setState(old=>({...old,loading:false,error:error instanceof Error?error.message:'횟수를 확인하지 못했어요.'}));}
  },[owner]);
  useFocusEffect(useCallback(()=>{
    void refresh();const unsubscribe=usageChanges.subscribe(()=>void refresh());
    const listener=AppState.addEventListener('change',value=>{if(value==='active')void refresh();});
    return()=>{revision.current++;unsubscribe();listener.remove();};
  },[refresh]));
  return {...(state.owner===owner?state:{data:null,error:'',loading:false}),refresh};
}
