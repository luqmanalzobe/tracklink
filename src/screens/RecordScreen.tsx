import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Alert, Text, Modal, Pressable, TextInput } from 'react-native';
import MapView, { Polyline, Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useRecording } from '../state/useRecording';
import { useDrives } from '../state/useDrives';
import { distanceKm, durationSec, avgKmh } from '../lib/stats';
import { TASK_NAME } from '../background/locationTask';
import { SmoothLocationTracker, SMOOTH_NAV_CONFIG, getCameraSettings } from '../utils/smoothNavigation';
import { offsetByMeters, forwardBiasMeters } from '../utils/geo';

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1f2937' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#e5e7eb' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1f2937' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#334155' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0b1020' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0b1320' }] },
];

export default function RecordScreen() {
  const { recording, startTime, points, start, stop, add, reset } = useRecording();
  const { addDrive } = useDrives();

  const mapRef = useRef<MapView | null>(null);
  const smoothTracker = useRef<SmoothLocationTracker | null>(null);
  const lastSpeedRef = useRef<number>(0);
  const lastHeadingRef = useRef<number>(0);
  const followUserRef = useRef<boolean>(true);
  const lastAnimRef = useRef<number>(0);

  const [region, setRegion] = useState<Region>({
    latitude: 43.653, longitude: -79.383, latitudeDelta: 0.05, longitudeDelta: 0.05,
  });
  const [followUser, setFollowUser] = useState(true);
  const [currentPosition, setCurrentPosition] = useState<{ latitude: number; longitude: number } | null>(null);

  // Summary modal state + NEW title/description fields
  const [showSummary, setShowSummary] = useState(false);
  const [sumDistanceKm, setSumDistanceKm] = useState(0);
  const [sumDurationSec, setSumDurationSec] = useState(0);
  const [sumAvgKmh, setSumAvgKmh] = useState(0);
  const [driveTitle, setDriveTitle] = useState('');
  const [driveDesc, setDriveDesc] = useState('');

  function inferHeadingFromPoints(ps: { lat: number; lng: number }[]): number | null {
    if (ps.length < 2) return null;
    const a = ps[ps.length - 2], b = ps[ps.length - 1];
    const latA = (a.lat * Math.PI) / 180;
    const latB = (b.lat * Math.PI) / 180;
    const dLon = ((b.lng - a.lng) * Math.PI) / 180;
    const y = Math.sin(dLon) * Math.cos(latB);
    const x = Math.cos(latA) * Math.sin(latB) - Math.sin(latA) * Math.cos(latB) * Math.cos(dLon);
    const brng = Math.atan2(y, x) * 180 / Math.PI;
    return (brng + 360) % 360;
  }

  useEffect(() => {
    (async () => {
      const { status: fg } = await Location.requestForegroundPermissionsAsync();
      if (fg !== 'granted') {
        Alert.alert('Location required', 'Enable location to record drives.');
        return;
      }
      const { status: bg } = await Location.requestBackgroundPermissionsAsync();
      if (bg !== 'granted') console.warn('Background permission not granted');

      const loc = await Location.getCurrentPositionAsync({});
      const initialPos = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setCurrentPosition(initialPos);

      const next: Region = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      setRegion(next);
      mapRef.current?.animateToRegion(next, 500);
    })();
  }, []);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let tracker: SmoothLocationTracker | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      tracker = new SmoothLocationTracker((position, heading) => {
        setCurrentPosition(position);

        if (followUserRef.current && mapRef.current) {
          const now = Date.now();
          if (now - lastAnimRef.current < 300) return;
          lastAnimRef.current = now;

          const speedKmh = lastSpeedRef.current * 3.6;
          const { zoom, pitch } = getCameraSettings(speedKmh);
          let face = heading || lastHeadingRef.current || inferHeadingFromPoints(points) || 0;

          const moving = lastSpeedRef.current > 0.8;
          if (!moving) {
            mapRef.current.animateCamera(
              { center: position, heading: face, pitch: 0, zoom: Math.min(17, getCameraSettings(0).zoom) },
              { duration: 300 }
            );
            return;
          }

          const targetCenter = offsetByMeters(position, forwardBiasMeters(speedKmh, zoom), face);
          mapRef.current.animateCamera(
            { center: targetCenter, heading: face, pitch: recording ? pitch : 0, zoom: recording ? zoom : 17 },
            { duration: SMOOTH_NAV_CONFIG.CAMERA.animationDuration }
          );
        }
      });

      smoothTracker.current = tracker;

      sub = await Location.watchPositionAsync(
        SMOOTH_NAV_CONFIG.GPS,
        (loc) => {
          lastSpeedRef.current = loc.coords.speed ?? 0;
          if (loc.coords.heading && loc.coords.heading > 0) lastHeadingRef.current = loc.coords.heading;
          tracker?.updatePosition(loc);

          if (recording) {
            add({ lat: loc.coords.latitude, lng: loc.coords.longitude, ts: Date.now() });
          }
        }
      );
    })();

    return () => {
      tracker?.stop();
      try { sub?.remove(); } catch {}
    };
  }, [recording, add, points]);

  useEffect(() => { followUserRef.current = followUser; }, [followUser]);

  const liveDistKm = useMemo(() => distanceKm(points), [points]);
  const liveDurSec = useMemo(
    () => (startTime ? Math.floor((Date.now() - startTime) / 1000) : 0),
    [startTime, points.length, recording]
  );
  const liveAvg = useMemo(() => avgKmh(liveDistKm, liveDurSec), [liveDistKm, liveDurSec]);

  const recenter = async () => {
    setFollowUser(true);
    const loc = await Location.getCurrentPositionAsync({});
    const gpsHeading = (loc.coords.heading && loc.coords.heading > 0) ? loc.coords.heading : undefined;
    const inferred = inferHeadingFromPoints(points) ?? 0;
    const face = gpsHeading ?? lastHeadingRef.current ?? inferred;
    const speedKmh = (loc.coords.speed ?? 0) * 3.6;
    const { zoom, pitch } = getCameraSettings(speedKmh);

    const center = (loc.coords.speed ?? 0) > 0.8
      ? offsetByMeters({ latitude: loc.coords.latitude, longitude: loc.coords.longitude }, forwardBiasMeters(speedKmh, zoom), face)
      : { latitude: loc.coords.latitude, longitude: loc.coords.longitude };

    const next: Region = { latitude: center.latitude, longitude: center.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 };
    setRegion(next);

    mapRef.current?.animateCamera(
      { center, heading: face, pitch: (loc.coords.speed ?? 0) > 0.8 && recording ? pitch : 0, zoom: recording ? zoom : 17 },
      { duration: 500 }
    );
  };

  const handleStart = async () => {
    start();
    setFollowUser(true);

    const started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
    if (!started) {
      await Location.startLocationUpdatesAsync(TASK_NAME, {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 2000,
        distanceInterval: 5,
        showsBackgroundLocationIndicator: true,
        pausesUpdatesAutomatically: false,
        foregroundService: { notificationTitle: 'Tracklink Recording', notificationBody: 'Your drive is being recorded.' },
      }).catch((e) => console.warn('startLocationUpdatesAsync failed', e));
    }
  };

  const handleStop = async () => {
    const started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
    if (started) { await Location.stopLocationUpdatesAsync(TASK_NAME).catch(() => {}); }
    stop();

    const d = distanceKm(points);
    const s = durationSec(points);
    const v = avgKmh(d, s);
    setSumDistanceKm(d);
    setSumDurationSec(s);
    setSumAvgKmh(v);

    // Default title/desc
    const now = new Date();
    setDriveTitle(`Drive ${now.toLocaleString()}`);
    setDriveDesc('');
    setShowSummary(true);
  };

  const onSaveDrive = () => {
    const now = Date.now();
    const payload = {
      id: String(now),
      title: driveTitle?.trim() || `Drive ${new Date(now).toLocaleString()}`,
      description: driveDesc?.trim() || '',
      startedAt: points[0]?.ts ?? now,
      endedAt: points[points.length - 1]?.ts ?? now,
      distanceKm: sumDistanceKm,
      durationSec: sumDurationSec,
      avgKmh: sumAvgKmh,
      points: [...points],
    };
    addDrive(payload);
    setShowSummary(false);
    reset();
    Alert.alert('Saved', 'Drive saved. Check the Drives tab.');
  };

  const onDiscard = () => {
    setShowSummary(false);
    reset();
  };

  const handleRegionChange = () => { if (followUser) setFollowUser(false); };

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={region}
        showsUserLocation
        followsUserLocation={false}
        customMapStyle={darkMapStyle as any}
        onPanDrag={handleRegionChange}
        onRegionChangeComplete={handleRegionChange}
      >
        {points.length > 1 && (
          <Polyline
            coordinates={points.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
            strokeWidth={4}
            strokeColor="#4f46e5"
          />
        )}

        {points.length > 0 && (
          <Marker
            coordinate={{ latitude: points[0].lat, longitude: points[0].lng }}
            title="Start"
            pinColor="#10b981"
          />
        )}
        {!recording && points.length > 1 && (
          <Marker
            coordinate={{ latitude: points[points.length - 1].lat, longitude: points[points.length - 1].lng }}
            title="End"
            pinColor="#ef4444"
          />
        )}
      </MapView>

      {/* Stats overlay */}
      <View style={{
        position: 'absolute', top: 40, alignSelf: 'center', backgroundColor: '#0B1020',
        padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#1f2937', minWidth: 200, alignItems: 'center'
      }}>
        <Text style={{ color: 'white', fontSize: 18, fontWeight: '700' }}>
          {recording ? '🔴 Recording' : 'Ready'}
        </Text>
        <Text style={{ color: '#9CA3AF', marginTop: 4 }}>Distance: {liveDistKm.toFixed(2)} km</Text>
        <Text style={{ color: '#9CA3AF' }}>Time: {Math.floor(liveDurSec / 60)}m {liveDurSec % 60}s</Text>
        <Text style={{ color: '#9CA3AF' }}>Avg: {liveAvg.toFixed(1)} km/h</Text>
        {recording && lastSpeedRef.current > 0 && (
          <Text style={{ color: '#4f46e5', marginTop: 4, fontWeight: '600' }}>
            Current: {(lastSpeedRef.current * 3.6).toFixed(1)} km/h
          </Text>
        )}
      </View>

      {/* Recenter */}
      <Pressable
        onPress={recenter}
        style={{
          position: 'absolute', right: 16, bottom: 100, backgroundColor: followUser ? '#4f46e5' : '#1f2937',
          paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: '#111827',
        }}
      >
        <Text style={{ color: 'white', fontWeight: '700' }}>
          {followUser ? 'Following' : 'Recenter'}
        </Text>
      </Pressable>

      {/* Start/Stop */}
      <View style={{ position: 'absolute', bottom: 24, alignSelf: 'center' }}>
        {recording ? (
          <Pressable
            onPress={handleStop}
            style={{ backgroundColor: '#ef4444', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, borderWidth: 1, borderColor: '#111827' }}
          >
            <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>Stop Recording</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={handleStart}
            style={{ backgroundColor: '#10b981', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, borderWidth: 1, borderColor: '#111827' }}
          >
            <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>Start Recording</Text>
          </Pressable>
        )}
      </View>

      {/* Summary + Title/Description */}
      <Modal visible={showSummary} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 16 }}>
          <View style={{ backgroundColor: '#0B1020', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#1f2937' }}>
            <Text style={{ color: 'white', fontSize: 20, fontWeight: '700', marginBottom: 12 }}>Drive Summary</Text>

            <TextInput
              value={driveTitle}
              onChangeText={setDriveTitle}
              placeholder="Title (e.g., Night cruise to the beach)"
              placeholderTextColor="#6B7280"
              style={{ color: 'white', backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#374151', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 }}
            />
            <TextInput
              value={driveDesc}
              onChangeText={setDriveDesc}
              placeholder="Description (optional)"
              placeholderTextColor="#6B7280"
              multiline
              style={{ color: 'white', backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#374151', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12, minHeight: 60 }}
            />

            <Text style={{ color: '#e5e7eb', marginBottom: 4 }}>Distance: {sumDistanceKm.toFixed(2)} km</Text>
            <Text style={{ color: '#e5e7eb', marginBottom: 4 }}>Time: {Math.floor(sumDurationSec / 60)}m {sumDurationSec % 60}s</Text>
            <Text style={{ color: '#e5e7eb', marginBottom: 12 }}>Avg Speed: {sumAvgKmh.toFixed(1)} km/h</Text>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, gap: 12 }}>
              <Pressable onPress={onDiscard} style={{ flex: 1, padding: 12, backgroundColor: '#374151', borderRadius: 8, alignItems: 'center' }}>
                <Text style={{ color: 'white', fontWeight: '600' }}>Discard</Text>
              </Pressable>
              <Pressable onPress={onSaveDrive} style={{ flex: 1, padding: 12, backgroundColor: '#4f46e5', borderRadius: 8, alignItems: 'center' }}>
                <Text style={{ color: 'white', fontWeight: '700' }}>Save Drive</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
