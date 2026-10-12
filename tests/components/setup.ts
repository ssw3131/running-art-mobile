import { Platform } from 'react-native';
Platform.OS = 'android';
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('expo-router', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { Link: ({ children, ...props }: any) => React.createElement(Text, props, children),
    useFocusEffect: (effect: any) => React.useEffect(effect, [effect]) };
});
