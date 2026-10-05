import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Alert, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/features/auth/use-auth';
import { authentication, profilePhotosEnabled } from '@/modules/auth/runtime';
import { useAccountData } from '@/features/account/use-account';
import { AccountButton, AccountCard, AccountPage, ProfileAvatar, accountStyles as s, useAccountColors } from '@/features/account/ui';
import type { ProfileInput } from '@/modules/account/model';
import { pickProfilePhoto, discardProfilePhoto } from '@/modules/account/photo-picker';
import type { PreparedProfilePhoto } from '@/modules/account/photo';
import { StorageError } from '@/modules/storage/types';

export default function ProfileScreen() {
  const auth = useAuth();
  return <ProfileEditor key={auth.account?.id ?? 'guest'} />;
}
function ProfileEditor() {
  const auth = useAuth(), data = useAccountData();
  const focused = useRef(false);
  useFocusEffect(useCallback(() => { focused.current = true; return () => { focused.current = false; }; }, []));
  const [nickname, setNickname] = useState(auth.account?.name ?? '');
  const [picture, setPicture] = useState<ProfileInput['picture']>(auth.account?.picture ?? 'provider');
  const [photo, setPhoto] = useState<PreparedProfilePhoto | null>(null);
  const photoRef = useRef<PreparedProfilePhoto | null>(null), pickingRef = useRef(false);
  const [picking, setPicking] = useState(false), [photoMessage, setPhotoMessage] = useState('');
  useEffect(() => () => { discardProfilePhoto(photoRef.current); }, []);
  const replacePhoto = (next: PreparedProfilePhoto | null) => { discardProfilePhoto(photoRef.current); photoRef.current = next; setPhoto(next); };
  const choosePhoto = async () => {
    if (pickingRef.current || auth.busy) return;
    pickingRef.current = true; setPicking(true); setPhotoMessage('');
    try {
      const selected = await pickProfilePhoto();
      if (!focused.current || authentication.getSnapshot().account?.id !== auth.account?.id) { discardProfilePhoto(selected); return; }
      if (selected) { replacePhoto(selected); setPicture('uploaded'); }
    } catch (error) { if (focused.current) setPhotoMessage(error instanceof StorageError ? error.message : '사진을 열지 못했어요. 다시 선택해 주세요.'); }
    finally { pickingRef.current = false; if (focused.current) setPicking(false); }
  };
  const changePicture = (next: ProfileInput['picture']) => { replacePhoto(null); setPicture(next); setPhotoMessage(''); };
  const busy = auth.busy || picking;
  const colors = useAccountColors(data.preferences.theme);
  const dirty = nickname !== auth.account?.name || picture !== auth.account?.picture || !!photo;
  const cancel = () => dirty ? Alert.alert('편집을 취소할까요?', '저장하지 않은 변경 내용은 사라집니다.', [
    { text: '계속 편집', style: 'cancel' }, { text: '편집 취소', onPress: () => router.back() },
  ]) : router.back();
  return <AccountPage title="프로필 편집" colors={colors}>
    <AccountCard colors={colors}>
      {!auth.account ? <Text style={[s.body, { color: colors.text }]}>프로필을 편집하려면 먼저 로그인해 주세요.</Text> : <>
        <View style={{ alignItems: 'center' }}><ProfileAvatar account={{ ...auth.account, name: nickname || auth.account.name }} picture={picture} preview={photo?.uri} colors={colors} /></View>
        <Text style={[s.heading, { color: colors.text }]}>프로필 이미지</Text>
        {profilePhotosEnabled && <AccountButton id="profile-upload-picture" title={photo ? '다른 사진 선택' : '내 사진 선택'} colors={colors} disabled={busy} secondary={picture !== 'uploaded'} onPress={() => { void choosePhoto(); }} />}
        {!!auth.account.photoPath && !photo && <AccountButton id="profile-saved-picture" title={`저장한 사진${picture === 'uploaded' ? ' · 선택됨' : ''}`} colors={colors} disabled={busy} secondary={picture !== 'uploaded'} onPress={() => changePicture('uploaded')} />}
        <AccountButton id="profile-provider-picture" title={`연결 계정 사진${picture === 'provider' ? ' · 선택됨' : ''}`} colors={colors} disabled={busy || !auth.account.avatarUrl} secondary={picture !== 'provider'} onPress={() => changePicture('provider')} />
        <AccountButton id="profile-initials-picture" title={`닉네임 기본 이미지${picture === 'initials' ? ' · 선택됨' : ''}`} colors={colors} disabled={busy} secondary={picture !== 'initials'} onPress={() => changePicture('initials')} />
        {profilePhotosEnabled && <Text style={[s.caption, { color: colors.muted }]}>선택한 사진은 저장을 누르면 프로필에 반영됩니다. 사진의 위치 정보는 보내지 않습니다. 다른 이미지로 저장하면 이전 업로드 사진을 정리합니다.</Text>}
        {!!photoMessage && <Text accessibilityRole="alert" style={[s.body, { color: colors.text }]}>{photoMessage}</Text>}
        {!auth.account.avatarUrl && <Text style={[s.caption, { color: colors.muted }]}>연결 계정에 사용할 수 있는 사진이 없어 기본 이미지를 표시합니다.</Text>}
        <Text nativeID="nickname-label" style={[s.heading, { color: colors.text }]}>닉네임</Text>
        <TextInput testID="profile-nickname" accessibilityLabel="닉네임" accessibilityLabelledBy="nickname-label" value={nickname} onChangeText={setNickname} editable={!busy} autoCorrect={false} maxLength={80}
          returnKeyType="done" placeholder="닉네임을 입력해 주세요" placeholderTextColor={colors.muted} style={[s.input, { borderColor: colors.border, color: colors.text }]} />
        <Text style={[s.caption, { color: colors.muted }]}>1~20자 · 다른 사람과 같은 닉네임을 사용할 수 있어요. 연결 계정의 이름과 사진 원본은 바뀌지 않습니다.</Text>
        {!!auth.message && <Text testID="profile-message" accessibilityRole="alert" style={[s.body, { color: colors.text }]}>{auth.message}</Text>}
        {busy && <ActivityIndicator color={colors.accent} accessibilityLabel={picking ? '사진 준비 중' : '프로필 저장 중'} />}
        <AccountButton id="profile-save" title="저장" disabled={busy || !dirty} colors={colors} onPress={() => { void authentication.saveProfile({ nickname, picture }, photo ?? undefined).then(saved => { if (saved && focused.current && authentication.getSnapshot().account?.id === auth.account?.id) router.back(); }); }} />
        <AccountButton id="profile-cancel" title="취소" disabled={busy} colors={colors} secondary onPress={cancel} />
        <Text style={[s.caption, { color: colors.muted }]}>프로필 저장에는 인터넷 연결이 필요합니다. 기록 동기화 설정과 별도로 계정에 저장됩니다.</Text>
      </>}
    </AccountCard>
  </AccountPage>;
}
