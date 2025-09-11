import haversine from 'haversine';
export type Pt = { lat: number; lng: number; ts: number };

export function distanceKm(points: Pt[]): number {
  if (points.length < 2) return 0;
  let dist = 0;
  for (let i = 1; i < points.length; i++) {
    dist += haversine(
      { latitude: points[i - 1].lat, longitude: points[i - 1].lng },
      { latitude: points[i].lat, longitude: points[i].lng },
      { unit: 'km' }
    );
  }
  return dist;
}
export function durationSec(points: Pt[]): number {
  if (points.length < 2) return 0;
  return Math.max(0, Math.floor((points[points.length - 1].ts - points[0].ts) / 1000));
}
export function avgKmh(km: number, sec: number): number {
  return sec > 0 ? km / (sec / 3600) : 0;
}
