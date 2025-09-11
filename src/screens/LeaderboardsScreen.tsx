import React from 'react';
import { View, Text } from 'react-native';

export default function LeaderboardsScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: '#0B1020', padding: 16 }}>
      <Text style={{ color: 'white', fontSize: 20, fontWeight: '700', marginBottom: 8 }}>
        Leaderboards
      </Text>
      <Text style={{ color: '#9CA3AF' }}>
        Track leaderboards, segment times, and track-day results will appear here.
      </Text>
    </View>
  );
}
