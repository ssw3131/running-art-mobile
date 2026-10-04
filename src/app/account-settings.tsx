import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState, Linking, Platform, Switch, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { getStorage } from '@/modules/storage/database';
import { authentication } from '@/modules/auth/runtime';
import { storageErrorMessage } from '@/modules/storage/types';
import type { AccountPreferences } from '@/modules/account/model';
import { useAccountData } from '@/features/account/use-account';
import { AccountButton, AccountCard, AccountPage, accountStyles as s, useAccountColors } from '@/features/account/ui';

export default function AccountSettingsScreen() {
  const data = useAccountData(), colors = useAccountColors(data.preferences.theme);
  const saving = useRef(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [permissions, setPermissions] = useState('확인 중…');
  useFocusEffect(useCallback(() => {
    let current = true;
    const read = async () => {
      if (Platform.OS === 'web') { setPermissions('위치 권한은 Android 앱에서 확인해 주세요.'); return; }
      try {
        const [foreground, background, enabled] = await Promise.all([Location.getForegroundPermissionsAsync(), Location.getBackgroundPermissionsAsync(), Location.hasServicesEnabledAsync()]);
        if (current) setPermissions(`앱 사용 중 위치: ${foreground.granted ? foreground.android?.accuracy === 'fine' ? '정확한 위치 허용' : '대략적인 위치 허용' : '허용 안 함'}\n백그라운드 위치: ${background.granted ? '허용' : '허용 안 함'}\n기기 위치 서비스: ${enabled ? '켜짐' : '꺼짐'}`);
      } catch { if (current) setPermissions('위치 권한을 확인하지 못했어요. 앱 설정에서 확인해 주세요.'); }
    };
    void read();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void read(); });
    return () => { current = false; subscription.remove(); };
  }, []));
  const save = async (next: AccountPreferences) => {
    if (saving.current || !data.ready) return;
    const owner = authentication.getSnapshot().account?.id ?? '';
    saving.current = true; setBusy(true); setMessage('');
    try {
      const store = await getStorage();
      if ((authentication.getSnapshot().account?.id ?? '') !== owner) return;
      const saved = await store.account.savePreferences(next);
      if ((authentication.getSnapshot().account?.id ?? '') === owner) { data.setPreferences(saved); setMessage('설정을 저장했어요.'); }
    } catch (error) { setMessage(storageErrorMessage(error)); }
    finally { saving.current = false; setBusy(false); }
  };
  const toggle = (id: string, title: string, detail: string, key: 'voice' | 'background') => <View style={{ gap: 8 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text style={[s.rowTitle, { flex: 1, color: colors.text }]}>{title}</Text>
      <Switch testID={id} accessibilityLabel={title} disabled={busy || !data.ready} value={data.preferences.guidance[key]} trackColor={{ true: '#608567' }} onValueChange={value => { void save({ ...data.preferences, guidance: { ...data.preferences.guidance, [key]: value } }); }} /></View>
    <Text style={[s.caption, { color: colors.muted }]}>{detail}</Text>
  </View>;
  return <AccountPage title="설정" colors={colors}>
    {!!data.error && <AccountCard colors={colors}><Text accessibilityRole="alert" style={[s.body, { color: colors.danger }]}>{data.error}</Text><AccountButton id="settings-retry" title="다시 불러오기" colors={colors} onPress={data.reload} /></AccountCard>}
    <AccountCard colors={colors}>
      <Text style={[s.heading, { color: colors.text }]}>계정 화면 테마</Text>
      <Text style={[s.caption, { color: colors.muted }]}>마이페이지·프로필·설정 화면에 적용합니다.</Text>
      {(['system', 'light', 'dark'] as const).map(theme => <AccountButton key={theme} id={`theme-${theme}`} title={`${({ system: '기기 설정 따르기', light: '밝게', dark: '어둡게' })[theme]}${data.preferences.theme === theme ? ' · 선택됨' : ''}`}
        colors={colors} secondary={data.preferences.theme !== theme} disabled={busy || !data.ready} onPress={() => { void save({ ...data.preferences, theme }); }} />)}
    </AccountCard>
    <AccountCard colors={colors}>
      <Text style={[s.heading, { color: colors.text }]}>러닝 안내 기본 설정</Text>
      <Text style={[s.body, { color: colors.muted }]}>새 코스 러닝을 시작할 때 적용됩니다. 진행 중인 러닝은 러닝 화면에서 변경해 주세요.</Text>
      {toggle('setting-voice', '음성 안내', '방향·이탈·복귀 안내를 한국어 음성으로 알려줍니다. 기기의 미디어 음량도 확인해 주세요.', 'voice')}
      {toggle('setting-background', '화면 꺼짐 안내', '끄면 앱을 벗어나거나 화면을 끌 때 코스 러닝이 일시정지됩니다.', 'background')}
      <Text style={[s.rowTitle, { color: colors.text }]}>시작 화면</Text>
      {(['map', 'focus'] as const).map(mode => <AccountButton key={mode} id={`guidance-mode-${mode}`} title={`${mode === 'map' ? '지도 모드' : '집중 모드'}${data.preferences.guidance.mode === mode ? ' · 선택됨' : ''}`}
        colors={colors} secondary={data.preferences.guidance.mode !== mode} disabled={busy || !data.ready} onPress={() => { void save({ ...data.preferences, guidance: { ...data.preferences.guidance, mode } }); }} />)}
    </AccountCard>
    {!!message && <Text testID="settings-message" accessibilityRole="alert" style={[s.body, { color: colors.text }]}>{message}</Text>}
    <AccountCard colors={colors}>
      <Text style={[s.heading, { color: colors.text }]}>위치 권한</Text>
      <Text testID="account-location-permissions" style={[s.body, { color: colors.muted }]}>{permissions}</Text>
      <AccountButton id="open-os-settings" title="기기 앱 설정 열기" disabled={Platform.OS === 'web'} colors={colors} secondary onPress={() => { void Linking.openSettings().catch(() => setMessage('기기 설정을 열지 못했어요. Android 설정에서 RunPen 앱 권한을 확인해 주세요.')); }} />
      <Text style={[s.caption, { color: colors.muted }]}>이 화면을 열기만 해서는 위치를 수집하거나 권한을 요청하지 않습니다.</Text>
    </AccountCard>
    <Text style={[s.caption, { color: colors.muted }]}>이 설정은 현재 기기에 계정별로 저장됩니다. 비로그인 설정과 다른 계정의 설정은 별도로 유지됩니다.</Text>
  </AccountPage>;
}
