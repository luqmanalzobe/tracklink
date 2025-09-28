// src/screens/DrivesScreen.tsx
import React, { useMemo, useState, useCallback, useRef, memo } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, Alert } from 'react-native';
import MapView, { Polyline, Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useDrives, SavedDrive } from '../state/useDrives';
import type { RootStackParamList } from '../../App';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Tabs'>;

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
  try { return new Date(ts).toLocaleString(); } catch { return ''; }
}
function fmtDuration(totalSec: number) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}

export default function DrivesScreen() {
  const { drives } = useDrives();
  const navigation = useNavigation<Nav>();
  const [refreshing, setRefreshing] = useState(false);

  const data = useMemo(
    () => [...drives].sort((a, b) => (b.startedAt ?? Number(b.id)) - (a.startedAt ?? Number(a.id))),
    [drives]
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 400);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#0B1020' }}>
      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        data={data}
        keyExtractor={(d) => d.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#9CA3AF" />}
        renderItem={({ item }) => (
          <DriveCard
            drive={item}
            onPress={() => navigation.navigate('DriveDetail', { id: item.id })}
            onRunRoute={() => {
              // Navigate to Record screen with route data
              navigation.navigate('Record', { routeToRun: item });
              Alert.alert(
                '🏁 Route Mode Active', 
                'Drive to the green START zone to begin. Recording will start automatically when you enter the zone and stop at the FINISH!',
                [{ text: 'Let\'s Go!', style: 'default' }]
              );
            }}
          />
        )}
        ListHeaderComponent={
          <Text style={{ color: 'white', fontSize: 20, fontWeight: '700', marginBottom: 12 }}>
            Activities
          </Text>
        }
        ListEmptyComponent={
          <Text style={{ color: '#6B7280', marginTop: 24, textAlign: 'center' }}>
            No drives yet. Hit "Start Recording" and go for a cruise.
          </Text>
        }
        removeClippedSubviews
        windowSize={7}
        initialNumToRender={4}
      />
    </View>
  );
}

const DriveCard = memo(function DriveCard({
  drive,
  onPress,
  onRunRoute,
}: {
  drive: SavedDrive;
  onPress: () => void;
  onRunRoute: () => void;
}) {
  const { removeDrive } = useDrives();
  const coords = useMemo(
    () => drive.points.map((p) => ({ latitude: p.lat, longitude: p.lng })),
    [drive.points]
  );
  const start = drive.points[0];
  const end = drive.points[drive.points.length - 1];
  const mapRef = useRef<MapView | null>(null);

  const fit = useCallback(() => {
    if (!mapRef.current) return;
    if (coords.length > 1) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 20, right: 20, bottom: 20, left: 20 },
        animated: false,
      });
    } else if (coords.length === 1) {
      mapRef.current.animateToRegion(
        {
          latitude: coords[0].latitude,
          longitude: coords[0].longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        0
      );
    }
  }, [coords]);

  const confirmDelete = () => {
    Alert.alert('Delete drive?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeDrive(drive.id) },
    ]);
  };

  // Check if this is a looped route (start and end are close)
  const isLoop = useMemo(() => {
    if (!start || !end) return false;
    const R = 6371000; // meters
    const φ1 = start.lat * Math.PI/180;
    const φ2 = end.lat * Math.PI/180;
    const Δφ = (end.lat - start.lat) * Math.PI/180;
    const Δλ = (end.lng - start.lng) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const d = R * c;
    return d < 100; // within 100 meters
  }, [start, end]);

  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: '#0F172A',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#1f2937',
        marginBottom: 14,
        overflow: 'hidden',
      }}
    >
      {/* Header row */}
      <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6, flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: 'white', fontSize: 18, fontWeight: '800' }} numberOfLines={1}>
            {drive.title || 'Drive'}
          </Text>
          <Text style={{ color: '#9CA3AF', marginTop: 2 }} numberOfLines={1}>
            {fmtDate(drive.startedAt)}
          </Text>
        </View>

        {/* Delete button */}
        <Pressable
          onPress={(e) => { e.stopPropagation(); confirmDelete(); }}
          hitSlop={12}
          style={{
            width: 36, height: 36, borderRadius: 18,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: '#1f2937', borderWidth: 1, borderColor: '#374151'
          }}
        >
          <Ionicons name="trash-outline" size={18} color="#ef4444" />
        </Pressable>
      </View>

      {/* Stat row */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 14, paddingBottom: 10, gap: 12 }}>
        <Stat label="Distance" value={`${drive.distanceKm.toFixed(2)} km`} />
        <Stat label="Time" value={fmtDuration(drive.durationSec)} />
        <Stat label="Avg" value={`${drive.avgKmh.toFixed(1)} km/h`} />
      </View>

      {/* Map preview */}
      <View style={{ height: 200, backgroundColor: '#0B1020' }}>
        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          pointerEvents="none"
          showsUserLocation={false}
          customMapStyle={darkMapStyle as any}
          onMapReady={fit}
          onLayout={fit}
        >
          {coords.length > 1 && (
            <Polyline coordinates={coords} strokeWidth={4} strokeColor="#f97316" />
          )}
          {start && (
            <Marker
              coordinate={{ latitude: start.lat, longitude: start.lng }}
              pinColor="#10b981"
              title="Start"
            />
          )}
          {coords.length > 1 && end && (
            <Marker
              coordinate={{ latitude: end.lat, longitude: end.lng }}
              pinColor="#ef4444"
              title="End"
            />
          )}
        </MapView>
      </View>

      {/* Action buttons row */}
      <View style={{ flexDirection: 'row', padding: 14, gap: 10 }}>
        <Pressable
          onPress={(e) => { e.stopPropagation(); onPress(); }}
          style={{
            flex: 1,
            backgroundColor: '#1f2937',
            padding: 12,
            borderRadius: 10,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: '#374151',
          }}
        >
          <Text style={{ color: 'white', fontWeight: '700' }}>View Details</Text>
        </Pressable>
        
        <Pressable
          onPress={(e) => { e.stopPropagation(); onRunRoute(); }}
          style={{
            flex: 1,
            backgroundColor: '#4f46e5',
            padding: 12,
            borderRadius: 10,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: '#6366f1',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <Text style={{ fontSize: 16 }}>🏁</Text>
          <Text style={{ color: 'white', fontWeight: '700' }}>Run Route</Text>
        </Pressable>
      </View>

      {!!drive.description && (
        <Text style={{ color: '#9CA3AF', paddingHorizontal: 14, paddingBottom: 14, paddingTop: 0 }} numberOfLines={3}>
          {drive.description}
        </Text>
      )}
      
      {/* Show if it's a loop route */}
      {isLoop && (
        <View style={{ 
          position: 'absolute', 
          top: 14, 
          right: 60, 
          backgroundColor: '#065f46', 
          paddingHorizontal: 8, 
          paddingVertical: 4, 
          borderRadius: 8 
        }}>
          <Text style={{ color: '#10b981', fontSize: 11, fontWeight: '700' }}>LOOP</Text>
        </View>
      )}
    </Pressable>
  );
});

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#0B1020',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#1f2937',
        paddingVertical: 10,
        paddingHorizontal: 10,
      }}
    >
      <Text style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 2 }}>{label}</Text>
      <Text style={{ color: 'white', fontSize: 16, fontWeight: '800' }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}