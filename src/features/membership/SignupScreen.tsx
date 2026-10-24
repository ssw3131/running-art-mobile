import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button } from '@/components/ui';
import { useAuth } from '@/features/auth/use-auth';
import { useProfilePhoto } from '@/features/account/use-profile-photo';
import { openServiceTab } from '@/features/service/open-service-tab';
import { authentication, profilePhotosEnabled } from '@/modules/auth/runtime';
import { pickProfilePhoto, discardProfilePhoto } from '@/modules/account/photo-picker';
import type { ProfileInput } from '@/modules/account/model';
import type { PreparedProfilePhoto } from '@/modules/account/photo';
import { signupNickname, suggestedNickname } from '@/modules/membership/model';
import { membership } from '@/modules/membership/runtime';
import { StorageError } from '@/modules/storage/types';
import { useThemeColors } from '@/theme/ThemeProvider';
import { SignupBrand } from './SignupBrand';
import { ConsentForm } from './ConsentForm';
import { useMembership } from './use-membership';
import { presetSource, presetSlots, prepareSignupPreset } from './profile-presets';

const defaultAvatar = require('../../../assets/signup/avatar-default.png');
function DefaultAvatar({ size }: { size: number }) {
  // Figma 256:7487: 123px source clipped by the original 120px circular slot.
  return <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
    <Image source={defaultAvatar} style={{ width: size * 123 / 120, height: size * 123 / 120 }} contentFit="fill" accessible={false} />
  </View>;
}
export default function SignupScreen() {
  const auth = useAuth();
  return <SignupEditor key={auth.account?.id ?? 'guest'} />;
}
function SignupEditor() {
  const auth = useAuth(), registration = useMembership(), c = useThemeColors();
  const owner = auth.account?.id;
  const [nickname, setNickname] = useState(suggestedNickname(auth.account?.name));
  const [picture, setPicture] = useState<ProfileInput['picture']>(auth.account?.picture ?? 'initials');
  const [selection, setSelection] = useState<number | 'gallery' | null>(null);
  const [photo, setPhoto] = useState<PreparedProfilePhoto | null>(null), [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const photoRef = useRef<PreparedProfilePhoto | null>(null), lock = useRef(false), focused = useRef(false), mounted = useRef(true);
  const uploaded = useProfilePhoto(owner, picture === 'uploaded' && !photo ? auth.account?.photoPath : null);
  const photoUrl = picture === 'uploaded' ? photo?.uri ?? uploaded : picture === 'provider' ? auth.account?.avatarUrl : null;
  useFocusEffect(useCallback(() => { focused.current = true; return () => { focused.current = false; }; }, []));
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; discardProfilePhoto(photoRef.current); }; }, []);
  const alive = () => mounted.current && focused.current && !!owner && authentication.getSnapshot().account?.id === owner;
  const replacePhoto = (next: PreparedProfilePhoto | null) => { discardProfilePhoto(photoRef.current); photoRef.current = next; setPhoto(next); };
  const choose = async (preset?: number) => {
    if (lock.current || auth.busy || registration.busy) return;
    lock.current = true; setWorking(true); setMessage('');
    try {
      const next = preset === undefined ? await pickProfilePhoto() : await prepareSignupPreset(preset);
      if (!alive()) { discardProfilePhoto(next); return; }
      if (next) { replacePhoto(next); setPicture('uploaded'); setSelection(preset ?? 'gallery'); }
    } catch (error) { if (alive()) setMessage(error instanceof StorageError ? error.message : '사진을 준비하지 못했어요. 다시 선택해 주세요.'); }
    finally { lock.current = false; if (mounted.current) setWorking(false); }
  };
  const complete = async () => {
    const policy = registration.policy;
    if (!alive() || lock.current || !policy || !auth.account || auth.busy || registration.busy) return;
    lock.current = true; setWorking(true); setMessage('');
    try {
      const value = signupNickname(nickname, auth.account.name);
      const saved = await membership.accept({ policyId: policy.id, terms: true, privacy: true }, async () => {
        if (!alive()) return false;
        // Save even an unchanged default once: service entry follows a confirmed
        // profile operation as well as the consent receipt, never Auth alone.
        const confirmed = await authentication.saveProfile({ nickname: value, picture }, photo ?? undefined);
        if (!alive() || !confirmed) return false;
        replacePhoto(null);
        return true;
      });
      if (saved && alive()) openServiceTab('/');
    } catch (error) { if (alive()) setMessage(error instanceof StorageError ? error.message : '가입 정보를 저장하지 못했어요. 다시 시도해 주세요.'); }
    finally { lock.current = false; if (mounted.current) setWorking(false); }
  };
  const busy = working || auth.busy || registration.busy;
  const profile = <View style={{ gap: 17 }}>
    <AppText variant="heading" weight="bold">프로필 이미지<AppText variant="label" weight="bold">(선택)</AppText></AppText>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 9, columnGap: 8 }}>
      <Pressable testID="signup-default-photo" accessibilityRole="button" accessibilityLabel={auth.account?.avatarUrl ? '연결 계정 사진 사용' : '기본 프로필 이미지 사용'}
        accessibilityState={{ selected: picture === 'provider' || !auth.account?.avatarUrl && picture === 'initials', disabled: busy }}
        disabled={busy} onPress={() => { replacePhoto(null); setPicture(auth.account?.avatarUrl ? 'provider' : 'initials'); setSelection(null); }} style={{ width: 60, height: 60, borderRadius: 30, overflow: 'hidden' }}>
        {auth.account?.avatarUrl ? <Image source={{ uri: auth.account.avatarUrl }} style={{ width: 60, height: 60 }} accessible={false} /> : <DefaultAvatar size={60} />}
        {(picture === 'provider' || !auth.account?.avatarUrl && picture === 'initials') && <View pointerEvents="none" style={{ position: 'absolute', inset: 0, borderRadius: 30, borderWidth: 3, borderColor: c.action }} />}
      </Pressable>
      {profilePhotosEnabled && presetSlots.map(([x, y], index) => <Pressable key={index} testID={`signup-preset-${index}`} accessibilityRole="button" accessibilityLabel={`러너 이미지 ${index + 1}`}
        accessibilityState={{ selected: selection === index, disabled: busy }} disabled={busy} onPress={() => { void choose(index); }} style={{ width: 60, height: 60, borderRadius: 30, overflow: 'hidden' }}>
        <Image source={presetSource} style={{ position: 'absolute', width: 331.5, height: 165.75, left: -x, top: -y }} contentFit="fill" accessible={false} />
        {selection === index && <View pointerEvents="none" style={{ position: 'absolute', inset: 0, borderRadius: 30, borderWidth: 3, borderColor: c.action }} />}
      </Pressable>)}
      {profilePhotosEnabled && <Pressable testID="signup-photo" accessibilityRole="button" accessibilityLabel="내 사진 선택" accessibilityState={{ selected: selection === 'gallery', disabled: busy }} disabled={busy} onPress={() => { void choose(); }}>
        <Image source={require('../../../assets/signup/gallery.svg')} style={{ width: 60, height: 60 }} accessible={false} />
        {selection === 'gallery' && <View pointerEvents="none" style={{ position: 'absolute', inset: 0, borderRadius: 30, borderWidth: 3, borderColor: c.action }} />}
      </Pressable>}
    </View>
  </View>;
  const body = !auth.account ? <Button label="로그인하고 계속하기" onPress={() => router.replace('/account-entry')} />
    : registration.owner !== owner || registration.status === 'idle' || registration.status === 'loading' ? <ActivityIndicator accessibilityLabel="가입 상태 확인 중" />
    : registration.status === 'error' || registration.status === 'unavailable' ? <View style={{ gap: 20 }}>
      <AppText accessibilityRole="alert">{registration.message || '가입 상태를 확인하지 못했어요.'}</AppText>
      <Button label="가입 상태 다시 확인" onPress={() => { void membership.reload(); }} />
    </View>
    : registration.status === 'complete' && !registration.busy ? <View style={{ gap: 20 }}><AppText testID="signup-done">가입 절차를 완료했어요.</AppText><Button label="홈으로 이동" onPress={() => openServiceTab('/')} /></View>
    : <>
      <View accessible accessibilityLabel={photoUrl ? '선택한 프로필 사진' : '기본 프로필 이미지'} style={{ alignSelf: 'center', height: 120, width: 120, borderRadius: 60, overflow: 'hidden', marginTop: 21 }}>
        {photoUrl ? <Image source={{ uri: photoUrl }} style={{ width: 120, height: 120 }} /> : <DefaultAvatar size={120} />}
      </View>
      <ConsentForm policy={registration.policy} policyStatus={registration.policyStatus} policyMessage={registration.policyMessage} onRetryPolicy={() => { void membership.retryPolicy(); }}
        email={auth.account.email} nickname={nickname} onNickname={setNickname} busy={busy} message={message || registration.message || auth.message}
        onSubmit={() => { void complete(); }} profile={profile} />
    </>;
  return <SafeAreaView edges={['bottom']} style={{ flex: 1 }}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
    <ScrollView testID="signup-details" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 26, paddingTop: 36, paddingBottom: 37, gap: 30, width: '100%', maxWidth: 412, alignSelf: 'center' }}>
      <SignupBrand />{body}
      {!!auth.account && <Button label="로그아웃" variant="outline" compact disabled={busy} onPress={() => { void authentication.signOut(); }} />}
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}
