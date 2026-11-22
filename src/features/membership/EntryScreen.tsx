import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/features/auth/use-auth';
import { authentication } from '@/modules/auth/runtime';
import { guestAccess } from '@/modules/auth/guest-access';
import type { SignInProvider } from '@/modules/auth/providers';
import { EntryLayout } from './EntryLayout';

export default function EntryScreen() {
 const auth=useAuth(),params=useLocalSearchParams<{mode?:string}>();
 const [signup,setSignup]=useState(params.mode?params.mode!=='login':!auth.logoutNotice);
 const logoutNotice=auth.logoutNotice??0;
 const [seenLogout,setSeenLogout]=useState(logoutNotice),[seenMode,setSeenMode]=useState(params.mode);
 if(seenLogout!==logoutNotice){setSeenLogout(logoutNotice);setSeenMode(params.mode);setSignup(false);}
 else if(seenMode!==params.mode){setSeenMode(params.mode);setSignup(params.mode?params.mode!=='login':!logoutNotice);}
 const [provider,setProvider]=useState<SignInProvider|null>(null);
 return <EntryLayout signup={signup} ready={auth.ready} configured={auth.configured} busy={auth.busy} providers={auth.providers} provider={provider} message={auth.message} hasAccount={!!auth.account}
  onSignIn={p=>{setProvider(p);void authentication.signIn(p);}} onMode={()=>setSignup(!signup)} onMembership={()=>router.replace('/account-signup')}
  onGuest={()=>{guestAccess.enter();router.replace('/');}}/>;
}
