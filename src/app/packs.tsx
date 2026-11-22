import { router } from 'expo-router';
import { GuestMemberNotice } from '@/features/auth/GuestMemberNotice';
import { PackFrame, backFromPacks } from '@/features/packs/PackFrame';
import { PackSelection } from '@/features/packs/PackSelection';

export default function Packs() {
  return <PackFrame title="RunPen 팩 구매"><GuestMemberNotice>
    <PackSelection onBack={backFromPacks} onHistory={() => router.push('/purchase-history')} />
  </GuestMemberNotice></PackFrame>;
}
