// src/screens/DirectionsScreen.tsx
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert, FlatList, Platform } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import MapViewDirections from 'react-native-maps-directions';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import PlacesSearch from '../components/PlacesSearch';
import BottomSheet from '../components/BottomSheet';
import { SmoothLocationTracker, SMOOTH_NAV_CONFIG, getCameraSettings } from '../utils/smoothNavigation';
import { distanceToPolylineMeters, haversineMeters, LatLng as LL } from '../utils/geo';

const GOOGLE_KEY = (Constants.expoConfig?.extra as any)?.googleMapsKey as string;

type LatLng = { lat: number; lng: number };
type Step = { instruction: string; distanceText: string; end: LatLng };
type CachedRoute = { origin: LatLng; destination: LatLng; steps: Step[]; coords: LL[]; };
const CACHE_KEY = 'tracklink.last_route.v1';

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1f2937' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#e5e7eb' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1f2937' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#e5e7eb' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#0b1020' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#334155' }] },
  { elementType: 'road', featureType: 'road', stylers: [{ color: '#334155' }] },
  { elementType: 'road', stylers: [{ color: '#334155' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0b1020' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#cbd5e1' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#0b1020' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0b1320' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
];

const fmtDist = (m: number) => (m < 950 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`);

export default function DirectionsScreen() {
  const mapRef = useRef<MapView | null>(null);

  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [loading, setLoading] = useState(true);
  const [eta, setEta] = useState<{ distanceKm: number; durationMin: number } | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [guiding, setGuiding] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [routeCoords, setRouteCoords] = useState<LL[]>([]);
  const locSub = useRef<Location.LocationSubscription | null>(null);
  const [lastSpoken, setLastSpoken] = useState<number>(-1);
  const [followUser, setFollowUser] = useState(true);
  const [showSteps, setShowSteps] = useState(false);

  // --- Smooth tracker + speed refs ---
  const smoothTracker = useRef<SmoothLocationTracker | null>(null);
  const lastSpeedRef = useRef<number>(0);

  const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location needed', 'Allow location to use Directions.');
        setLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      setOrigin({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      setLoading(false);

      try {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (raw) {
          const c: CachedRoute = JSON.parse(raw);
          setDestination(c.destination);
          setSteps(c.steps);
          setRouteCoords(c.coords);
        }
      } catch {}
    })();
  }, []);

  const fetchSteps = async (o: LatLng, d: LatLng) => {
    try {
      const url =
        `https://maps.googleapis.com/maps/api/directions/json?origin=${o.lat},${o.lng}` +
        `&destination=${d.lat},${d.lng}&mode=driving&units=metric&alternatives=false&key=${GOOGLE_KEY}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.status !== 'OK') {
        console.warn('Directions status:', json.status, json.error_message);
        Alert.alert('Directions error', json.error_message ?? json.status);
        setSteps([]); setRouteCoords([]);
        return;
      }
      const leg = json.routes?.[0]?.legs?.[0];
      if (!leg) { setSteps([]); setRouteCoords([]); return; }

      const s: Step[] = leg.steps.map((st: any) => ({
        instruction: stripHtml(st?.html_instructions || ''),
        distanceText: st?.distance?.text || '',
        end: { lat: st?.end_location?.lat, lng: st?.end_location?.lng },
      }));
      setSteps(s);
      setStepIndex(0);

      try {
        const cacheMin: CachedRoute = { origin: o, destination: d, steps: s, coords: [] };
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cacheMin));
      } catch {}
    } catch (e) {
      console.warn('Fetch steps error', e);
      if (!steps.length) Alert.alert('Network issue', 'Using last saved route if available.');
    }
  };

  const speakOnce = (index: number, text: string) => {
    if (lastSpoken === index) return;
    Speech.speak(text);
    setLastSpoken(index);
  };

  // --- START GUIDANCE (smooth tracker version) ---
  const startGuidance = async () => {
    if (!origin || !destination || steps.length === 0) return;
    setGuiding(true);
    setShowSteps(false);
    setLastSpoken(-1);
    setFollowUser(true);
    Speech.speak(`Starting guidance. ${steps[0].instruction}`);

    // Initialize smooth tracker for camera motion
    smoothTracker.current = new SmoothLocationTracker((position, heading) => {
      if (followUser && mapRef.current) {
        const speedKmh = lastSpeedRef.current * 3.6;
        const { zoom, pitch } = getCameraSettings(speedKmh);

        mapRef.current.animateCamera(
          {
            center: position,
            heading,
            pitch,
            zoom,
          },
          { duration: SMOOTH_NAV_CONFIG.CAMERA.animationDuration }
        );
      }
    });

    // High-frequency GPS updates
    locSub.current = await Location.watchPositionAsync(
      SMOOTH_NAV_CONFIG.GPS,
      (loc) => {
        const speed = loc.coords.speed ?? 0;
        const curr: LL = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };

        // Store speed for camera settings
        lastSpeedRef.current = speed;

        // Feed the smoother
        smoothTracker.current?.updatePosition(loc);

        // Off-route detection
        if (routeCoords.length > 1) {
          const off = distanceToPolylineMeters(curr, routeCoords);
          if (off > 80) {
            const now = { lat: curr.latitude, lng: curr.longitude };
            fetchSteps(now, destination!);
          }
        }

        // Turn-by-turn
        const next = steps[stepIndex];
        if (!next) { Speech.speak('You have arrived.'); stopGuidance(); return; }

        const distToNext = haversineMeters(curr, { latitude: next.end.lat, longitude: next.end.lng });

        // Dynamic pre-announce distance based on speed (m/s thresholds)
        const preAnnounce =
          speed >= 25 ? 500 :  // ~90 km/h
          speed >= 15 ? 300 :  // ~54 km/h
          speed >= 8  ? 200 :  // ~29 km/h
                        100;   // very slow

        if (distToNext < preAnnounce && stepIndex !== lastSpoken) {
          speakOnce(stepIndex, next.instruction);
        }

        if (distToNext < 50) {
          const newIndex = stepIndex + 1;
          setStepIndex(newIndex);
          const after = steps[newIndex];
          if (after) Speech.speak(`Then ${after.instruction}`);
          else Speech.speak('Final approach.');
        }
      }
    );
  };

  // --- STOP GUIDANCE (cleanup smooth tracker too) ---
  const stopGuidance = () => {
    setGuiding(false);
    smoothTracker.current?.stop();
    smoothTracker.current = null;
    try { locSub.current?.remove(); } catch {}
    locSub.current = null;
    Speech.stop();
  };

  useEffect(() => () => stopGuidance(), []);

  // --- Follow mode when NOT guiding: smooth camera on user ---
  useEffect(() => {
    if (guiding) return; // handled in startGuidance

    let sub: Location.LocationSubscription | null = null;
    let tracker: SmoothLocationTracker | null = null;

    (async () => {
      if (!followUser) return;

      tracker = new SmoothLocationTracker((position, heading) => {
        if (followUser && mapRef.current) {
          mapRef.current.animateCamera(
            { center: position, heading, pitch: 45, zoom: 16.5 },
            { duration: 300 }
          );
        }
      });

      sub = await Location.watchPositionAsync(
        SMOOTH_NAV_CONFIG.GPS,
        (loc) => tracker?.updatePosition(loc)
      );
    })();

    return () => {
      tracker?.stop();
      try { sub?.remove(); } catch {}
    };
  }, [followUser, guiding]);

  const region: Region = destination
    ? { latitude: destination.lat, longitude: destination.lng, latitudeDelta: 0.04, longitudeDelta: 0.04 }
    : origin
    ? { latitude: origin.lat, longitude: origin.lng, latitudeDelta: 0.04, longitudeDelta: 0.04 }
    : { latitude: 43.653, longitude: -79.383, latitudeDelta: 0.05, longitudeDelta: 0.05 };

  if (!GOOGLE_KEY) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0B1020', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <Text style={{ color: 'white', fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Google key not loaded</Text>
        <Text style={{ color: '#9CA3AF', textAlign: 'center' }}>
          Add EXPO_PUBLIC_GOOGLE_MAPS_KEY in .env and expose via app.config.js → extra.googleMapsKey. Restart with cache clear.
        </Text>
      </View>
    );
  }

  const handleRegionChange = () => { if (followUser) setFollowUser(false); };

  const handleRecenter = async () => {
    setFollowUser(true);
    if (!mapRef.current) return;
    const loc = await Location.getCurrentPositionAsync({});
    mapRef.current.animateCamera(
      {
        center: { latitude: loc.coords.latitude, longitude: loc.coords.longitude },
        heading: Number.isFinite(loc.coords.heading) ? loc.coords.heading : 0,
        pitch: 45,
        zoom: 16.5,
      },
      { duration: 500 }
    );
  };

  const nextStep = steps[stepIndex];
  const nextTitle = useMemo(() => (nextStep ? nextStep.instruction : '—'), [nextStep]);

  return (
    <View style={{ flex: 1, backgroundColor: '#0B1020' }}>
      {/* Search area hidden during guidance */}
      {!guiding && (
        <View style={{ padding: 12, paddingBottom: 0 }}>
          <Text style={{ color: 'white', fontWeight: '700', fontSize: 18, marginBottom: 8 }}>Directions</Text>

          <PlacesSearch
            onPlaceSelected={({ lat, lng }) => {
              const dst = { lat, lng };
              setDestination(dst);
              setEta(null);
              if (origin) fetchSteps(origin, dst);
              setFollowUser(true);
            }}
          />

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Pressable
              onPress={() => Alert.alert('Convoy', 'Start a Convoy (coming soon).')}
              style={{ backgroundColor: '#1f2937', padding: 12, borderRadius: 10, alignItems: 'center', flex: 1 }}
            >
              <Text style={{ color: 'white' }}>Start a Convoy</Text>
            </Pressable>

            <Pressable
              onPress={startGuidance}
              disabled={!destination || steps.length === 0}
              style={{ backgroundColor: destination && steps.length ? '#10b981' : '#374151', padding: 12, borderRadius: 10, alignItems: 'center', flex: 1 }}
            >
              <Text style={{ color: 'white', fontWeight: '700' }}>Start Guidance</Text>
            </Pressable>
          </View>

          {eta && (
            <Text style={{ color: '#9CA3AF', marginTop: 6 }}>
              ETA: {eta.durationMin.toFixed(0)} min • {eta.distanceKm.toFixed(1)} km
            </Text>
          )}
        </View>
      )}

      {/* Map */}
      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator />
          </View>
        ) : (
          <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            initialRegion={region}
            showsUserLocation
            customMapStyle={darkMapStyle as any}
            onPanDrag={handleRegionChange}
            onRegionChangeComplete={handleRegionChange}
          >
            {origin && <Marker coordinate={{ latitude: origin.lat, longitude: origin.lng }} title="You" />}
            {destination && <Marker coordinate={{ latitude: destination.lat, longitude: destination.lng }} title="Destination" />}

            {origin && destination && (
              <MapViewDirections
                origin={{ latitude: origin.lat, longitude: origin.lng }}
                destination={{ latitude: destination.lat, longitude: destination.lng }}
                apikey={GOOGLE_KEY}
                mode="DRIVING"
                strokeWidth={5}
                strokeColor="#4f46e5"
                onReady={async (result) => {
                  mapRef.current?.fitToCoordinates(result.coordinates, {
                    edgePadding: { top: guiding ? 40 : 80, right: 40, bottom: guiding ? 40 : (Platform.OS === 'ios' ? 240 : 200), left: 40 },
                    animated: true,
                  });
                  setEta({ distanceKm: result.distance, durationMin: result.duration });
                  setRouteCoords(result.coordinates.map(c => ({ latitude: c.latitude, longitude: c.longitude })));

                  try {
                    if (origin && destination && steps.length) {
                      const cache: CachedRoute = {
                        origin,
                        destination,
                        steps,
                        coords: result.coordinates.map(c => ({ latitude: c.latitude, longitude: c.longitude })),
                      };
                      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
                    }
                  } catch {}
                }}
                onError={(e) => {
                  console.warn('Directions error', e);
                  Alert.alert('Directions error', 'Check your Google API key & quota and try again.');
                }}
              />
            )}
          </MapView>
        )}
      </View>

      {/* Floating Recenter (bottom-right) */}
      <Pressable
        onPress={handleRecenter}
        style={{
          position: 'absolute', right: 16, bottom: guiding ? 28 : 180,
          backgroundColor: followUser ? '#4f46e5' : '#1f2937',
          paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10,
          borderWidth: 1, borderColor: '#111827',
        }}
      >
        <Text style={{ color: 'white', fontWeight: '700' }}>{followUser ? 'Following' : 'Recenter'}</Text>
      </Pressable>

      {/* END button (bottom-left, only during guidance) */}
      {guiding && (
        <Pressable
          onPress={stopGuidance}
          style={{
            position: 'absolute', left: 16, bottom: 28,
            backgroundColor: '#ef4444', paddingVertical: 10, paddingHorizontal: 14,
            borderRadius: 10, borderWidth: 1, borderColor: '#111827'
          }}
        >
          <Text style={{ color: 'white', fontWeight: '800' }}>End</Text>
        </Pressable>
      )}

      {/* NAV banner on top — tap to toggle steps */}
      {guiding && nextStep && (
        <Pressable
          onPress={() => setShowSteps((p) => !p)}
          style={{
            position: 'absolute', top: 16, left: 12, right: 12,
            backgroundColor: '#111827', borderRadius: 12, padding: 12,
            borderWidth: 1, borderColor: '#1f2937'
          }}
        >
          <Text style={{ color: 'white', fontSize: 16, fontWeight: '800' }}>{nextStep.instruction}</Text>
          <LiveDistance target={nextStep.end} />
          <Text style={{ color: '#9CA3AF', marginTop: 4 }}>{showSteps ? 'Hide steps ▲' : 'Show steps ▼'}</Text>
        </Pressable>
      )}

      {/* Steps sheet: hidden by default in nav, shown when banner tapped */}
      {(!guiding || showSteps) && (
        <BottomSheet initialHeight={guiding ? 120 : 160} maxHeight={360}>
          <FlatList
            data={steps}
            keyExtractor={(_, i) => String(i)}
            renderItem={({ item, index }) => (
              <View style={{ paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderColor: '#111827' }}>
                <Text style={{ color: 'white', fontWeight: index === stepIndex ? '800' : '600' }}>
                  {index + 1}. {item.instruction}
                </Text>
                <Text style={{ color: '#9CA3AF' }}>{item.distanceText}</Text>
              </View>
            )}
            ListHeaderComponent={
              <View style={{ paddingHorizontal: 12, paddingBottom: 6 }}>
                <Text style={{ color: '#9CA3AF' }}>
                  {eta ? `${eta.durationMin.toFixed(0)} min • ${eta.distanceKm.toFixed(1)} km` : 'Steps'}
                </Text>
              </View>
            }
            ListEmptyComponent={<Text style={{ color: '#9CA3AF', paddingHorizontal: 12 }}>Search a destination to see steps.</Text>}
          />
        </BottomSheet>
      )}
    </View>
  );
}

function LiveDistance({ target }: { target: LatLng }) {
  const [dist, setDist] = useState<string>('—');

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      try {
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 1200, distanceInterval: 5 },
          (loc) => {
            const m = haversineMeters(
              { latitude: loc.coords.latitude, longitude: loc.coords.longitude },
              { latitude: target.lat, longitude: target.lng }
            );
            setDist(fmtDist(m));
          }
        );
      } catch {}
    })();
    return () => { try { sub?.remove(); } catch {} };
  }, [target.lat, target.lng]);

  return <Text style={{ color: '#9CA3AF', marginTop: 4 }}>{dist}</Text>;
}
