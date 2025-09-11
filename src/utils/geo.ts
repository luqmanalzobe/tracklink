// src/utils/geo.ts
export type LatLng = { latitude: number; longitude: number };

const R = 6371000; // meters

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const sin1 = Math.sin(dLat / 2);
  const sin2 = Math.sin(dLon / 2);
  const h = sin1 * sin1 + Math.cos(lat1) * Math.cos(lat2) * sin2 * sin2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function metersPerDegree(lat: number) {
  const latRad = (lat * Math.PI) / 180;
  return {
    mx: 111320 * Math.cos(latRad),
    my: 110574,
  };
}

function pointToSegmentProjection(
  p: LatLng,
  a: LatLng,
  b: LatLng
): { dist: number; t: number; snapped: LatLng } {
  const { mx, my } = metersPerDegree((a.latitude + b.latitude) / 2);
  const px = p.longitude * mx,  py = p.latitude * my;
  const ax = a.longitude * mx,  ay = a.latitude * my;
  const bx = b.longitude * mx,  by = b.latitude * my;

  const vx = bx - ax, vy = by - ay;
  if (vx === 0 && vy === 0) {
    const dx = px - ax, dy = py - ay;
    return {
      dist: Math.hypot(dx, dy),
      t: 0,
      snapped: { latitude: a.latitude, longitude: a.longitude },
    };
  }
  let t = ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy);
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * vx, cy = ay + t * vy;
  const dist = Math.hypot(px - cx, py - cy);
  return {
    dist,
    t,
    snapped: { latitude: cy / my, longitude: cx / mx },
  };
}

export function distanceToPolylineMeters(p: LatLng, poly: LatLng[]): number {
  if (poly.length < 2) return Infinity;
  let best = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    const { dist } = pointToSegmentProjection(p, poly[i], poly[i + 1]);
    if (dist < best) best = dist;
  }
  return best;
}

// NEW: project a point to the closest place on the polyline
export function projectPointToPolyline(
  p: LatLng,
  poly: LatLng[]
): { snapped: LatLng; segmentIndex: number; distanceMeters: number } {
  if (poly.length < 2) return { snapped: p, segmentIndex: -1, distanceMeters: Infinity };
  let best = { snapped: p, segmentIndex: -1, distanceMeters: Infinity };
  for (let i = 0; i < poly.length - 1; i++) {
    const res = pointToSegmentProjection(p, poly[i], poly[i + 1]);
    if (res.dist < best.distanceMeters) {
      best = { snapped: res.snapped, segmentIndex: i, distanceMeters: res.dist };
    }
  }
  return best;
}
