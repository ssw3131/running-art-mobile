import { Tabs } from 'expo-router';
import { Keyboard } from 'react-native';
import { BottomTabBar } from '@/components/navigation/BottomTabBar';
import { ServiceHeader } from '@/features/service/ServiceHeader';
import { serviceTabs } from '@/features/service/navigation';

export default function ServiceTabsLayout() {
  return <Tabs initialRouteName="index" backBehavior="initialRoute" screenOptions={{ lazy: true, freezeOnBlur: false }}
    tabBar={({ state, navigation, insets }) => <BottomTabBar bottomInset={insets.bottom}
      value={serviceTabs.find(tab => tab.name === state.routes[state.index].name)?.value ?? 'home'}
      onChange={value => {
        const tab = serviceTabs.find(item => item.value === value);
        const route = state.routes.find(item => item.name === tab?.name);
        if (!route) return;
        const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
        if (!event.defaultPrevented) {
          Keyboard.dismiss();
          navigation.navigate({ name: route.name, params: route.params, merge: true });
        }
      }} />}>
    {serviceTabs.map(tab => <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title,
      header: () => <ServiceHeader title={tab.title} brand={tab.value === 'home'} /> }} />)}
  </Tabs>;
}
