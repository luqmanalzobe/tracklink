import React from 'react';
import { View, Text, FlatList, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useDrives } from '../state/useDrives';
import type { RootStackParamList } from '../../App';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Tabs'>;

export default function DrivesScreen() {
  const { drives } = useDrives();
  const navigation = useNavigation<Nav>();

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 8 }}>Saved Drives</Text>

      <FlatList
        data={drives}
        keyExtractor={(d) => d.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.navigate('DriveDetail', { id: item.id })}
            style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' }}
          >
            <Text style={{ fontWeight: '600' }}>{item.title}</Text>
            <Text>
              {item.distanceKm.toFixed(2)} km • {Math.floor(item.durationSec / 60)}m{' '}
              {item.durationSec % 60}s • {item.avgKmh.toFixed(1)} km/h
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={<Text>No drives yet. Go for a cruise!</Text>}
      />
    </View>
  );
}
