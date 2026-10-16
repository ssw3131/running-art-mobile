import { useState } from 'react';
import { ScrollView, Pressable, View } from 'react-native';
import { Stack } from 'expo-router';
import { AppText, Icon } from '@/components/ui';
import { frequentlyAskedQuestions } from '@/modules/support/content';
import { useThemeColors } from '@/theme/ThemeProvider';

export default function FaqScreen() {
  const colors = useThemeColors();
  const [open, setOpen] = useState<string | null>('about');
  return <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 28, paddingTop: 40, paddingBottom: 48, maxWidth: 680, width: '100%', alignSelf: 'center' }}>
    <Stack.Screen options={{ title: '자주 묻는 질문' }} />
    {frequentlyAskedQuestions.map(item => <View key={item.id} style={{ borderBottomWidth: 1, borderColor: colors.divider, paddingVertical: 6 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open === item.id }} testID={`faq-${item.id}`}
        onPress={() => setOpen(open === item.id ? null : item.id)} style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 8 }}>
        <AppText weight="bold" style={{ flex: 1 }}>{item.title}</AppText>
        <View style={{ transform: [{ rotate: open === item.id ? '90deg' : '0deg' }] }}><Icon name="chevronRight" /></View>
      </Pressable>
      {open === item.id && <View style={{ padding: 14, marginBottom: 6, backgroundColor: colors.navigation, borderRadius: 10 }}>
        <AppText variant="label" style={{ color: colors.subtle }}>{item.body}</AppText>
      </View>}
    </View>)}
  </ScrollView>;
}
