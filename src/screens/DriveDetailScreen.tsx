// src/screens/DriveDetailScreen.tsx
import React, { useMemo, useRef } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import MapView, { Polyline, Marker } from 'react-native-maps';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useDrives } from '../state/useDrives';
import { distanceKm as distFn, durationSec as durFn, avgKmh as avgFn } from '../lib/stats';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'DriveDetail'>;

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1f2937' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#e5e7eb' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1f2937' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#334155' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0b1020' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0b1320' }] },
];

function fmtDate(ts: number) {
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch {
    return '';
  }
}
function fmtDuration(totalSec: number) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}

export default function DriveDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const drive = useDrives((s) => s.drives.find((d) => d.id === id));
  const mapRef = useRef<MapView | null>(null);

  if (!drive || drive.points.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0B1020', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <Text style={{ color: 'white' }}>Drive not found.</Text>
      </View>
    );
  }

  // Recompute core stats (defensive) and pre-derive coordinates
  const coords = useMemo(
    () => drive.points.map((p) => ({ latitude: p.lat, longitude: p.lng })),
    [drive.points]
  );
  const distanceKm = useMemo(() => distFn(drive.points), [drive.points]);
  const durationSec = useMemo(() => durFn(drive.points), [drive.points]);
  const avgSpeed = useMemo(() => avgFn(distanceKm, durationSec), [distanceKm, durationSec]);

  const start = drive.points[0];
  const end = drive.points[drive.points.length - 1];

  // Fit the whole route nicely once map lays out
  const fitRoute = () => {
    if (mapRef.current && coords.length > 1) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 24, right: 24, bottom: 24, left: 24 },
        animated: false,
      });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0B1020' }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Meta row (date) */}
        <Text style={{ color: '#9CA3AF', marginBottom: 6 }}>
          {fmtDate(drive.startedAt)}
        </Text>

        {/* Title */}
        <Text style={{ color: 'white', fontSize: 24, fontWeight: '800' }} numberOfLines={2}>
          {drive.title || 'Drive'}
        </Text>

        {/* Optional description */}
        {!!drive.description && (
          <Text style={{ color: '#cbd5e1', marginTop: 8 }}>
            {drive.description}
          </Text>
        )}

        {/* Stat tiles */}
        <View
          style={{
            marginTop: 16,
            flexDirection: 'row',
            gap: 10,
          }}
        >
          <StatTile label="Distance" value={`${distanceKm.toFixed(2)} km`} />
          <StatTile label="Time" value={fmtDuration(durationSec)} />
          <StatTile label="Avg" value={`${avgSpeed.toFixed(1)} km/h`} />
        </View>

        {/* Map card */}
        <View
          style={{
            marginTop: 16,
            backgroundColor: '#0F172A',
            borderRadius: 16,
            borderWidth: 1,
            borderColor: '#1f2937',
            overflow: 'hidden',
          }}
        >
          <MapView
            ref={mapRef}
            style={{ width: '100%', height: 300 }}
            showsUserLocation={false}
            customMapStyle={darkMapStyle as any}
            onMapReady={fitRoute}
            onLayout={fitRoute}
          >
            {coords.length > 1 && (
              <Polyline
                coordinates={coords}
                strokeWidth={4}
                strokeColor="#f97316" // a pop of orange like the reference
              />
            )}

            {/* Start/End pins */}
            <Marker
              coordinate={{ latitude: start.lat, longitude: start.lng }}
              title="Start"
              pinColor="#10b981"
            />
            {coords.length > 1 && (
              <Marker
                coordinate={{ latitude: end.lat, longitude: end.lng }}
                title="End"
                pinColor="#ef4444"
              />
            )}
          </MapView>
        </View>

        {/* Bottom actions (optional) */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={{
              flex: 1,
              paddingVertical: 12,
              backgroundColor: '#1f2937',
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#374151',
              alignItems: 'center',
            }}
          >
            <Text style={{ color: 'white', fontWeight: '700' }}>Back</Text>
          </Pressable>
          {/* Add future buttons here: Share, Export GPX, Delete, etc. */}
        </View>
      </ScrollView>
    </View>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#0F172A',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#1f2937',
        paddingVertical: 14,
        paddingHorizontal: 12,
      }}
    >
      <Text style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 4 }}>{label}</Text>
      <Text style={{ color: 'white', fontSize: 18, fontWeight: '800' }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
