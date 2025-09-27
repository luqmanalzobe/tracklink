// src/screens/RecordScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Button, Alert, Text, Modal, Pressable } from 'react-native';
import MapView, { Polyline, Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useRecording } from '../state/useRecording';
import { useDrives } from '../state/useDrives';
import { distanceKm, durationSec, avgKmh } from '../lib/stats';
import { TASK_NAME } from '../background/locationTask';
import { SmoothLocationTracker, SMOOTH_NAV_CONFIG, getCameraSettings } from '../utils/smoothNavigation';

// Custom dark map style to match the rest of the app
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

  const [region, setRegion] = useState<Region>({
    latitude: 43.653, longitude: -79.383, latitudeDelta: 0.05, longitudeDelta: 0.05,
  });
  const [followUser, setFollowUser] = useState(true);
  const [currentPosition, setCurrentPosition] = useState<{ latitude: number; longitude: number } | null>(null);

  // Summary modal state
  const [showSummary, setShowSummary] = useState(false);
  const [sumDistanceKm, setSumDistanceKm] = useState(0);
  const [sumDurationSec, setSumDurationSec] = useState(0);
  const [sumAvgKmh, setSumAvgKmh] = useState(0);

  // Permissions + initial center + smooth tracking setup
  useEffect(() => {
    (async () => {
      const { status: fg } = await Location.requestForegroundPermissionsAsync();
      if (fg !== 'granted') {
        Alert.alert('Location required', 'Enable location to record drives.');
        return;
      }
      const { status: bg } = await Location.requestBackgroundPermissionsAsync();
      if (bg !== 'granted') {
        console.warn('Background permission not granted');
      }
      
      // Get initial location
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

  // Set up smooth location tracking that follows the user
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let tracker: SmoothLocationTracker | null = null;
    
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      
      // Create smooth tracker for continuous position updates
      tracker = new SmoothLocationTracker((position, heading) => {
        setCurrentPosition(position);
        
        // Only update camera if we're following the user
        if (followUserRef.current && mapRef.current) {
          const speedKmh = lastSpeedRef.current * 3.6;
          const { zoom, pitch } = getCameraSettings(speedKmh);
          
          // Use the heading for camera direction (face the direction of travel)
          mapRef.current.animateCamera(
            {
              center: position,
              heading: heading || lastHeadingRef.current || 0,  // Face direction of movement
              pitch: recording ? pitch : 0,  // Angled view when recording, top-down when not
              zoom: recording ? zoom : 17,    // Dynamic zoom when recording
            },
            { duration: SMOOTH_NAV_CONFIG.CAMERA.animationDuration }
          );
        }
      });
      
      smoothTracker.current = tracker;
      
      // High-frequency location updates for smooth tracking
      sub = await Location.watchPositionAsync(
        SMOOTH_NAV_CONFIG.GPS,
        (loc) => {
          // Update speed and heading refs
          lastSpeedRef.current = loc.coords.speed ?? 0;
          if (loc.coords.heading && loc.coords.heading > 0) {
            lastHeadingRef.current = loc.coords.heading;
          }
          
          // Update smooth tracker
          tracker?.updatePosition(loc);
          
          // If recording, add points to the recording
          if (recording) {
            add({ 
              lat: loc.coords.latitude, 
              lng: loc.coords.longitude, 
              ts: Date.now() 
            });
          }
        }
      );
    })();
    
    return () => {
      tracker?.stop();
      try { sub?.remove(); } catch {}
    };
  }, [recording, add]);

  // Update follow ref when state changes
  useEffect(() => {
    followUserRef.current = followUser;
  }, [followUser]);

  const liveDistKm = useMemo(() => distanceKm(points), [points]);
  const liveDurSec = useMemo(
    () => (startTime ? Math.floor((Date.now() - startTime) / 1000) : 0),
    [startTime, points.length, recording]
  );
  const liveAvg = useMemo(() => avgKmh(liveDistKm, liveDurSec), [liveDistKm, liveDurSec]);

  const recenter = async () => {
    setFollowUser(true);
    const loc = await Location.getCurrentPositionAsync({});
    const next: Region = { 
      latitude: loc.coords.latitude, 
      longitude: loc.coords.longitude, 
      latitudeDelta: 0.01, 
      longitudeDelta: 0.01 
    };
    setRegion(next);
    
    const heading = loc.coords.heading && loc.coords.heading > 0 ? loc.coords.heading : lastHeadingRef.current;
    const speedKmh = (loc.coords.speed ?? 0) * 3.6;
    const { zoom, pitch } = getCameraSettings(speedKmh);
    
    mapRef.current?.animateCamera(
      { 
        center: { latitude: loc.coords.latitude, longitude: loc.coords.longitude },
        heading: heading,
        pitch: recording ? pitch : 0,
        zoom: recording ? zoom : 17,
      }, 
      { duration: 500 }
    );
  };

  const handleStart = async () => {
    start(); // reset points/startTime
    setFollowUser(true); // Auto-follow when starting
    
    // Start background updates (safe to call even if already started)
    const started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
    if (!started) {
      await Location.startLocationUpdatesAsync(TASK_NAME, {
        accuracy: Location.Accuracy.BestForNavigation,  // Better accuracy
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

  // Handle map pan/drag to disable follow
  const handleRegionChange = () => {
    if (followUser) setFollowUser(false);
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
        {/* Draw the recorded route */}
        {points.length > 1 && (
          <Polyline
            coordinates={points.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
            strokeWidth={4}
            strokeColor="#4f46e5"
          />
        )}
        
        {/* Start and end markers */}
        {points.length > 0 && (
          <>
            <Marker 
              coordinate={{ latitude: points[0].lat, longitude: points[0].lng }} 
              title="Start" 
              pinColor="#10b981"
            />
            {points.length > 1 && (
              <Marker 
                coordinate={{ latitude: points[points.length - 1].lat, longitude: points[points.length - 1].lng }} 
                title="Current" 
                pinColor="#ef4444"
              />
            )}
          </>
        )}
      </MapView>

      {/* Stats overlay */}
      <View style={{ 
        position: 'absolute', 
        top: 40, 
        alignSelf: 'center', 
        backgroundColor: '#0B1020', 
        padding: 12, 
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#1f2937',
        minWidth: 200,
        alignItems: 'center'
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

      {/* Recenter button */}
      <Pressable
        onPress={recenter}
        style={{ 
          position: 'absolute', 
          right: 16, 
          bottom: 100,
          backgroundColor: followUser ? '#4f46e5' : '#1f2937',
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: '#111827',
        }}
      >
        <Text style={{ color: 'white', fontWeight: '700' }}>
          {followUser ? 'Following' : 'Recenter'}
        </Text>
      </Pressable>

      {/* Start/Stop button */}
      <View style={{ position: 'absolute', bottom: 24, alignSelf: 'center' }}>
        {recording ? (
          <Pressable 
            onPress={handleStop}
            style={{ 
              backgroundColor: '#ef4444', 
              paddingVertical: 14,
              paddingHorizontal: 32,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#111827',
            }}
          >
            <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>Stop Recording</Text>
          </Pressable>
        ) : (
          <Pressable 
            onPress={handleStart}
            style={{ 
              backgroundColor: '#10b981', 
              paddingVertical: 14,
              paddingHorizontal: 32,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#111827',
            }}
          >
            <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>Start Recording</Text>
          </Pressable>
        )}
      </View>

      {/* Summary Modal */}
      <Modal visible={showSummary} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 16 }}>
          <View style={{ backgroundColor: '#0B1020', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#1f2937' }}>
            <Text style={{ color: 'white', fontSize: 20, fontWeight: '700', marginBottom: 12 }}>Drive Summary</Text>
            <Text style={{ color: '#e5e7eb', marginBottom: 4 }}>Distance: {sumDistanceKm.toFixed(2)} km</Text>
            <Text style={{ color: '#e5e7eb', marginBottom: 4 }}>Time: {Math.floor(sumDurationSec / 60)}m {sumDurationSec % 60}s</Text>
            <Text style={{ color: '#e5e7eb', marginBottom: 12 }}>Avg Speed: {sumAvgKmh.toFixed(1)} km/h</Text>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, gap: 12 }}>
              <Pressable 
                onPress={onDiscard} 
                style={{ flex: 1, padding: 12, backgroundColor: '#374151', borderRadius: 8, alignItems: 'center' }}
              >
                <Text style={{ color: 'white', fontWeight: '600' }}>Discard</Text>
              </Pressable>
              <Pressable 
                onPress={onSaveDrive} 
                style={{ flex: 1, padding: 12, backgroundColor: '#4f46e5', borderRadius: 8, alignItems: 'center' }}
              >
                <Text style={{ color: 'white', fontWeight: '700' }}>Save Drive</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}