import { StyleSheet, Text, View } from 'react-native';

import type { MapSurfaceProps } from './types';

export default function MapSurface(_props: MapSurfaceProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>지도는 Android 앱에서 확인해 주세요.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8EDE7' },
  text: { color: '#183C32', fontSize: 17 },
});
