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

/** Compass bearing from a to b, degrees 0–360. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export type ApproachState = "far" | "approaching" | "arrived";

/** Arrival semantics shared by provider + watcher views. */
export function approachState(distM: number, radiusM: number): ApproachState {
  if (distM < 30) return "arrived";
  if (distM < radiusM) return "approaching";
  return "far";
}

/**
 * Rough ETA in seconds for a watcher display. Uses the mover's live speed
 * when plausible; otherwise assumes city driving (8 m/s) beyond 800 m and
 * walking (1.4 m/s) inside it. Deliberately labeled "≈" in the UI.
 */
export function etaSeconds(distM: number, speedMps?: number | null): number {
  if (distM < 30) return 0;
  let v = speedMps && speedMps > 0.5 && speedMps < 60 ? speedMps : distM > 800 ? 8 : 1.4;
  // closing speed can't exceed what's plausible for the remaining distance
  v = Math.max(v, 0.5);
  return Math.round(distM / v);
}

export function formatEta(sec: number): string {
  if (sec <= 0) return "now";
  if (sec < 90) return "≈1 min";
  return `≈${Math.round(sec / 60)} min`;
}

/**
 * Best-effort human-readable street address for a position (Phase 2:
 * address-in-alerts). Uses BigDataCloud's free keyless client API; returns
 * null on any failure — an alert must never wait on a geocoder.
 */
export async function reverseGeocode(p: LatLng): Promise<string | null> {
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 4000);
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${p.lat}&longitude=${p.lng}&localityLanguage=en`,
      { signal: ctl.signal }
    );
    clearTimeout(to);
    if (!res.ok) return null;
    const j = (await res.json()) as { locality?: string; city?: string; principalSubdivision?: string; plusCode?: string };
    const parts = [j.locality, j.city, j.principalSubdivision].filter(Boolean);
    const uniq = parts.filter((v, i) => parts.indexOf(v) === i);
    return uniq.length ? `near ${uniq.join(", ")}` : null;
  } catch {
    return null;
  }
}
