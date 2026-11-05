import { describe, it, expect } from "vitest";
import { computeEscalation, levelLabel } from "../escalation";
import { classifyConnectivity } from "../connectivity";
import { rankPaths, isConfirmed, type PathStat } from "../blast";
import { buildStatusBundle, matchBooking, type StatusFacts } from "../statusping";
import { QUICK_REQUESTS, quickRequestById } from "../quickrequests";
import type { BookingRow } from "../db";
import type { ActiveSession } from "../store";

describe("escalation", () => {
  it("is level 1 with no conditions", () => {
    const s = computeEscalation([]);
    expect(s.level).toBe(1);
    expect(s.lowSignal).toBe(false);
    expect(levelLabel(s)).toContain("Normal");
  });
  it("names Low Signal Mode at level 2", () => {
    const s = computeEscalation([{ source: "lowsignal", level: 2, reason: "sync down", since: 1 }]);
    expect(s.level).toBe(2);
    expect(s.lowSignal).toBe(true);
    expect(levelLabel(s)).toBe("Level 2 — Low Signal Mode");
  });
  it("emergency dominates and keeps every reason", () => {
    const s = computeEscalation([
      { source: "lowsignal", level: 2, reason: "dead zone", since: 1 },
      { source: "panic", level: 3, reason: "Panic button pressed", since: 2 },
    ]);
    expect(s.level).toBe(3);
    expect(s.conditions).toHaveLength(2);
    expect(s.conditions[0].source).toBe("panic"); // highest first
    expect(levelLabel(s)).toContain("Emergency");
  });
});

describe("classifyConnectivity", () => {
  const base = { online: true, syncConnected: true, consecutiveFails: 0, outboxDepth: 0, effectiveType: "4g" };
  it("clean signals = no low signal", () => {
    expect(classifyConnectivity(base).lowSignal).toBe(false);
  });
  it("hard offline engages with a reason", () => {
    const v = classifyConnectivity({ ...base, online: false });
    expect(v.lowSignal).toBe(true);
    expect(v.reasons.join(" ")).toMatch(/no network/);
  });
  it("two failed sends in a row engage", () => {
    expect(classifyConnectivity({ ...base, consecutiveFails: 2 }).lowSignal).toBe(true);
    expect(classifyConnectivity({ ...base, consecutiveFails: 1 }).lowSignal).toBe(false);
  });
  it("sync down + outbox pileup engage", () => {
    const v = classifyConnectivity({ ...base, syncConnected: false, outboxDepth: 3 });
    expect(v.lowSignal).toBe(true);
    expect(v.reasons.length).toBe(2);
  });
  it("2G effective type engages; no session handle (null) does not", () => {
    expect(classifyConnectivity({ ...base, effectiveType: "2g" }).lowSignal).toBe(true);
    expect(classifyConnectivity({ ...base, syncConnected: null }).lowSignal).toBe(false);
  });
});

describe("blast path ranking", () => {
  const stat = (ok: number, fail: number, lastOkAt: number | null, lastFailAt: number | null): PathStat => ({ ok, fail, lastOkAt, lastFailAt });
  it("confirmed = latest outcome is a success", () => {
    expect(isConfirmed(stat(2, 1, 100, 50))).toBe(true);
    expect(isConfirmed(stat(2, 1, 50, 100))).toBe(false);
    expect(isConfirmed(undefined)).toBe(false);
    expect(isConfirmed(stat(0, 0, null, null))).toBe(false);
  });
  it("confirmed paths lead, then unknown, then failed", () => {
    const ranked = rankPaths(["sync", "ntfy", "sms"], {
      sync: stat(0, 2, null, 90),
      ntfy: stat(1, 0, 80, null),
      sms: stat(0, 0, null, null),
    });
    expect(ranked[0]).toBe("ntfy");
    expect(ranked[1]).toBe("sms");
    expect(ranked[2]).toBe("sync");
  });
});

