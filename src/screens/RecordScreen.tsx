import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Button, Alert, Text, Modal, Pressable } from 'react-native';
import MapView, { Polyline, Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useRecording } from '../state/useRecording';
import { useDrives } from '../state/useDrives';
import { distanceKm, durationSec, avgKmh } from '../lib/stats';
import { TASK_NAME } from '../background/locationTask';

export default function RecordScreen() {
  const { recording, startTime, points, start, stop, add, reset } = useRecording();
  const { addDrive } = useDrives();
  const mapRef = useRef<MapView | null>(null);

  const [region, setRegion] = useState<Region>({
    latitude: 43.653, longitude: -79.383, latitudeDelta: 0.05, longitudeDelta: 0.05,
  });

  // Summary modal state
  const [showSummary, setShowSummary] = useState(false);
  const [sumDistanceKm, setSumDistanceKm] = useState(0);
  const [sumDurationSec, setSumDurationSec] = useState(0);
  const [sumAvgKmh, setSumAvgKmh] = useState(0);

  // Permissions + initial center
  useEffect(() => {
    (async () => {
      const { status: fg } = await Location.requestForegroundPermissionsAsync();
      if (fg !== 'granted') {
        Alert.alert('Location required', 'Enable location to record drives.');
        return;
      }
      const { status: bg } = await Location.requestBackgroundPermissionsAsync();
      if (bg !== 'granted') {
        // still allow foreground use; background will fail to start
        console.warn('Background permission not granted');
      }
      const loc = await Location.getCurrentPositionAsync({});
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

  // Foreground follow (optional). Background task feeds points regardless.
  useEffect(() => {
    if (!recording) return;
    const follow = Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 2000, distanceInterval: 5 },
      (loc) => add({ lat: loc.coords.latitude, lng: loc.coords.longitude, ts: Date.now() })
    );
    return () => { follow.then((s) => s.remove()).catch(() => {}); };
  }, [recording, add]);

  // Keep region centered on latest point
  useEffect(() => {
    if (points.length > 0) {
      const last = points[points.length - 1];
      const next: Region = { latitude: last.lat, longitude: last.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 };
      setRegion(next);
      mapRef.current?.animateToRegion(next, 300);
    }
  }, [points]);

  const liveDistKm = useMemo(() => distanceKm(points), [points]);
  const liveDurSec = useMemo(
    () => (startTime ? Math.floor((Date.now() - startTime) / 1000) : 0),
    [startTime, points.length, recording]
  );
  const liveAvg = useMemo(() => avgKmh(liveDistKm, liveDurSec), [liveDistKm, liveDurSec]);

  const recenter = async () => {
    const loc = await Location.getCurrentPositionAsync({});
    const next: Region = { latitude: loc.coords.latitude, longitude: loc.coords.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 };
    setRegion(next);
    mapRef.current?.animateToRegion(next, 300);
  };

  const handleStart = async () => {
    start(); // reset points/startTime
    // Start background updates (safe to call even if already started)
    const started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
    if (!started) {
      await Location.startLocationUpdatesAsync(TASK_NAME, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 2000,
        distanceInterval: 5,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'Tracklink Recording',
          notificationBody: 'Your drive is being recorded.',
        },
      }).catch((e) => console.warn('startLocationUpdatesAsync failed', e));
    }
  };

  const handleStop = async () => {
    // Stop background updates if running
    const started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
    if (started) {
      await Location.stopLocationUpdatesAsync(TASK_NAME).catch(() => {});
    }
    stop(); // flip flag

    // Prepare summary
    const d = distanceKm(points);
    const s = durationSec(points);
    const v = avgKmh(d, s);
    setSumDistanceKm(d);
    setSumDurationSec(s);
    setSumAvgKmh(v);
    setShowSummary(true);
  };

  const onSaveDrive = () => {
    const now = Date.now();
    addDrive({
      id: String(now),
      title: `Drive ${new Date(now).toLocaleString()}`,
      startedAt: points[0]?.ts ?? now,
      endedAt: points[points.length - 1]?.ts ?? now,
      distanceKm: sumDistanceKm,
      durationSec: sumDurationSec,
      avgKmh: sumAvgKmh,
      points: [...points],
    });
    setShowSummary(false);
    reset();
    Alert.alert('Saved', 'Drive saved. Check the Drives tab.');
  };

  const onDiscard = () => {
    setShowSummary(false);
    reset();
  };

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={region}
        showsUserLocation
        followsUserLocation={false}
      >
        {points.length > 1 && (
          <Polyline
            coordinates={points.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
            width={4}
          />
        )}
        {points.length > 0 && (
          <>
            <Marker coordinate={{ latitude: points[0].lat, longitude: points[0].lng }} title="Start" />
            <Marker coordinate={{ latitude: points[points.length - 1].lat, longitude: points[points.length - 1].lng }} title="End" />
          </>
        )}
      </MapView>

      {/* Stats */}
      <View style={{ position: 'absolute', top: 40, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 10, borderRadius: 8 }}>
        <Text style={{ color: 'white' }}>Distance: {liveDistKm.toFixed(2)} km</Text>
        <Text style={{ color: 'white' }}>Time: {Math.floor(liveDurSec / 60)}m {liveDurSec % 60}s</Text>
        <Text style={{ color: 'white' }}>Avg: {liveAvg.toFixed(1)} km/h</Text>
      </View>

      {/* Controls */}
      <View style={{ position: 'absolute', bottom: 24, alignSelf: 'center', gap: 12 }}>
        <Button title="Center" onPress={recenter} />
        {recording ? <Button title="Stop" onPress={handleStop} /> : <Button title="Start" onPress={handleStart} />}
      </View>

      {/* Summary */}
      <Modal visible={showSummary} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 16 }}>
          <View style={{ backgroundColor: 'white', borderRadius: 12, padding: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8 }}>Drive Summary</Text>
            <Text>Distance: {sumDistanceKm.toFixed(2)} km</Text>
            <Text>Time: {Math.floor(sumDurationSec / 60)}m {sumDurationSec % 60}s</Text>
            <Text>Avg Speed: {sumAvgKmh.toFixed(1)} km/h</Text>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
              <Pressable onPress={onDiscard} style={{ padding: 12, backgroundColor: '#eee', borderRadius: 8 }}>
                <Text>Discard</Text>
              </Pressable>
              <Pressable onPress={onSaveDrive} style={{ padding: 12, backgroundColor: '#4f46e5', borderRadius: 8 }}>
                <Text style={{ color: 'white' }}>Save Drive</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
