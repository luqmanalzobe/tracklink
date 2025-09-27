// src/screens/convoy/ConvoyMapScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Alert, FlatList } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import MapViewDirections from 'react-native-maps-directions';
import * as Location from 'expo-location';
import Constants from 'expo-constants';

import { getConvoy, listMembers, setDestination } from '../../features/convoy/api';
import { subscribePositions, subscribeConvoyMeta } from '../../features/convoy/realtime';
import { startPublishing, stopPublishing } from '../../features/convoy/publisher';
import type { PositionRow, UUID, Member } from '../../features/convoy/types';
import { projectPointToPolyline, haversineMeters } from '../../utils/geo';
import { SmoothLocationTracker } from '../../utils/smoothNavigation'; // ⬅️ NEW
import PlacesSearch from '../../components/PlacesSearch';

const GOOGLE_KEY = (Constants.expoConfig?.extra as any)?.googleMapsKey as string;

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1f2937' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#e5e7eb' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1f2937' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#334155' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0b1320' }] },
];

type Step = {
  instruction: string;
  distanceText: string;
  end: { lat: number; lng: number };
  maneuver?: string;
  lanes?: { direction: 'left' | 'through' | 'right'; active: boolean }[];
};

const MANEUVER_ICON: Record<string, string> = {
  'turn-left': '⬅️', 'turn-right': '➡️',
  'turn-slight-left': '↖️', 'turn-slight-right': '↗️',
  'turn-sharp-left': '⬅️', 'turn-sharp-right': '➡️',
  'uturn-left': '↩️', 'uturn-right': '↪️',
  'merge': '⇢', 'roundabout-left': '⟲', 'roundabout-right': '⟳',
  'straight': '⬆️', 'ramp-left': '↖️', 'ramp-right': '↗️',
  'fork-left': '↖️', 'fork-right': '↗️',
  'keep-left': '↖️', 'keep-right': '↗️',
};

function bearingBetween(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(a.latitude);
  const φ2 = toRad(b.latitude);
  const Δλ = toRad(b.longitude - a.longitude);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return (toDeg(θ) + 360) % 360;
}

