import * as Location from 'expo-location';
import { upsertPosition } from './api';
import type { UUID } from './types';
import { haversineMeters } from '../../utils/geo';

let sub: Location.LocationSubscription | null = null;
let lastSent = 0;
let lastPos: { latitude: number; longitude: number } | null = null;

export async function startPublishing(convoyId: UUID, userId: string) {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('Location permission required');

  sub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Balanced, timeInterval: 1500, distanceInterval: 5 },
    async (loc) => {
      const now = Date.now();
      const p = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      const moved = lastPos ? haversineMeters(lastPos, p) : Infinity;

      if (now - lastSent < 1500 && moved < 8) return; // throttle
      lastSent = now; lastPos = p;

      await upsertPosition({
        convoy_id: convoyId,
        user_id: userId,
        lat: p.latitude,
        lng: p.longitude,
        speed_mps: loc.coords.speed ?? null,
        heading_deg: Number.isFinite(loc.coords.heading) ? loc.coords.heading : null,
        updated_at: new Date().toISOString(),
      });
    }
  );
}

export function stopPublishing() {
  try { sub?.remove(); } catch {}
  sub = null;
  lastPos = null;
}
