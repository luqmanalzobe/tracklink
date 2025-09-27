// src/features/convoy/publisher.ts
import * as Location from 'expo-location';
import { upsertPosition } from './api';
import { haversineMeters } from '../../utils/geo';
import type { UUID } from './types';

let sub: Location.LocationSubscription | null = null;
let lastSent = 0;
let lastPos: { latitude: number; longitude: number } | null = null;

export async function startPublishing(convoyId: UUID, userId: string) {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('Location permission required');

  sub = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.BestForNavigation, // ⬅️ higher accuracy
      timeInterval: 1000,                             // ⬅️ 1s cadence
      distanceInterval: 2,                            // ⬅️ small movements matter
    },
    async (loc) => {
      const now = Date.now();
      const p = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      const moved = lastPos ? haversineMeters(lastPos, p) : Infinity;

      // Throttle network, but allow small moves each second
      if (now - lastSent < 1000 && moved < 3) return;

      lastSent = now;
      lastPos = p;

      await upsertPosition({
        convoy_id: convoyId,
        user_id: userId,
        lat: p.latitude,
        lng: p.longitude,
        speed_mps: loc.coords.speed ?? null,
        heading_deg: Number.isFinite(loc.coords.heading) ? (loc.coords.heading as number) : null,
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
