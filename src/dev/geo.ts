export type LatLng = { latitude: number; longitude: number };

const R = 6371000; // meters

export function haversine(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function within(a: LatLng, b: LatLng, meters: number) {
  return haversine(a, b) <= meters;
}

function toRad(d: number) {
  return (d * Math.PI) / 180;
}
