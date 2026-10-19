// Geolocation helpers.

export interface LatLng {
  lat: number;
  lng: number;
}

/** Watch device position. Returns an unwatch function. */
export function watchPosition(
  onPos: (p: LatLng, accuracyM: number) => void,
  onError?: (msg: string) => void
): () => void {
  if (!("geolocation" in navigator)) {
    onError?.("Geolocation not available on this device.");
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (pos) => onPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }, pos.coords.accuracy),
    (err) => onError?.(err.message),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
  );
  return () => navigator.geolocation.clearWatch(id);
}

export function getCurrentPosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("Geolocation not available"));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(err.message)),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });
}

/** Haversine distance in meters. */
export function distanceM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const aa = s1 * s1 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * s2 * s2;
  return 2 * R * Math.asin(Math.sqrt(aa));
}

export function formatDist(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export function mapsLink(p: LatLng): string {
  return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
}
