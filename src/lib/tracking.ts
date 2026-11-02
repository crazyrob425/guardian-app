// Guardian tracking engine (Phase 1 — GPS Reliability Pack).
//
// Replaces raw watchPosition publishing with a filtered, smoothed,
// adaptive-rate pipeline modeled on production fleet trackers (Traccar's
// filter chain): accuracy gate -> teleport/outlier rejection -> Kalman
// smoothing -> adaptive publish cadence. Pure decision functions are
// exported so they can be unit-tested without a GPS.

import { distanceM, type LatLng } from "./geo";
import { Kalman1D } from "./kalman";

export interface RawFix {
  pos: LatLng;
  accuracyM: number;
  speedMps: number | null;
  headingDeg: number | null;
  ts: number;
}

export interface CleanFix extends RawFix {
  quality: "good" | "coarse";
}

export type TrackMode = "idle" | "session" | "panic";

const MAX_ACCURACY_M = 65; // fixes worse than this are rejected…
const COARSE_AFTER_MS = 25_000; // …unless nothing better has arrived for this long
const MAX_PLAUSIBLE_SPEED = 60; // m/s (~216 km/h) — beyond this a jump is an outlier

/**
 * Decide whether a raw fix is acceptable given the last accepted fix.
 * Pure + exported for tests. Returns the quality to stamp, or null to drop.
 */
export function acceptFix(
  prev: CleanFix | null,
  next: RawFix,
  now: number
): "good" | "coarse" | null {
  if (next.accuracyM > MAX_ACCURACY_M) {
    // Coarse fix: only useful when we've had nothing for a while.
    if (!prev || now - prev.ts > COARSE_AFTER_MS) {
      return next.accuracyM <= 500 ? "coarse" : null;
    }
    return null;
  }
  if (prev) {
    const dt = Math.max(1, (next.ts - prev.ts) / 1000);
    const implied = distanceM(prev.pos, next.pos) / dt;
    if (implied > MAX_PLAUSIBLE_SPEED && next.accuracyM > 20) {
      return null; // teleport outlier with a sloppy fix — drop it
    }
  }
  return "good";
}

/** Publish cadence by mode: how long to wait / how far to move before publishing. */
export function publishDue(
  mode: TrackMode,
  lastPub: { ts: number; pos: LatLng } | null,
  fix: CleanFix,
  now: number
): boolean {
  if (!lastPub) return true;
  const elapsed = now - lastPub.ts;
  const moved = distanceM(lastPub.pos, fix.pos);
  switch (mode) {
    case "panic":
      return elapsed >= 2000 || moved >= 10;
    case "session":
      return elapsed >= 5000 || moved >= 25;
    default:
      return elapsed >= 10000 || moved >= 50;
  }
}

/** Battery level 0–100, or null where the Battery API doesn't exist (iOS Safari). */
export async function batteryLevel(): Promise<number | null> {
  try {
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{ level: number }>;
    };
    if (!nav.getBattery) return null;
    const b = await nav.getBattery();
    return Math.round(b.level * 100);
  } catch {
    return null;
  }
}

export class Tracker {
  private unwatch: (() => void) | null = null;
  private kalLat = new Kalman1D();
  private kalLng = new Kalman1D();
  private lastAccepted: CleanFix | null = null;
  mode: TrackMode = "session";

  constructor(
    private onFix: (f: CleanFix) => void,
    private onError?: (msg: string) => void
  ) {}

  start() {
    if (!("geolocation" in navigator)) {
      this.onError?.("Geolocation not available on this device.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const raw: RawFix = {
          pos: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          accuracyM: pos.coords.accuracy,
          speedMps: pos.coords.speed,
          headingDeg: pos.coords.heading,
          ts: pos.timestamp || Date.now(),
        };
        const q = acceptFix(this.lastAccepted, raw, Date.now());
        if (!q) return;
        const smoothed: LatLng = {
          lat: this.kalLat.filter(raw.pos.lat),
          lng: this.kalLng.filter(raw.pos.lng),
        };
        // Only smooth when the fix is decent; coarse fixes pass through raw
        // so a genuinely moved position isn't dragged behind.
        const clean: CleanFix = {
          ...raw,
          pos: q === "good" ? smoothed : raw.pos,
          quality: q,
        };
        this.lastAccepted = clean;
        this.onFix(clean);
      },
      (err) => this.onError?.(err.message),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 }
    );
    this.unwatch = () => navigator.geolocation.clearWatch(id);
  }

  stop() {
    this.unwatch?.();
    this.unwatch = null;
  }
}
