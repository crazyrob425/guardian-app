import { describe, it, expect } from "vitest";
import { distanceM, bearingDeg, approachState, etaSeconds } from "../geo";
import { Kalman1D } from "../kalman";
import { acceptFix, publishDue, type CleanFix, type RawFix } from "../tracking";

const A = { lat: 47.6062, lng: -122.3321 }; // Seattle
const B = { lat: 47.6162, lng: -122.3321 }; // ~1.11 km north

describe("geo", () => {
  it("haversine: 0.01° latitude ≈ 1112 m", () => {
    expect(distanceM(A, B)).toBeGreaterThan(1100);
    expect(distanceM(A, B)).toBeLessThan(1125);
  });
  it("bearing due north ≈ 0", () => {
    expect(bearingDeg(A, B)).toBeLessThan(1);
  });
  it("approach states", () => {
    expect(approachState(10, 150)).toBe("arrived");
    expect(approachState(100, 150)).toBe("approaching");
    expect(approachState(500, 150)).toBe("far");
  });
  it("eta: stationary assumption for walking distance", () => {
    const s = etaSeconds(140, null);
    expect(s).toBe(100); // 140 m at 1.4 m/s
  });
});

describe("kalman", () => {
  it("converges toward a constant signal and damps jitter", () => {
    const k = new Kalman1D();
    let out = 0;
    for (let i = 0; i < 60; i++) out = k.filter(47.6 + (i % 2 === 0 ? 0.0004 : -0.0004));
    expect(Math.abs(out - 47.6)).toBeLessThan(0.0002);
  });
});

describe("acceptFix", () => {
  const good: CleanFix = { pos: A, accuracyM: 8, speedMps: null, headingDeg: null, ts: 1000, quality: "good" };
  it("accepts a normal fix", () => {
    const n: RawFix = { pos: B, accuracyM: 10, speedMps: null, headingDeg: null, ts: 61_000 };
    expect(acceptFix(good, n, 61_000)).toBe("good");
  });
  it("rejects a teleport with a sloppy fix", () => {
    const far: RawFix = { pos: { lat: 48.6, lng: -122.3 }, accuracyM: 40, speedMps: null, headingDeg: null, ts: 2000 };
    expect(acceptFix(good, far, 2000)).toBeNull();
  });
  it("rejects coarse fixes while fresh, accepts when stale", () => {
    const coarse: RawFix = { pos: A, accuracyM: 200, speedMps: null, headingDeg: null, ts: 5000 };
    expect(acceptFix(good, coarse, 5000)).toBeNull();
    expect(acceptFix(good, coarse, 40_000)).toBe("coarse");
  });
});

describe("publishDue", () => {
  const last = { ts: 0, pos: A };
  const fixAt = (pos = A): CleanFix => ({ pos, accuracyM: 8, speedMps: null, headingDeg: null, ts: 0, quality: "good" });
  it("panic mode publishes after 2 s", () => {
    expect(publishDue("panic", last, fixAt(), 2100)).toBe(true);
    expect(publishDue("panic", last, fixAt(), 1000)).toBe(false);
  });
  it("session mode publishes on 25 m move", () => {
    expect(publishDue("session", last, fixAt({ lat: 47.60645, lng: -122.3321 }), 1000)).toBe(true);
  });
  it("idle mode waits 10 s", () => {
    expect(publishDue("idle", last, fixAt(), 5000)).toBe(false);
    expect(publishDue("idle", last, fixAt(), 10_500)).toBe(true);
  });
});
