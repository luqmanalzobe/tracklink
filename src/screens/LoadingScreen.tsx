import React, { useEffect } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { useDrives } from '../state/useDrives';

export default function LoadingScreen({ navigation }: any) {
  const hydrate = useDrives((s) => s._hydrate);

  useEffect(() => {
    (async () => {
      // Pretend-load: hydrate saved drives; add any other boot tasks here
      await hydrate();
      navigation.replace('Welcome'); // jump to welcome when ready
    })();
  }, [hydrate, navigation]);

  return (
    <View style={{ flex: 1, backgroundColor: '#0B1020', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: 'white', fontSize: 24, fontWeight: '700', marginBottom: 12 }}>Tracklink</Text>
      <ActivityIndicator size="large" />
      <Text style={{ color: 'white', opacity: 0.7, marginTop: 8 }}>Loading…</Text>
    </View>
  );
}