const facts = (share: StatusFacts["share"]): StatusFacts => ({
  alias: "Downtown",
  busyStatus: "On a date until 9:00 PM",
  startedAt: 1000,
  endsAt: 2000,
  deposit: 50,
  nextBookingToday: null,
  lastCheckInAt: 1500,
  locationText: "Downtown hotel",
  locationMatches: true,
  clientName: "Mike",
  clientIsNew: false,
  clientDatesDone: 3,
  notes: "Allergic to latex. Pays cash.",
  ratings: [{ ts: 500, rating: 5 }],
  share,
  escalationLevel: 2,
  escalationLabel: "Level 2 — Low Signal Mode",
  escalationReasons: ["Low Signal Mode — sync disconnected"],
  circleCommands: ["Maria acknowledged (seen)"],
});

describe("status bundle share filtering", () => {
  it("withholds dossier fields when sharing is off — and says so", () => {
    const b = buildStatusBundle(facts({ notes: false, ratings: false, history: false }));
    expect(b.text).not.toContain("Allergic to latex");
    expect(b.text).not.toContain("returning");
    expect(b.text).not.toContain("★");
    expect(b.withheld.length).toBe(3);
    // session facts still flow — the ping exists to inform the circle
    expect(b.text).toContain("Last check-in");
    expect(b.text).toContain("Low Signal Mode");
    // deposit is C&C-only data, never bundle text
    expect(b.text).not.toContain("$50");
  });
  it("includes dossier fields when sharing is on", () => {
    const b = buildStatusBundle(facts({ notes: true, ratings: true, history: true }));
    expect(b.text).toContain("Allergic to latex");
    expect(b.text).toContain("returning — 3 completed dates");
    expect(b.text).toContain("★★★★★");
    expect(b.withheld).toHaveLength(0);
  });
});

describe("matchBooking", () => {
  const session = (over: Partial<ActiveSession>): ActiveSession => ({
    id: "s1", keyB64: "k", alias: "Downtown", startedAt: 10_000_000, expectedMin: 60, incall: null, state: "active", ...over,
  });
  const booking = (over: Partial<BookingRow>): BookingRow => ({
    ts: 9_900_000, alias: "Mike", durationMin: 60, location: "", deposit: 0, status: "booked", note: "", ...over,
  });
  it("prefers the explicit bookingId link", () => {
    const rows = [booking({ id: 1 }), booking({ id: 2, ts: 0 })];
    expect(matchBooking(session({ bookingId: 2 }), rows)?.id).toBe(2);
  });
  it("falls back to the booking whose window contains the start", () => {
    const rows = [booking({ id: 7 }), booking({ id: 8, ts: 0, durationMin: 5 })];
    expect(matchBooking(session({}), rows)?.id).toBe(7);
  });
  it("returns null when nothing matches", () => {
    expect(matchBooking(session({}), [booking({ ts: 0, durationMin: 5 })])).toBeNull();
  });
});

describe("quick request catalog", () => {
  it("has unique ids and covers Rob's list", () => {
    const ids = QUICK_REQUESTS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    const labels = QUICK_REQUESTS.map((q) => q.label);
    for (const want of ["I'm ok", "Something feels wrong", "Client is being abusive verbally", "Client is being violent",
      "I NEED HELP", "Send FC (Fake Call)", "Date is great", "Date is running late", "SEND RESCUE HERE ASAP",
      "All is good now", "Cancel last request", "Send Door Knock now", "Send Door Knock at end of scheduled date"]) {
      expect(labels).toContain(want);
    }
    expect(labels.some((l) => l.includes("cop siren"))).toBe(true);
    expect(labels.filter((l) => l.startsWith("Date extended"))).toHaveLength(4);
    expect(labels.filter((l) => l.startsWith("Send Door Knock"))).toHaveLength(7);
  });
  it("timed requests carry follow-ups; extensions carry minutes", () => {
    expect(quickRequestById("knock5")?.followupMin).toBe(5);
    expect(quickRequestById("knockend")?.followupAtEnd).toBe(true);
    expect(quickRequestById("siren5")?.followupMin).toBe(5);
    expect(quickRequestById("ext60")?.extendMin).toBe(60);
    expect(quickRequestById("cancel")?.cancelLast).toBe(true);
    expect(quickRequestById("violent")?.severity).toBe("critical");
  });
});
