import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
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

export default function SignupScreen() {
  const auth = useAuth();
  return <SignupEditor key={auth.account?.id ?? 'guest'} />;
}
function SignupEditor() {
  const auth = useAuth(), registration = useMembership(), c = useThemeColors();
  const owner = auth.account?.id;
  const [nickname, setNickname] = useState(suggestedNickname(auth.account?.name));
  const [picture, setPicture] = useState<ProfileInput['picture']>(auth.account?.picture ?? 'provider');
  const [photo, setPhoto] = useState<PreparedProfilePhoto | null>(null), [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const photoRef = useRef<PreparedProfilePhoto | null>(null), lock = useRef(false), focused = useRef(false);
  const uploaded = useProfilePhoto(owner, picture === 'uploaded' && !photo ? auth.account?.photoPath : null);
  const photoUrl = picture === 'uploaded' ? photo?.uri ?? uploaded : picture === 'provider' ? auth.account?.avatarUrl : null;
  useFocusEffect(useCallback(() => { focused.current = true; return () => { focused.current = false; }; }, []));
  useEffect(() => () => discardProfilePhoto(photoRef.current), []);
  const alive = () => focused.current && !!owner && authentication.getSnapshot().account?.id === owner;
  const replacePhoto = (next: PreparedProfilePhoto | null) => { discardProfilePhoto(photoRef.current); photoRef.current = next; setPhoto(next); };
  const choose = async (preset?: number) => {
    if (lock.current || auth.busy || registration.busy) return;
    lock.current = true; setWorking(true); setMessage('');
    try {
      const next = preset === undefined ? await pickProfilePhoto() : await prepareSignupPreset(preset);
      if (!alive()) { discardProfilePhoto(next); return; }
      if (next) { replacePhoto(next); setPicture('uploaded'); }
    } catch (error) { if (alive()) setMessage(error instanceof StorageError ? error.message : '사진을 준비하지 못했어요. 다시 선택해 주세요.'); }
    finally { lock.current = false; if (focused.current) setWorking(false); }
  };
  const complete = async () => {
    const policy = registration.policy;
    if (!alive() || lock.current || !policy || !auth.account || auth.busy || registration.busy) return;
    lock.current = true; setWorking(true); setMessage('');
    try {
      const value = signupNickname(nickname, auth.account.name);
      if (value !== auth.account.name || picture !== auth.account.picture || photo) {
        const saved = await authentication.saveProfile({ nickname: value, picture }, photo ?? undefined);
        if (!alive() || !saved) return;
        replacePhoto(null);
      }
      if (!alive()) return;
      const saved = await membership.accept({ policyId: policy.id, terms: true, privacy: true });
      if (saved && alive()) openServiceTab('/account');
    } catch (error) { if (alive()) setMessage(error instanceof StorageError ? error.message : '가입 정보를 저장하지 못했어요. 다시 시도해 주세요.'); }
    finally { lock.current = false; if (focused.current) setWorking(false); }
  };
  const busy = working || auth.busy || registration.busy;
  const body = !auth.account ? <Button label="로그인하고 계속하기" onPress={() => router.replace('/account-entry')} />
    : registration.owner !== owner || registration.status === 'idle' || registration.status === 'loading' ? <ActivityIndicator accessibilityLabel="가입 상태 확인 중" />
    : registration.status === 'complete' ? <View style={{ gap: 20 }}><AppText testID="signup-done">가입 절차를 완료했어요.</AppText><Button label="마이페이지로 돌아가기" onPress={() => openServiceTab('/account')} /></View>
    : registration.status === 'required' && registration.policy ? <>
      <AppText variant="label" style={{ color: c.muted }}>기존 계정도 같은 약관을 확인해 주세요. 저장한 코스와 러닝 기록은 유지됩니다.</AppText>
      <View style={{ alignSelf: 'center', height: 120, width: 120, borderRadius: 60, overflow: 'hidden', borderWidth: 1, borderColor: c.border, justifyContent: 'center', alignItems: 'center' }}>
        {photoUrl ? <Image source={{ uri: photoUrl }} style={{ width: 120, height: 120 }} accessibilityLabel="선택한 프로필 사진" />
          : <AppText variant="metric" weight="bold" accessibilityLabel="기본 프로필 이미지">{[...suggestedNickname(nickname)][0]}</AppText>}
      </View>
      <ConsentForm key={registration.policy.id} policy={registration.policy} email={auth.account.email} nickname={nickname} onNickname={setNickname}
        busy={busy} message={message || registration.message || auth.message} onSubmit={() => { void complete(); }} profile={<View style={{ gap: 16 }}>
          <AppText variant="heading" weight="bold">프로필 이미지 (선택)</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="연결 계정 사진 사용" disabled={busy} onPress={() => { replacePhoto(null); setPicture('provider'); }}
              style={{ width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: picture === 'provider' ? c.action : c.border, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
              {auth.account.avatarUrl ? <Image source={{ uri: auth.account.avatarUrl }} style={{ width: 56, height: 56 }} accessible={false} /> : <AppText weight="bold">{[...suggestedNickname(auth.account.name)][0]}</AppText>}
            </Pressable>
            {profilePhotosEnabled && presetSlots.map(([x, y], index) => <Pressable key={index} testID={`signup-preset-${index}`} accessibilityRole="button" accessibilityLabel={`러너 이미지 ${index + 1}`} disabled={busy} onPress={() => { void choose(index); }}
              style={{ width: 60, height: 60, borderRadius: 30, overflow: 'hidden' }}>
              <Image source={presetSource} style={{ position: 'absolute', width: 331.5, height: 165.75, left: -x, top: -y }} contentFit="fill" accessible={false} />
            </Pressable>)}
            {profilePhotosEnabled && <Pressable testID="signup-photo" accessibilityRole="button" accessibilityLabel="내 사진 선택" disabled={busy} onPress={() => { void choose(); }}>
              <Image source={require('../../../assets/signup/gallery.svg')} style={{ width: 60, height: 60 }} accessible={false} />
            </Pressable>}
          </View>
          <Button label="닉네임 기본 이미지 사용" compact variant="outline" disabled={busy} onPress={() => { replacePhoto(null); setPicture('initials'); }} />
          <AppText variant="caption" style={{ color: c.muted }}>사진은 선택 사항이에요. 위치 권한은 위치 기능을 사용할 때 요청해요.</AppText>
        </View>} />
    </> : <View style={{ gap: 20 }}>
      <AppText accessibilityRole="alert">{registration.message || '가입 약관을 준비하고 있어요. 기존 기능은 계속 이용할 수 있어요.'}</AppText>
      <Button label="가입 상태 다시 확인" onPress={() => { void membership.reload(); }} />
      <Button label="마이페이지로 돌아가기" variant="outline" onPress={() => openServiceTab('/account')} />
    </View>;
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
    <ScrollView testID="signup-details" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 30, paddingTop: 24, paddingBottom: 40, gap: 30, width: '100%', maxWidth: 440, alignSelf: 'center' }}>
      <SignupBrand />{body}
    </ScrollView>
  </KeyboardAvoidingView>;
}
