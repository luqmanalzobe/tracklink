import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, Alert } from 'react-native';
import PlacesSearch from '../../components/PlacesSearch';
import { createConvoy, joinConvoyByCode, setDestination } from '../../features/convoy/api';
import type { Convoy } from '../../features/convoy/types';

const DEVICE_ID = `dev-${Math.random().toString(36).slice(2,8)}`; // dev-only id; replace with real auth later

export default function ConvoyHomeScreen({ navigation }: any) {
  const [myName, setMyName] = useState<string>('');
  const [code, setCode] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  const onCreate = async () => {
    if (!myName.trim()) return Alert.alert('Name required', 'Enter a display name.');
    try {
      setCreating(true);
      const convoy = await createConvoy('Tracklink Convoy', DEVICE_ID);
      // also join as creator
      await joinConvoyByCode(convoy.code, DEVICE_ID, myName);
      Alert.alert('Convoy created', `Invite code: ${convoy.code}`);
      navigation.navigate('ConvoyMap', { convoyId: convoy.id, myName, deviceId: DEVICE_ID });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not create convoy');
    } finally {
      setCreating(false);
    }
  };

  const onJoin = async () => {
    if (!myName.trim()) return Alert.alert('Name required', 'Enter a display name.');
    if (!code.trim()) return;
    try {
      setJoining(true);
      const convoy = await joinConvoyByCode(code.trim().toUpperCase(), DEVICE_ID, myName);
      navigation.navigate('ConvoyMap', { convoyId: convoy.id, myName, deviceId: DEVICE_ID });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not join convoy');
    } finally {
      setJoining(false);
    }
  };

  const onPickDestination = async (convoyId: string, lat: number, lng: number) => {
    try {
      await setDestination(convoyId, lat, lng);
      Alert.alert('Destination set', 'Shared with your convoy.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not set destination');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0B1020', padding: 16 }}>
      <Text style={{ color: 'white', fontSize: 22, fontWeight: '800', marginBottom: 12 }}>Convoy</Text>

      <Text style={{ color: '#9CA3AF', marginBottom: 6 }}>Your display name</Text>
      <TextInput
        value={myName}
        onChangeText={setMyName}
        placeholder="e.g., Jay"
        placeholderTextColor="#6B7280"
        style={{ backgroundColor: '#111827', color: 'white', borderRadius: 10, paddingHorizontal: 12, height: 44, borderWidth: 1, borderColor: '#1f2937', marginBottom: 14 }}
      />

      <Pressable
        onPress={onCreate}
        disabled={creating}
        style={{ backgroundColor: '#10b981', padding: 12, borderRadius: 10, alignItems: 'center' }}
      >
        <Text style={{ color: 'white', fontWeight: '800' }}>{creating ? 'Creating…' : 'Create convoy'}</Text>
      </Pressable>

      <View style={{ height: 18 }} />

      <Text style={{ color: '#9CA3AF', marginBottom: 6 }}>Have a code?</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          placeholder="ABC123"
          placeholderTextColor="#6B7280"
          autoCapitalize="characters"
          style={{ flex: 1, backgroundColor: '#111827', color: 'white', borderRadius: 10, paddingHorizontal: 12, height: 44, borderWidth: 1, borderColor: '#1f2937' }}
        />
        <Pressable onPress={onJoin} disabled={joining} style={{ backgroundColor: '#4f46e5', paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: 'white', fontWeight: '800' }}>{joining ? 'Joining…' : 'Join'}</Text>
        </Pressable>
      </View>

      <View style={{ height: 24 }} />

      <Text style={{ color: 'white', fontWeight: '700', marginBottom: 8 }}>Set destination (once in a convoy)</Text>
      <PlacesSearch
        placeholder="Search a destination (after you create/join)"
        onPlaceSelected={({ lat, lng }) => {
          if (!code) {
            Alert.alert('Tip', 'Create or join a convoy first, then set destination in the map screen.');
          }
        }}
      />

      <Text style={{ color: '#9CA3AF', marginTop: 16 }}>
        After creating or joining, you’ll land on the **Convoy Map** where you can share your live location and see friends.
      </Text>
    </View>
  );
}
