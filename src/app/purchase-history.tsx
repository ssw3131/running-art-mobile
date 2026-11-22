import { router } from 'expo-router';
import { GuestMemberNotice } from '@/features/auth/GuestMemberNotice';
import { PackFrame } from '@/features/packs/PackFrame';
import { PurchaseHistory } from '@/features/packs/PurchaseHistory';

export default function History() {
  return <PackFrame title="구매 내역"><GuestMemberNotice>
    <PurchaseHistory onPacks={() => router.navigate('/packs')} onSupport={() => router.push('/service-inquiry')} />
  </GuestMemberNotice></PackFrame>;
}
