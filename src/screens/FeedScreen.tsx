import React from 'react';
import { View, Text } from 'react-native';

export default function FeedScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: '#0B1020', padding: 16 }}>
      <Text style={{ color: 'white', fontSize: 20, fontWeight: '700', marginBottom: 8 }}>
        Feed
      </Text>
      <Text style={{ color: '#9CA3AF' }}>
        Your friends’ drives and posts will show up here.
      </Text>
    </View>
  );
}
