import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import MapView, { Polyline, Region } from 'react-native-maps';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useDrives } from '../state/useDrives';
import { distanceKm as distFn, durationSec as durFn, avgKmh as avgFn } from '../lib/stats';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'DriveDetail'>;

export default function DriveDetailScreen({ route }: Props) {
  const { id } = route.params;
  const drive = useDrives((s) => s.drives.find((d) => d.id === id));

  if (!drive || drive.points.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <Text>Drive not found.</Text>
      </View>
    );
  }

  const region: Region = useMemo(() => {
    const last = drive.points[drive.points.length - 1];
    return {
      latitude: last.lat,
      longitude: last.lng,
      latitudeDelta: 0.03,
      longitudeDelta: 0.03,
    };
  }, [drive.points]);

  // Recompute (or trust saved values). Recompute to be safe.
  const distanceKm = useMemo(() => distFn(drive.points), [drive.points]);
  const durationSec = useMemo(() => durFn(drive.points), [drive.points]);
  const avgKmh = useMemo(() => avgFn(distanceKm, durationSec), [distanceKm, durationSec]);

  return (
    <View style={{ flex: 1 }}>
      <MapView style={{ flex: 1 }} initialRegion={region} showsUserLocation={false}>
        {drive.points.length > 1 && (
          <Polyline
            coordinates={drive.points.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
            width={4}
          />
        )}
      </MapView>

      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'white',
          padding: 16,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          shadowColor: '#000',
          shadowOpacity: 0.1,
          shadowRadius: 8,
          elevation: 4,
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8 }}>{drive.title}</Text>
        <Text>Distance: {distanceKm.toFixed(2)} km</Text>
        <Text>
          Time: {Math.floor(durationSec / 60)}m {durationSec % 60}s
        </Text>
        <Text>Avg Speed: {avgKmh.toFixed(1)} km/h</Text>
      </View>
    </View>
  );
}
