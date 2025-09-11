import React from 'react';
import { View, Text, Pressable, Image } from 'react-native';

export default function WelcomeScreen({ navigation }: any) {
  return (
    <View style={{ flex: 1, backgroundColor: '#0B1020', padding: 24, justifyContent: 'space-between' }}>
      <View style={{ alignItems: 'center', marginTop: 40 }}>
        {/* Optional logo */}
        {/* <Image source={require('../../assets/logo.png')} style={{ width: 120, height: 120, marginBottom: 16 }} /> */}
        <Text style={{ color: 'white', fontSize: 36, fontWeight: '800' }}>Tracklink</Text>
        <Text style={{ color: 'white', opacity: 0.7, fontSize: 16, marginTop: 8, textAlign: 'center' }}>
          Record drives, view stats, and build your garage. Convoys and leaderboards coming soon.
        </Text>
      </View>

      <View style={{ gap: 12 }}>
        <Pressable
          onPress={() => navigation.replace('Tabs')}
          style={{ backgroundColor: '#4f46e5', padding: 16, borderRadius: 12, alignItems: 'center' }}
        >
          <Text style={{ color: 'white', fontSize: 16, fontWeight: '700' }}>Enter Tracklink</Text>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate('Record')}
          style={{ backgroundColor: '#1f2937', padding: 16, borderRadius: 12, alignItems: 'center' }}
        >
          <Text style={{ color: 'white' }}>Start Recording</Text>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate('Drives')}
          style={{ backgroundColor: '#1f2937', padding: 16, borderRadius: 12, alignItems: 'center' }}
        >
          <Text style={{ color: 'white' }}>View Saved Drives</Text>
        </Pressable>

        {/* Disabled placeholders for future features */}
        <View style={{ opacity: 0.5 }}>
          <Pressable style={{ backgroundColor: '#111827', padding: 16, borderRadius: 12, alignItems: 'center' }} disabled>
            <Text style={{ color: 'white' }}>Convoy (coming soon)</Text>
          </Pressable>
          <Pressable style={{ backgroundColor: '#111827', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 }} disabled>
            <Text style={{ color: 'white' }}>Leaderboards (coming soon)</Text>
          </Pressable>
        </View>
      </View>

      <Text style={{ color: 'white', opacity: 0.5, textAlign: 'center' }}>
        Drive safely. Don’t interact with the app while driving.
      </Text>
    </View>
  );
}
