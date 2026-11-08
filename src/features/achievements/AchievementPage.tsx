import type { PropsWithChildren } from 'react';
import { ScrollView,View } from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ServiceHeader } from '@/features/service/ServiceHeader';
import { BottomTabBar } from '@/components/navigation/BottomTabBar';
import { serviceTabs } from '@/features/service/navigation';
import { openServiceTab } from '@/features/service/open-service-tab';
import { useThemeColors } from '@/theme/ThemeProvider';
export function AchievementPage({title,children,gutter=24}:{title:string;gutter?:number}&PropsWithChildren){
 const c=useThemeColors(),insets=useSafeAreaInsets();
 return <View style={{flex:1,backgroundColor:c.background}}>
  <Stack.Screen options={{title,header:()=> <ServiceHeader title={title} back menu={false}/>}}/>
  <ScrollView contentContainerStyle={{padding:gutter,paddingBottom:36,gap:24,flexGrow:1,maxWidth:680,width:'100%',alignSelf:'center'}}>{children}</ScrollView>
  <BottomTabBar value="account" bottomInset={insets.bottom} onChange={value=>{const tab=serviceTabs.find(t=>t.value===value);if(tab)openServiceTab(tab.href);}}/>
 </View>;
}
