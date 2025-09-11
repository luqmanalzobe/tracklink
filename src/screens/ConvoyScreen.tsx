import React from 'react';
import { View, Text, Pressable } from 'react-native';

export default function ConvoyScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: '#0B1020', padding: 16 }}>
      <Text style={{ color: 'white', fontSize: 20, fontWeight: '700', marginBottom: 8 }}>
        Convoys
      </Text>
      <Text style={{ color: '#9CA3AF' }}>
        Create and join live convoys. Real-time location sharing (privacy-first) coming soon.
      </Text>

      <Pressable
        style={{ marginTop: 16, backgroundColor: '#4f46e5', padding: 12, borderRadius: 10, alignItems: 'center' }}
        onPress={() => {}}
      >
        <Text style={{ color: 'white', fontWeight: '700' }}>Start a Convoy (soon)</Text>
      </Pressable>
    </View>
  );
}
