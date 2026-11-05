// Phase 8 — the session event log.
//
// One on-device log powers three surfaces: the bottom news ticker (status
// alerts, circle communications, remote commands received), the Command &
// Control screen's command log, and the "last check-in" facts. Events are
// written through to the Dexie `events` table and mirrored to in-memory
// subscribers so the ticker updates the instant something happens.
//
// Device-local only, like the rest of the private data. Never uploaded.

import { db, type EventKind } from "./db";

export type { EventKind };

export interface GuardianEvent {
  id?: number;
  sessionId: string; // "" = app-wide
  ts: number;
  kind: EventKind;
  text: string;
}

type Listener = (e: GuardianEvent) => void;
const listeners = new Set<Listener>();

const MAX_KEEP = 400; // per-database trim; plenty for a date + history

export function logEvent(kind: EventKind, text: string, sessionId = ""): void {
  const e: GuardianEvent = { sessionId, ts: Date.now(), kind, text };
  listeners.forEach((fn) => {
    try { fn(e); } catch { /* a broken listener never breaks logging */ }
  });
  void (async () => {
    try {
      await db.events.add(e);
      const count = await db.events.count();
      if (count > MAX_KEEP) {
        const old = await db.events.orderBy("ts").limit(count - MAX_KEEP).primaryKeys();
        await db.events.bulkDelete(old);
      }
    } catch { /* logging must never crash a safety path */ }
  })();
}

export function subscribeEvents(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Most recent events first. sessionId "" returns app-wide + every session. */
export async function recentEvents(limit = 30, sessionId?: string): Promise<GuardianEvent[]> {
  try {
    const rows = await db.events.orderBy("ts").reverse().limit(limit * 3).toArray();
    const filtered = sessionId ? rows.filter((r) => r.sessionId === sessionId || r.sessionId === "") : rows;
    return filtered.slice(0, limit);
  } catch {
    return [];
  }
}

export async function sessionEvents(sessionId: string, kinds?: EventKind[], limit = 100): Promise<GuardianEvent[]> {
  try {
    const rows = await db.events.where("sessionId").equals(sessionId).toArray();
    const out = rows
      .filter((r) => !kinds || kinds.includes(r.kind))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, limit);
    return out;
  } catch {
    return [];
  }
}

/** Timestamp of the most recent check-in (proof of life) for a session. */
export async function lastCheckInAt(sessionId: string): Promise<number | null> {
  try {
    const rows = await db.events.where("sessionId").equals(sessionId).toArray();
    const checks = rows.filter((r) => r.kind === "checkin").sort((a, b) => b.ts - a.ts);
    return checks.length ? checks[0].ts : null;
  } catch {
    return null;
  }
}

/** Ticker severity for an event kind — pure, exported for tests. */
export function eventTone(kind: EventKind): "info" | "warn" | "danger" {
  switch (kind) {
    case "command": return "warn";
    case "request": return "warn";
    case "status": return "info";
    case "circle": return "info";
    case "checkin": return "info";
    default: return "info";
  }
}
