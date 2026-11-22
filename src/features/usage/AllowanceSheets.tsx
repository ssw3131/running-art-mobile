import { router } from 'expo-router';
import { Image } from 'expo-image';
import { View } from 'react-native';
import { AppModal, AppText, Button } from '@/components/ui';
import { freeAllowanceNotice, type UsageKind, type UsageSummary } from '@/modules/usage/model';
import { useThemeColors } from '@/theme/ThemeProvider';
import { GenerationIcon } from '@/features/course-generation/GenerationIcon';

export function AllowanceDiamond({ small = false }: { small?: boolean }) {
  return <Image source={small ? require('../../../assets/usage/figma-20261121/diamond-small.svg') : require('../../../assets/usage/figma-20261121/diamond.svg')} style={{ width: small ? 12 : 20, height: small ? 12 : 20 }} contentFit="contain" accessible={false} />;
}
export function GuestGenerationSheet({ visible, onClose }: { visible: boolean; onClose(): void }) {
  const c = useThemeColors();
  return <AppModal visible={visible} title={'회원가입하고,\n코스를 만들어 볼까요?'} presentation="sheet" sheetHandle dismissOnBackdrop onClose={onClose} contentContainerStyle={{ gap: 6 }}
    footer={<View style={{ gap: 9 }}><Button testID="guest-signup" label="회원 가입하고 무료 혜택 받기" onPress={() => { onClose(); router.push({ pathname: '/account-entry', params: { mode: 'signup' } }); }} /><SheetCancel onPress={onClose} /></View>}>
    <AppText style={{ fontSize: 12, lineHeight: 18, textAlign: 'center', color: c.subtle }}>{'회원가입하면 무료 생성 5회를 받고,\n만든 코스를 저장할 수 있어요.'}</AppText>
    <View style={{ width: 248, maxWidth: '100%', backgroundColor: c.background === '#FFFFFF' ? '#FFEDE8' : c.navigation, borderRadius: 16, minHeight: 113, padding: 10, gap: 8, alignItems: 'center', marginTop: 16 }}>
      <AppText weight="bold" style={{ fontSize: 12, lineHeight: 18, color: c.selected, alignSelf: 'flex-start', paddingLeft: 10 }}>가입 혜택</AppText>
      {([{ label: '무료 코스 생성', value: 5, source: require('../../../assets/usage/figma-20261121/guest-wand.svg'), size: 24 }, { label: '무료 코스 저장', value: 10, source: require('../../../assets/usage/figma-20261121/guest-archive.svg'), size: 22 }] as const).map((item, index) => <View key={item.label} style={{ gap: 8, alignItems: 'center' }}>
        {index === 1 && <Image source={require('../../../assets/usage/figma-20261121/guest-divider.svg')} style={{ width: 216, height: 1 }} accessible={false} />}
        <View style={{ width: 180, flexDirection: 'row', alignItems: 'center', gap: 12 }}><Image source={item.source} style={{ width: item.size, height: item.size }} contentFit="contain" accessible={false} /><AppText weight="bold" style={{ flex: 1, fontSize: 12, lineHeight: 18 }}>{item.label}</AppText><AppText family="roboto" weight="black" style={{ fontSize: 24, lineHeight: 24, color: c.selected }}>{item.value}<AppText weight="black" style={{ fontSize: 12 }}>회</AppText></AppText></View>
      </View>)}
    </View>
    <AppText testID="guest-free-allowance-policy" style={{fontSize:12,lineHeight:18,color:c.muted,textAlign:'center',marginTop:10}}>{freeAllowanceNotice}</AppText>
    <AppText style={{ fontSize: 11, lineHeight: 18, color: c.muted, marginTop: 8 }}>· 카카오, 네이버, 구글 계정으로 빠르게 시작할 수 있어요.</AppText>
  </AppModal>;
}
export function SheetCancel({ onPress, disabled = false }: { onPress(): void; disabled?: boolean }) {
  const c = useThemeColors();
  return <Button label="취소" variant="secondary" disabled={disabled} onPress={onPress} contentStyle={{ backgroundColor: c.surface, minHeight: 50 }} labelStyle={{ color: c.muted, fontSize: 16 }} />;
}
export function ExhaustedAllowanceSheet({ visible, kind, data, onClose, exhausted = true }: { visible: boolean; kind: UsageKind; data: UsageSummary | null; onClose(): void; exhausted?: boolean }) {
  const c = useThemeColors(), label = kind === 'generation' ? '생성' : '저장', row = data?.[kind];
  return <AppModal visible={visible} title={exhausted ? `코스 ${label} 횟수를 모두 사용했어요` : `코스 ${label} 횟수를 추가할까요?`} presentation="sheet" sheetHandle dismissOnBackdrop onClose={onClose} contentContainerStyle={{ gap: 6 }}
    footer={<View style={{ gap: 9 }}><Button testID={`allowance-add-${kind}`} label={`${label} 횟수 추가하기`} leading={<AllowanceDiamond />} onPress={() => { onClose(); router.push('/packs'); }} /><SheetCancel onPress={onClose} /></View>}>
    <AppText style={{ fontSize: 12, lineHeight: 18, textAlign: 'center', color: c.subtle }}>{kind === 'generation' ? '이 설정으로 코스를 생성하려면 생성 횟수를 추가해 주세요.' : '이 코스를 저장하려면 저장 횟수를 추가해 주세요.'}</AppText>
    <View style={{ width: '100%', maxWidth: 328, gap: 19, alignItems: 'center', marginTop: 13 }}>
      <View style={{ width: 244, maxWidth: '100%', minHeight: 48, borderRadius: 16, backgroundColor: c.background === '#FFFFFF' ? '#FFEDE8' : c.navigation, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}><AppText weight="bold" style={{ fontSize: 14 }}>현재</AppText><AppText testID="allowance-exhausted-count" weight="bold" style={{ fontSize: 22, color: c.selected }}>{row ? `${row.used} / ${row.total}` : '—'}</AppText><AppText weight="bold" style={{ fontSize: 14 }}>회 사용</AppText></View>
      <AppText weight="semibold" style={{ fontSize: 14, lineHeight: 24, color: c.muted }}>{`· ${freeAllowanceNotice}\n· 이용권에는 코스 생성·저장 횟수가 함께 포함돼요.\n· 추가 이용권 구매는 준비 중입니다.`}</AppText>
    </View>
  </AppModal>;
}
export function SaveConfirmationSheet({ visible, remaining, onClose, onConfirm, busy = false }: { visible: boolean; remaining: number; onClose(): void; onConfirm(): void; busy?: boolean }) {
  const c = useThemeColors();
  return <AppModal visible={visible} title="이 코스를 저장할까요?" presentation="sheet" sheetHandle dismissOnBackdrop busy={busy} onClose={onClose} contentContainerStyle={{ gap: 10 }}
    footer={<View style={{ gap: 9 }}><Button testID="save-allowance-confirm" label="코스 저장하기" leading={<GenerationIcon name="generate" />} disabled={busy || remaining <= 0} onPress={onConfirm} /><SheetCancel onPress={onClose} disabled={busy} /></View>}>
    <AppText style={{ fontSize: 12, lineHeight: 18, textAlign: 'center', color: c.subtle }}>코스를 저장하면 코스 저장 횟수가 1회 차감돼요.</AppText>
    <View style={{ width: '100%', maxWidth: 288, minHeight: 101, borderRadius: 16, backgroundColor: c.background === '#FFFFFF' ? '#FFEDE8' : c.navigation, alignItems: 'center', justifyContent: 'center', padding: 10, marginTop: 15, gap: 5 }}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>{['현재 남은 횟수', '저장 후'].map((label, index) => <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {index === 1 && <Image source={require('../../../assets/generation/confirmation/arrow.svg')} style={{ width: 24, height: 24 }} contentFit="contain" accessible={false} />}
        <View style={{ minWidth: 72, alignItems: 'center', gap: 2 }}><AppText weight="bold" style={{ fontSize: 10, lineHeight: 14 }}>{label}</AppText><AppText testID={index ? 'save-allowance-after' : 'save-allowance-remaining'} family="roboto" weight="black" style={{ fontSize: 32, lineHeight: 38, color: c.selected }}>{Math.max(0, remaining - index)}<AppText weight="black" style={{ fontSize: 14 }}>회</AppText></AppText></View>
      </View>)}</View>
      <View style={{ backgroundColor: '#FFD0B9', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 2 }}><AppText style={{ fontSize: 10, lineHeight: 14, color: '#AB7C64' }}>저장 시 1회 차감</AppText></View>
    </View>
  </AppModal>;
}
