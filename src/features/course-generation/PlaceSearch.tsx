import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState, Keyboard, Pressable, View } from 'react-native';
import { AppText, Button, TextField } from '@/components/ui';
import { searchPlaces, type PlaceResult } from '@/modules/map/place-search';
import type { Origin } from '@/modules/route-engine/types';
import { useThemeColors } from '@/theme/ThemeProvider';

export function PlaceSearch({ center, onChoose }: { center: Origin; onChoose(place: PlaceResult): void }) {
  const c = useThemeColors();
  const [query, setQuery] = useState(''), [results, setResults] = useState<PlaceResult[]>([]);
  const [message, setMessage] = useState(''), [loading, setLoading] = useState(false);
  const request = useRef<AbortController | null>(null);
  const cancel = useCallback(() => { request.current?.abort(); request.current = null; setLoading(false); }, []);
  useFocusEffect(useCallback(() => {
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') cancel(); });
    return () => { subscription.remove(); cancel(); };
  }, [cancel]));
  const search = async () => {
    cancel(); setMessage(''); setResults([]);
    if (!query.trim()) { setMessage('검색할 장소나 주소를 입력해 주세요.'); return; }
    const active = new AbortController(); request.current = active; setLoading(true);
    try {
      const places = await searchPlaces(query, center, process.env.EXPO_PUBLIC_MAPTILER_API_KEY, active.signal);
      if (request.current !== active || active.signal.aborted) return;
      setResults(places); if (!places.length) setMessage('검색 결과가 없어요. 다른 이름이나 주소로 검색해 주세요.');
    } catch (error) {
      if (request.current === active && !active.signal.aborted) setMessage(error instanceof Error ? error.message : '검색하지 못했어요.');
    } finally { if (request.current === active) { request.current = null; setLoading(false); } }
  };
  return <View style={{ gap: 8 }}>
    <TextField label="장소·주소 검색" placeholder="현재 위치 또는 장소 검색" testID="place-search-input" value={query} maxLength={120}
      returnKeyType="search" onSubmitEditing={() => void search()} onChangeText={value => { cancel(); setQuery(value); setResults([]); setMessage(''); }} />
    <Button compact variant="outline" label={loading ? '검색 중…' : '장소 검색'} testID="place-search-submit" disabled={loading} onPress={() => void search()} />
    {!!message && <AppText variant="caption" accessibilityLiveRegion="polite">{message}</AppText>}
    {results.map((place, index) => <Pressable key={`${place.id}-${index}`} testID={`place-result-${index}`} accessibilityRole="button"
      accessibilityLabel={`${place.name}, ${place.address}`} onPress={() => { cancel(); setResults([]); setQuery(place.name); Keyboard.dismiss(); onChoose(place); }}
      style={{ padding: 12, gap: 4, borderWidth: 1, borderRadius: 10, borderColor: c.border }}>
      <AppText weight="bold">{place.name}</AppText><AppText variant="caption" style={{ color: c.subtle }}>{place.address}</AppText>
    </Pressable>)}
    {!!results.length && <AppText variant="caption">장소 검색 © MapTiler · © OpenStreetMap contributors</AppText>}
  </View>;
}