function closestIndexOnRoute(route: { latitude: number; longitude: number }[], p: { latitude: number; longitude: number }) {
  if (!route.length) return 0;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < route.length; i++) {
    const d = haversineMeters(p, route[i]);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

type Props = { route: any; navigation: any };

export default function ConvoyMapScreen({ route, navigation }: Props) {
  const { convoyId, myName, deviceId } = route.params as { convoyId: UUID; myName: string; deviceId: string };

  const mapRef = useRef<MapView | null>(null);

  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [creatorId, setCreatorId] = useState<string | null>(null);

  const [sharing, setSharing] = useState(false);
  const [follow, setFollow] = useState(true);
  const [showMembers, setShowMembers] = useState(false);

  const [dest, setDest] = useState<{ lat: number; lng: number } | null>(null);
  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [eta, setEta] = useState<{ km: number; min: number } | null>(null);

  const [displayPos, setDisplayPos] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isGuiding, setIsGuiding] = useState(false);

  // ⬅️ NEW: smooth tracker ref
  const smoothTracker = useRef<SmoothLocationTracker | null>(null);

  // Hide/show bottom tabs in guidance
  useEffect(() => {
    const parent = navigation.getParent?.();
    if (!parent) return;
    parent.setOptions?.({ tabBarStyle: isGuiding ? { display: 'none' } : undefined });
    return () => parent?.setOptions?.({ tabBarStyle: undefined });
  }, [isGuiding, navigation]);

  // Prime: positions, meta, members, initial location
  useEffect(() => {
    navigation.setOptions?.({ title: 'Convoy' });

    const unsubPos = subscribePositions(convoyId, setPositions);
    const unsubMeta = subscribeConvoyMeta(convoyId, ({ destination_lat, destination_lng, creator_id }) => {
      setCreatorId(creator_id || null);
      if (destination_lat && destination_lng) {
        const d = { lat: destination_lat, lng: destination_lng };
        setDest(d);
        setIsGuiding(true);
      } else {
        setDest(null);
        setRouteCoords([]); setSteps([]); setEta(null); setStepIndex(0);
        setIsGuiding(false);
      }
    });

    (async () => {
      try {
        const c = await getConvoy(convoyId);
        setCreatorId(c.creator_id);
        if (c.destination_lat && c.destination_lng) {
          setDest({ lat: c.destination_lat, lng: c.destination_lng });
          setIsGuiding(true);
        }
        const m = await listMembers(convoyId);
        setMembers(m as any);
      } catch (e: any) {
        Alert.alert('Error', e.message || 'Failed to load convoy');
      }
    })();

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({});
      const curr = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setDisplayPos(curr);
      mapRef.current?.animateCamera({ center: curr, zoom: 15 }, { duration: 500 });
    })();

    return () => { unsubPos(); unsubMeta(); stopPublishing(); };
  }, [convoyId]);

  const isCreator = useMemo(() => creatorId && deviceId === creatorId, [creatorId, deviceId]);

  // 🔁 REPLACED: location tracking effect with smooth tracker + snapping + step progression
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      // create (or recreate) the smoother
      smoothTracker.current = new SmoothLocationTracker((smoothPos, heading) => {
        // Snap to route if we have one
        const center = (dest && routeCoords.length > 1)
          ? projectPointToPolyline(smoothPos, routeCoords).snapped
          : smoothPos;

        setDisplayPos(center);

        if (follow && mapRef.current) {
          // fallback heading along the route if GPS heading is empty/zero
          let finalHeading = heading;
          if ((!heading || heading === 0) && routeCoords.length > 1) {
            const idx = closestIndexOnRoute(routeCoords, center);
            const ahead = routeCoords[Math.min(idx + 1, routeCoords.length - 1)];
            finalHeading = bearingBetween(center, ahead);
          }

          mapRef.current.animateCamera(
            {
              center,
              zoom: isGuiding ? 18 : 16,
              pitch: isGuiding ? 60 : 40,
              heading: finalHeading,
            },
            { duration: 300 }
          );
        }
      });

      // High-frequency GPS updates into the smoother
      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 500,
          distanceInterval: 1,
        },
        (loc) => {
          // feed the smoother
          smoothTracker.current?.updatePosition(loc);

          // step progression uses snapped center (route-aware)
          const raw = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          const center = (dest && routeCoords.length > 1)
            ? projectPointToPolyline(raw, routeCoords).snapped
            : raw;

          if (steps[stepIndex]) {
            const nextEnd = steps[stepIndex].end;
            const dist = haversineMeters(center, { latitude: nextEnd.lat, longitude: nextEnd.lng });
            if (dist < 50 && stepIndex < steps.length - 1) {
              setStepIndex(stepIndex + 1);
            }
          }
        }
      );
    })();

    return () => {
      smoothTracker.current?.stop();
      smoothTracker.current = null;
      try { sub?.remove(); } catch {}
    };
  }, [follow, dest, routeCoords.length, steps, stepIndex, isGuiding]);

  const toggleSharing = async () => {
    try {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (fg.status !== 'granted') return Alert.alert('Location', 'Permission required to share.');
      if (!sharing) { await startPublishing(convoyId, deviceId); setSharing(true); }
      else { stopPublishing(); setSharing(false); }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not start/stop sharing');
    }
  };

  // Fetch route + steps
  const fetchRoute = async (origin: { lat: number; lng: number }, d: { lat: number; lng: number }) => {
    try {
      const url =
        `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.lat},${origin.lng}` +
        `&destination=${d.lat},${d.lng}&mode=driving&units=metric&alternatives=false&key=${GOOGLE_KEY}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.status !== 'OK') {
        Alert.alert('Directions error', json.error_message ?? json.status);
        setSteps([]); setRouteCoords([]); setEta(null); setStepIndex(0);
        return;
      }
      const route = json.routes?.[0];
      const leg = route?.legs?.[0];
      if (!leg) { setSteps([]); setRouteCoords([]); setEta(null); setStepIndex(0); return; }

      const s: Step[] = leg.steps.map((st: any) => {
        const lanes = (st?.lanes || [])
          .map((ln: any) => ({
            direction: (ln?.direction || 'through') as 'left' | 'right' | 'through',
            active: !!ln?.active
          }));
        return {
          instruction: String(st?.html_instructions || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' '),
          distanceText: st?.distance?.text || '',
          end: { lat: st?.end_location?.lat, lng: st?.end_location?.lng },
          maneuver: st?.maneuver,
          lanes,
        };
      });

      setSteps(s);
      setStepIndex(0);
      setEta({
        km: leg.distance?.value ? leg.distance.value / 1000 : route?.distance,
        min: leg.duration?.value ? leg.duration.value / 60 : route?.duration
      });
    } catch (e) {
      console.warn('Fetch steps error', e);
      setSteps([]);
    }
  };

  // When a destination appears and we have a position, fetch steps & auto-enter guidance
  useEffect(() => {
    if (!dest || !displayPos) return;
    fetchRoute({ lat: displayPos.latitude, lng: displayPos.longitude }, dest);
    setIsGuiding(true);
  }, [dest?.lat, dest?.lng]);

  const me = useMemo(() => positions.find((p) => p.user_id === deviceId) || null, [positions, deviceId]);
  useEffect(() => {
    if (me && follow && mapRef.current) {
      mapRef.current.animateCamera({ center: { latitude: me.lat, longitude: me.lng }, zoom: 15 }, { duration: 600 });
    }
  }, [me?.lat, me?.lng]);

  const next = steps[stepIndex];

  // End guidance
  const endGuidance = async () => {
    setIsGuiding(false);
    setFollow(false);
    setStepIndex(0);
    setRouteCoords([]);
    setEta(null);
    if (isCreator) { try { await setDestination(convoyId, null as any, null as any); } catch {} }
  };

  // Oriented kick at start of guidance
  const orientAtStart = () => {
    if (!mapRef.current || !displayPos || routeCoords.length < 2) return;
    const idx = closestIndexOnRoute(routeCoords, displayPos);
    const ahead = routeCoords[Math.min(idx + 1, routeCoords.length - 1)];
    const heading = bearingBetween(displayPos, ahead);
    mapRef.current.animateCamera(
      { center: displayPos, zoom: 18, pitch: 60, heading },
      { duration: 650 }
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0B1020' }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={{ latitude: 43.653, longitude: -79.383, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
        customMapStyle={darkMapStyle as any}
        onPanDrag={() => follow && setFollow(false)}
        onRegionChangeComplete={() => follow && setFollow(false)}
      >
        {/* Me (snapped) */}
        {displayPos && (
          <Marker coordinate={displayPos} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#22c55e', borderWidth: 2, borderColor: 'white' }} />
          </Marker>
        )}

        {/* Friends */}
        {positions.map((p) => (
          <Marker key={p.user_id} coordinate={{ latitude: p.lat, longitude: p.lng }} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={{ alignItems: 'center' }}>
              <View style={{
                width: 16, height: 16, borderRadius: 8,
                backgroundColor: p.user_id === deviceId ? '#22c55e' : '#3b82f6',
                borderWidth: 2, borderColor: 'white',
                transform: [{ rotate: `${p.heading_deg || 0}deg` }]
              }}/>
              <Text style={{
                marginTop: 4, fontSize: 10, color: 'white', backgroundColor: '#111827',
                paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: '#1f2937'
              }}>
                {typeof p.speed_mps === 'number' ? `${(p.speed_mps * 3.6).toFixed(0)} km/h` : '--'}
              </Text>
            </View>
          </Marker>
        ))}

        {/* Destination */}
        {dest && <Marker coordinate={{ latitude: dest.lat, longitude: dest.lng }} title="Destination" />}

        {/* Shared route polyline */}
        {GOOGLE_KEY && dest && displayPos && (
          <MapViewDirections
            origin={displayPos}
            destination={{ latitude: dest.lat, longitude: dest.lng }}
            apikey={GOOGLE_KEY}
            mode="DRIVING"
            strokeWidth={5}
            strokeColor="#4f46e5"
            onReady={(res) => {
              const coords = res.coordinates.map((c) => ({ latitude: c.latitude, longitude: c.longitude }));
              setRouteCoords(coords);
              if (!eta) setEta({ km: res.distance, min: res.duration });

              if (mapRef.current && (!follow || !isGuiding)) {
                mapRef.current.fitToCoordinates(coords, {
                  edgePadding: { top: 100, bottom: 200, left: 40, right: 40 },
                  animated: true,
                });
              }

              if (isGuiding) setTimeout(orientAtStart, 250);
            }}
            onError={(e) => console.warn('Directions error', e)}
          />
        )}
      </MapView>

      {/* ======= TOP STACK ======= */}
      {!isGuiding && (
        <View style={{ position: 'absolute', top: 16, left: 12, right: 12 }}>
          {/* Creator search row */}
          {isCreator && (
            <>
              <PlacesSearch
                placeholder={dest ? 'Change destination…' : 'Set convoy destination…'}
                onPlaceSelected={async ({ lat, lng }) => {
                  try {
                    await setDestination(convoyId, lat, lng);
                    setDest({ lat, lng });
                    setFollow(true);
                    setIsGuiding(true);
                  } catch (e: any) {
                    Alert.alert('Error', e.message || 'Unable to set destination');
                  }
                }}
              />
              {dest && (
                <Pressable
                  onPress={async () => { try { await setDestination(convoyId, null as any, null as any); } catch {} }}
                  style={{ marginTop: 8, alignSelf: 'flex-start', backgroundColor: '#1f2937', borderColor: '#111827', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 }}
                >
                  <Text style={{ color: 'white' }}>Clear destination</Text>
                </Pressable>
              )}
            </>
          )}

          {/* Convoy bar */}
          <Pressable
            onPress={() => setShowMembers((s) => !s)}
            style={{
              marginTop: isCreator ? 12 : 0,
              backgroundColor: '#111827', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#1f2937'
            }}
          >
            <Text style={{ color: 'white', fontWeight: '800' }}>
              Convoy · {(members.length || positions.length || 1)} member{(members.length || positions.length || 1) === 1 ? '' : 's'}
            </Text>
            {eta && dest && (
              <Text style={{ color: '#9CA3AF', marginTop: 2 }}>
                {eta.min.toFixed(0)} min • {eta.km.toFixed(1)} km to destination
              </Text>
            )}
            {!dest && <Text style={{ color: '#9CA3AF', marginTop: 2 }}>No destination set</Text>}
            <Text style={{ color: '#9CA3AF', marginTop: 4 }}>{showMembers ? 'Hide members ▲' : 'Show members ▼'}</Text>
          </Pressable>
        </View>
      )}

      {/* Members sheet */}
      {!isGuiding && showMembers && (
        <View style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          backgroundColor: '#0B1020', borderTopColor: '#111827', borderTopWidth: 1, maxHeight: 320
        }}>
          <FlatList
            data={members}
            keyExtractor={(m) => `${m.user_id}`}
            renderItem={({ item }) => {
              const p = positions.find((x) => x.user_id === item.user_id);
              return (
                <View style={{ padding: 12, borderBottomColor: '#111827', borderBottomWidth: 1 }}>
                  <Text style={{ color: 'white', fontWeight: '700' }}>{item.display_name || 'Driver'}</Text>
                  {p ? (
                    <Text style={{ color: '#9CA3AF' }}>
                      {(p.speed_mps ?? 0) * 3.6 > 0 ? `${(p.speed_mps! * 3.6).toFixed(0)} km/h` : '—'} · updated {new Date(p.updated_at).toLocaleTimeString()}
                    </Text>
                  ) : (
                    <Text style={{ color: '#9CA3AF' }}>No position yet</Text>
                  )}
                </View>
              );
            }}
            ListEmptyComponent={<Text style={{ color: '#9CA3AF', padding: 12 }}>No members loaded yet.</Text>}
          />
        </View>
      )}

      {/* Guidance banner */}
      {isGuiding && dest && steps[stepIndex] && (
        <View style={{ position: 'absolute', top: 16, left: 12, right: 12 }}>
          <View style={{ backgroundColor: '#0b1020', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#1f2937' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={{ fontSize: 28 }}>
                {MANEUVER_ICON[steps[stepIndex].maneuver || 'straight'] || '⬆️'}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: 'white', fontWeight: '800' }} numberOfLines={2}>{steps[stepIndex].instruction}</Text>
                <Text style={{ color: '#9CA3AF', marginTop: 2 }}>
                  {steps[stepIndex].distanceText}{eta ? ` • ${eta.min.toFixed(0)} min · ${eta.km.toFixed(1)} km` : ''}
                </Text>
              </View>
            </View>

            {steps[stepIndex].lanes && steps[stepIndex].lanes!.length > 0 && (
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {steps[stepIndex].lanes!.map((ln, i) => (
                  <View
                    key={i}
                    style={{
                      paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10,
                      backgroundColor: ln.active ? '#4f46e5' : '#111827',
                      borderWidth: 1, borderColor: '#1f2937'
                    }}
                  >
                    <Text style={{ color: 'white', fontWeight: '700' }}>
                      {ln.direction === 'left' ? 'Left' : ln.direction === 'right' ? 'Right' : 'Straight'}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      )}

      {/* End Guidance */}
      {isGuiding && (
        <Pressable
          onPress={endGuidance}
          style={{
            position: 'absolute', left: 12, bottom: 28,
            backgroundColor: '#ef4444', paddingVertical: 12, paddingHorizontal: 14,
            borderRadius: 10, borderWidth: 1, borderColor: '#111827'
          }}
        >
          <Text style={{ color: 'white', fontWeight: '800' }}>End Guidance</Text>
        </Pressable>
      )}

      {/* Recenter & Share */}
      <Pressable
        onPress={async () => {
          setFollow(true);
          const loc = await Location.getCurrentPositionAsync({});
          const curr = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          mapRef.current?.animateCamera({ center: curr, zoom: isGuiding ? 18 : 16 }, { duration: 500 });
        }}
        style={{
          position: 'absolute', right: 16, bottom: isGuiding ? 28 : 180,
          backgroundColor: follow ? '#4f46e5' : '#1f2937',
          paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: '#111827'
        }}
      >
        <Text style={{ color: 'white', fontWeight: '700' }}>{follow ? 'Following' : 'Recenter'}</Text>
      </Pressable>

      {!isGuiding && (
        <View style={{ position: 'absolute', left: 12, right: 12, bottom: 28, flexDirection: 'row', gap: 10 }}>
          <Pressable
            onPress={toggleSharing}
            style={{ flex: 1, backgroundColor: sharing ? '#ef4444' : '#10b981', paddingVertical: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#111827' }}
          >
            <Text style={{ color: 'white', fontWeight: '800' }}>{sharing ? 'Stop sharing' : 'Share my location'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
