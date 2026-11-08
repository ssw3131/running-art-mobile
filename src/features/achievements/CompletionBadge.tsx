import { useState } from 'react';
import { View } from 'react-native';
import { AppText, Button } from '@/components/ui';
import { AchievementImage } from './AchievementImage';
import { badgeImages } from './badge-images';

export function CompletionBadge({ shape, label, uri, first }: { shape: string; label: string; uri: string | null; first: boolean }) {
  const [attempt, setAttempt] = useState(0), [failed, setFailed] = useState(false);
  const source = badgeImages[shape] ?? (uri ? { uri } : null);
  return <View style={{ minHeight: 170, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
    {source && !failed ? <AchievementImage key={attempt} testID={first ? 'completion-first-badge' : 'completion-badge-image'} source={source}
      contentFit="contain" style={{ width: 170, height: 170 }} accessibilityLabel={`${label} 완주 뱃지`} onError={() => setFailed(true)} />
      : <AppText>{source ? '배지를 불러오지 못했어요.' : `${label} 코스를 완주했어요!`}</AppText>}
    {source && failed && <Button compact variant="outline" label="배지 다시 불러오기" onPress={() => { setFailed(false); setAttempt(value => value + 1); }} />}
  </View>;
}
