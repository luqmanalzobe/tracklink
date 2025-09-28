import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Alert, Text, Modal, Pressable, TextInput } from 'react-native';
import MapView, { Polyline, Marker, Circle, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useRecording } from '../state/useRecording';
import { useDrives } from '../state/useDrives';
import { distanceKm, durationSec, avgKmh } from '../lib/stats';
import { TASK_NAME } from '../background/locationTask';
import { SmoothLocationTracker, SMOOTH_NAV_CONFIG, getCameraSettings } from '../utils/smoothNavigation';
import { offsetByMeters, forwardBiasMeters, haversineMeters } from '../utils/geo';
import type { SavedDrive } from '../state/useDrives';

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1f2937' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#e5e7eb' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1f2937' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#334155' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0b1020' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0b1320' }] },
];

const START_RADIUS = 15;
const END_RADIUS = 15;

type Props = { route: any; navigation: any };

export default function RecordScreen({ route: navRoute, navigation }: Props) {
  const { recording, startTime, points, start, stop, add, reset } = useRecording();
  const { addDrive } = useDrives();

  // Route replay
  const routeToRun = navRoute?.params?.routeToRun as SavedDrive | undefined;
  const isRouteMode = !!routeToRun;

  // Route state
  const [routeModeActive, setRouteModeActive] = useState(false);
  const [routeStarted, setRouteStarted] = useState(false);
  const [routeEnded, setRouteEnded] = useState(false);
  const [nearStart, setNearStart] = useState(false);
  const [nearEnd, setNearEnd] = useState(false);

  const mapRef = useRef<MapView | null>(null);
  const smoothTracker = useRef<SmoothLocationTracker | null>(null);
  const lastSpeedRef = useRef<number>(0);
  const lastHeadingRef = useRef<number>(0);

  // --- FOLLOW CAMERA STATE/REFS ---
  const [followUser, setFollowUser] = useState(true);
  const followUserRef = useRef<boolean>(true);
  useEffect(() => { followUserRef.current = followUser; }, [followUser]);

  const lastAnimRef = useRef<number>(0);

  // SINGLE watcher + stable recording flag
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const recordingRef = useRef<boolean>(recording);
  useEffect(() => { recordingRef.current = recording; }, [recording]);

  const [region, setRegion] = useState<Region>({
    latitude: 43.653, longitude: -79.383, latitudeDelta: 0.05, longitudeDelta: 0.05,
  });
  const [currentPosition, setCurrentPosition] = useState<{ latitude: number; longitude: number } | null>(null);

  // Summary modal
  const [showSummary, setShowSummary] = useState(false);
  const [sumDistanceKm, setSumDistanceKm] = useState(0);
  const [sumDurationSec, setSumDurationSec] = useState(0);
  const [sumAvgKmh, setSumAvgKmh] = useState(0);
  const [driveTitle, setDriveTitle] = useState('');
  const [driveDesc, setDriveDesc] = useState('');

  const [originalTime, setOriginalTime] = useState<number | null>(null);

  const routeStart = useMemo(
    () => routeToRun ? { lat: routeToRun.points[0].lat, lng: routeToRun.points[0].lng } : null,
    [routeToRun]
  );
  const routeEnd = useMemo(
    () => routeToRun ? { lat: routeToRun.points[routeToRun.points.length - 1].lat, lng: routeToRun.points[routeToRun.points.length - 1].lng } : null,
    [routeToRun]
  );

  useEffect(() => {
    if (isRouteMode && !routeModeActive) {
      setRouteModeActive(true);
      setOriginalTime(routeToRun?.durationSec || null);
    }
  }, [isRouteMode, routeToRun, routeModeActive]);

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

  const animateFollowCamera = (
    position: { latitude: number; longitude: number },
    headingDeg: number | undefined,
    speedMps: number | undefined
  ) => {
    if (!mapRef.current) return;
    if (!followUserRef.current && !recording) return;

    const now = Date.now();
    if (now - lastAnimRef.current < 250) return;
    lastAnimRef.current = now;

    const speed = Math.max(0, speedMps ?? 0);
    const speedKmh = speed * 3.6;
    const { zoom, pitch } = getCameraSettings(speedKmh);
    let face = headingDeg && headingDeg > 0 ? headingDeg : (inferHeadingFromPoints(points) ?? lastHeadingRef.current ?? 0);

    const moving = speed > 0.8;
    const center = moving
      ? offsetByMeters(position, forwardBiasMeters(speedKmh, zoom), face)
      : position;

    mapRef.current.animateCamera(
      {
        center,
        heading: face,
        pitch: moving && (recording || followUserRef.current) ? pitch : 0,
        zoom: recording ? zoom : Math.min(17, zoom),
      },
      { duration: moving ? SMOOTH_NAV_CONFIG.CAMERA.animationDuration : 300 }
    );
  };

  const enableFollowAndRecenter = async () => {
    setFollowUser(true);
    try {
      const loc = await Location.getCurrentPositionAsync({});
      const pos = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      animateFollowCamera(pos, loc.coords.heading, loc.coords.speed);
    } catch {}
  };

  const handleRegionChange = () => {
    if (recording) return;            // keep following while recording
    if (followUserRef.current) setFollowUser(false);
  };

  // Initial position + focus behavior
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

      if (isRouteMode && routeStart) {
        const next: Region = { latitude: routeStart.lat, longitude: routeStart.lng, latitudeDelta: 0.005, longitudeDelta: 0.005 };
        setRegion(next);
        mapRef.current?.animateToRegion(next, 500);
      } else {
        const next: Region = { latitude: initialPos.latitude, longitude: initialPos.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 };
        setRegion(next);
        mapRef.current?.animateToRegion(next, 500);
      }
    })();
  }, [isRouteMode, routeStart]);

  // Route mode geofencing
  useEffect(() => {
    if (!routeModeActive || !currentPosition || !routeStart || !routeEnd) return;

    const distToStart = haversineMeters(currentPosition, { latitude: routeStart.lat, longitude: routeStart.lng });
    const distToEnd = haversineMeters(currentPosition, { latitude: routeEnd.lat, longitude: routeEnd.lng });

    setNearStart(distToStart < START_RADIUS * 2);
    setNearEnd(distToEnd < END_RADIUS * 2);

    if (!routeStarted && !recording && distToStart < START_RADIUS) {
      setRouteStarted(true);
      handleStart();
      Alert.alert('🟢 GO!', 'Route recording started!');
    }

    if (routeStarted && recording && !routeEnded && distToEnd < END_RADIUS && points.length > 10) {
      setRouteEnded(true);
      handleStop();
    }
  }, [currentPosition, routeModeActive, routeStart, routeEnd, recording, routeStarted, routeEnded, points.length]);

  // SINGLE watchPositionAsync instance
  useEffect(() => {
    let tracker: SmoothLocationTracker | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      tracker = new SmoothLocationTracker((position, heading) => {
        // no-op here; we drive camera from raw GPS below for consistency
      });

      smoothTracker.current = tracker;

      try { watchRef.current?.remove(); } catch {}
      watchRef.current = await Location.watchPositionAsync(
        SMOOTH_NAV_CONFIG.GPS,
        (loc) => {
          lastSpeedRef.current = loc.coords.speed ?? 0;
          if (loc.coords.heading && loc.coords.heading > 0) lastHeadingRef.current = loc.coords.heading;
          tracker?.updatePosition(loc);

          const pos = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          setCurrentPosition(pos);

          // Follow camera while moving
          animateFollowCamera(pos, loc.coords.heading, loc.coords.speed);

          if (recordingRef.current) {
            add({ lat: pos.latitude, lng: pos.longitude, ts: Date.now() });
          }
        }
      );
    })();

    return () => {
      try { watchRef.current?.remove(); } catch {}
      watchRef.current = null;
      tracker?.stop();
    };
  }, []); // mount once

  const liveDistKm = useMemo(() => distanceKm(points), [points]);
  const liveDurSec = useMemo(
    () => (startTime ? Math.floor((Date.now() - startTime) / 1000) : 0),
    [startTime, points.length, recording]
  );
  const liveAvg = useMemo(() => avgKmh(liveDistKm, liveDurSec), [liveDistKm, liveDurSec]);

  const handleStart = async () => {
    if (recording) return;
    start();
    setFollowUser(true);

    try {
      const started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
      if (started) { try { await Location.stopLocationUpdatesAsync(TASK_NAME); } catch {} }
      await Location.startLocationUpdatesAsync(TASK_NAME, {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 2000,
        distanceInterval: 5,
        showsBackgroundLocationIndicator: true,
        pausesUpdatesAutomatically: false,
        foregroundService: {
          notificationTitle: isRouteMode ? 'Tracklink Route Run' : 'Tracklink Recording',
          notificationBody: isRouteMode ? 'Running your route...' : 'Your drive is being recorded.',
        },
      });
    } catch (e) {
      console.warn('startLocationUpdatesAsync failed', e);
    }
  };

  const handleStop = async () => {
    const pts = [...points];

    try {
      const started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
      if (started) { await Location.stopLocationUpdatesAsync(TASK_NAME); }
    } catch {}

    stop();

    const d = distanceKm(pts);
    const s = durationSec(pts);
    const v = avgKmh(d, s);
    setSumDistanceKm(d);
    setSumDurationSec(s);
    setSumAvgKmh(v);

    const now = new Date();
    if (isRouteMode && routeToRun) {
      setDriveTitle(`${routeToRun.title} - Run ${now.toLocaleDateString()}`);
      const timeDiff = s - (originalTime || 0);
      const faster = timeDiff < 0;
      setDriveDesc(`Route replay • ${faster ? '🏆' : ''} ${Math.abs(timeDiff)}s ${faster ? 'faster' : 'slower'} than original`);
    } else {
      setDriveTitle(`Drive ${now.toLocaleString()}`);
      setDriveDesc('');
    }
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
      originalRouteId: routeToRun?.id,
    };
    addDrive(payload);
    setShowSummary(false);
    reset();

    setRouteModeActive(false);
    setRouteStarted(false);
    setRouteEnded(false);

    if (isRouteMode) {
      Alert.alert('Route Complete! 🎯', 'Your run has been saved. Check the Drives tab to see your time.');
      navigation.reset({ index: 0, routes: [{ name: 'Tabs', params: { screen: 'Drives' } }] });
    } else {
      Alert.alert('Saved', 'Drive saved. Check the Drives tab.');
    }
  };

  const onDiscard = () => {
    setShowSummary(false);
    reset();

    setRouteModeActive(false);
    setRouteStarted(false);
    setRouteEnded(false);

    if (isRouteMode) {
      navigation.reset({ index: 0, routes: [{ name: 'Tabs', params: { screen: 'Drives' } }] });
    }
  };

  const handleExitRoute = async () => {
    setRouteModeActive(false);

    if (recording) {
      try {
        const started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
        if (started) { await Location.stopLocationUpdatesAsync(TASK_NAME).catch(() => {}); }
      } catch {}
      stop();
    }

    setRouteStarted(false);
    setRouteEnded(false);
    setNearStart(false);
    setNearEnd(false);
    reset();

    navigation.reset({ index: 0, routes: [{ name: 'Tabs', params: { screen: 'Drives' } }] });
  };

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
        {isRouteMode && routeToRun && (
          <Polyline
            coordinates={routeToRun.points.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
            strokeWidth={3}
            strokeColor="#6b7280"
            strokeColors={['#6b7280']}
            lineDashPattern={[10, 10]}
          />
        )}

        {points.length > 1 && (
          <Polyline
            coordinates={points.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
            strokeWidth={4}
            strokeColor="#4f46e5"
          />
        )}

        {isRouteMode && routeStart && (
          <>
            <Circle
              center={{ latitude: routeStart.lat, longitude: routeStart.lng }}
              radius={START_RADIUS}
              fillColor={nearStart ? 'rgba(34, 197, 94, 0.4)' : 'rgba(34, 197, 94, 0.2)'}
              strokeColor={nearStart ? '#22c55e' : '#10b981'}
              strokeWidth={nearStart ? 3 : 2}
              zIndex={10}
            />
            <Marker
              coordinate={{ latitude: routeStart.lat, longitude: routeStart.lng }}
              title="START"
              description="Enter zone to begin"
              pinColor="#10b981"
              zIndex={11}
            />
          </>
        )}

        {isRouteMode && routeEnd && (
          <>
            <Circle
              center={{ latitude: routeEnd.lat, longitude: routeEnd.lng }}
              radius={END_RADIUS}
              fillColor={nearEnd ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.2)'}
              strokeColor={nearEnd ? '#ef4444' : '#dc2626'}
              strokeWidth={nearEnd ? 3 : 2}
              zIndex={10}
            />
            <Marker
              coordinate={{ latitude: routeEnd.lat, longitude: routeEnd.lng }}
              title="FINISH"
              description="Enter zone to stop"
              pinColor="#ef4444"
              zIndex={11}
            />
          </>
        )}

        {!isRouteMode && points.length > 0 && (
          <Marker
            coordinate={{ latitude: points[0].lat, longitude: points[0].lng }}
            title="Start"
            pinColor="#10b981"
          />
        )}
        {!isRouteMode && !recording && points.length > 1 && (
          <Marker
            coordinate={{ latitude: points[points.length - 1].lat, longitude: points[points.length - 1].lng }}
            title="End"
            pinColor="#ef4444"
          />
        )}
      </MapView>

      {/* Stats */}
      <View style={{
        position: 'absolute', top: 40, alignSelf: 'center', backgroundColor: '#0B1020',
        padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#1f2937', minWidth: 240, alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84, elevation: 5
      }}>
        {isRouteMode && !routeStarted && (
          <>
            <Text style={{ color: '#fbbf24', fontSize: 16, fontWeight: '800', marginBottom: 4 }}>
              🏁 Route Challenge
            </Text>
            <Text style={{ color: '#e5e7eb', fontSize: 12, marginBottom: 8 }}>
              Drive to START zone ({START_RADIUS}m)
            </Text>
          </>
        )}
        {isRouteMode && routeStarted && !routeEnded && (
          <Text style={{ color: '#22c55e', fontSize: 16, fontWeight: '800', marginBottom: 4 }}>
            🚗 Racing!
          </Text>
        )}
        {isRouteMode && routeEnded && (
          <Text style={{ color: '#fbbf24', fontSize: 16, fontWeight: '800', marginBottom: 4 }}>
            🏆 Finished!
          </Text>
        )}

        <Text style={{ color: 'white', fontSize: 18, fontWeight: '700' }}>
          {recording ? '🔴 Recording' : isRouteMode ? 'Route Mode' : 'Ready'}
        </Text>
        <Text style={{ color: '#9CA3AF', marginTop: 4 }}>Distance: {liveDistKm.toFixed(2)} km</Text>
        <Text style={{ color: '#9CA3AF' }}>Time: {Math.floor(liveDurSec / 60)}m {liveDurSec % 60}s</Text>
        <Text style={{ color: '#9CA3AF' }}>Avg: {liveAvg.toFixed(1)} km/h</Text>
        {recording && lastSpeedRef.current > 0 && (
          <Text style={{ color: '#4f46e5', marginTop: 4, fontWeight: '600' }}>
            Current: {(lastSpeedRef.current * 3.6).toFixed(1)} km/h
          </Text>
        )}
        {isRouteMode && originalTime && recording && (
          <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderColor: '#374151', width: '100%' }}>
            <Text style={{ color: '#9CA3AF', textAlign: 'center' }}>
              Target: {Math.floor(originalTime / 60)}m {originalTime % 60}s
            </Text>
            {liveDurSec > 0 && (
              <Text style={{
                color: liveDurSec < originalTime ? '#22c55e' : '#ef4444',
                fontWeight: '700',
                textAlign: 'center'
              }}>
                {liveDurSec < originalTime ? '🏆 ' : ''}
                {Math.abs(liveDurSec - originalTime)}s {liveDurSec < originalTime ? 'ahead' : 'behind'}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Exit Route */}
      {isRouteMode && !recording && (
        <Pressable
          onPress={handleExitRoute}
          style={{
            position: 'absolute', left: 16, bottom: 100, backgroundColor: '#374151',
            paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: '#111827',
          }}
        >
          <Text style={{ color: 'white', fontWeight: '700' }}>Exit Route</Text>
        </Pressable>
      )}

      {/* Recenter / Follow */}
      <Pressable
        onPress={enableFollowAndRecenter}
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
      {(!isRouteMode || (isRouteMode && nearStart)) && (
        <View style={{ position: 'absolute', bottom: 24, alignSelf: 'center' }}>
          {recording ? (
            <Pressable
              onPress={handleStop}
              disabled={isRouteMode && !nearEnd}
              style={{
                backgroundColor: isRouteMode && !nearEnd ? '#374151' : '#ef4444',
                paddingVertical: 14,
                paddingHorizontal: 32,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: '#111827'
              }}
            >
              <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>
                {isRouteMode && !nearEnd ? 'Drive to FINISH' : 'Stop Recording'}
              </Text>
            </Pressable>
          ) : (
            !isRouteMode && (
              <Pressable
                onPress={handleStart}
                style={{ backgroundColor: '#10b981', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, borderWidth: 1, borderColor: '#111827' }}
              >
                <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>Start Recording</Text>
              </Pressable>
            )
          )}
        </View>
      )}

      {/* Summary */}
      <Modal visible={showSummary} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 16 }}>
          <View style={{ backgroundColor: '#0B1020', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#1f2937' }}>
            <Text style={{ color: 'white', fontSize: 20, fontWeight: '700', marginBottom: 12 }}>
              {isRouteMode ? 'Route Complete! 🎯' : 'Drive Summary'}
            </Text>

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

            {isRouteMode && originalTime && (
              <View style={{
                padding: 12,
                backgroundColor: sumDurationSec < originalTime ? '#065f46' : '#7f1d1d',
                borderRadius: 8,
                marginBottom: 12
              }}>
                <Text style={{ color: 'white', fontWeight: '700', textAlign: 'center' }}>
                  {sumDurationSec < originalTime ? '🏆 NEW PERSONAL BEST!' : 'Keep practicing!'}
                </Text>
                <Text style={{ color: '#e5e7eb', textAlign: 'center', marginTop: 4 }}>
                  {Math.abs(sumDurationSec - originalTime)}s {sumDurationSec < originalTime ? 'faster' : 'slower'} than original
                </Text>
              </View>
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, gap: 12 }}>
              <Pressable onPress={onDiscard} style={{ flex: 1, padding: 12, backgroundColor: '#374151', borderRadius: 8, alignItems: 'center' }}>
                <Text style={{ color: 'white', fontWeight: '600' }}>Discard</Text>
              </Pressable>
              <Pressable onPress={onSaveDrive} style={{ flex: 1, padding: 12, backgroundColor: '#4f46e5', borderRadius: 8, alignItems: 'center' }}>
                <Text style={{ color: 'white', fontWeight: '700' }}>Save {isRouteMode ? 'Run' : 'Drive'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
