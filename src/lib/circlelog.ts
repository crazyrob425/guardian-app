// Phase 8 — the circle log's local model.
//
// What Command & Control shows per circle member: joined when, watching
// now or offline (last active when), last response, remote commands they
// sent. The honest data sources on today's transport:
//
//   · presence heartbeats from the watch page (they ARE watching, now),
//   · alert traffic (acks = responses; status/stream/fake-call requests =
//     remote commands) recorded as it arrives,
//   · the configured circle in Settings for who belongs at all.
//
// There are no read receipts on this transport and this module does not
// invent any: "last response" = last ack/DM/command actually received.
// Presence + command transport over Matrix/ntfy is the Phase 8 backend
// (see NATIVE_AND_AI.md §12) — records are keyed so it can feed this same
// model later.

import type { CircleMember } from "./store";

export interface MemberRecord {
  name: string;
  joinedAt: number | null; // first presence seen this session
  lastSeenAt: number | null; // last presence heartbeat (any session)
  lastAction: string | null; // "acknowledged: on my way" / "requested full status" / …
  lastActionAt: number | null;
}

export interface CirclePresence extends MemberRecord {
  watching: boolean; // heartbeat fresh (< 45 s)
  inCircle: boolean; // a configured circle member vs a named watcher
}

const sessKey = (sessionId: string) => `guardian.circlelog.${sessionId}.v1`;
const lastKey = "guardian.circlelast.v1";
export const WATCHING_WINDOW_MS = 45_000;

function readMap<T>(key: string): Record<string, T> {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as Record<string, T>;
  } catch { /* fresh */ }
  return {};
}

function writeMap<T>(key: string, m: Record<string, T>) {
  try { localStorage.setItem(key, JSON.stringify(m)); } catch { /* noop */ }
}

export function recordPresence(sessionId: string, name: string, ts = Date.now()): void {
  if (!name) return;
  const m = readMap<MemberRecord>(sessKey(sessionId));
  const cur: MemberRecord = m[name] ?? { name, joinedAt: null, lastSeenAt: null, lastAction: null, lastActionAt: null };
  if (cur.joinedAt == null) cur.joinedAt = ts;
  cur.lastSeenAt = ts;
  m[name] = cur;
  writeMap(sessKey(sessionId), m);
  const g = readMap<number>(lastKey);
  g[name] = ts;
  writeMap(lastKey, g);
}

export function recordCircleAction(sessionId: string, name: string, action: string, ts = Date.now()): void {
  if (!name) return;
  const m = readMap<MemberRecord>(sessKey(sessionId));
  const cur: MemberRecord = m[name] ?? { name, joinedAt: null, lastSeenAt: null, lastAction: null, lastActionAt: null };
  cur.lastAction = action;
  cur.lastActionAt = ts;
  if (cur.lastSeenAt == null) cur.lastSeenAt = ts;
  m[name] = cur;
  writeMap(sessKey(sessionId), m);
  const g = readMap<number>(lastKey);
  g[name] = Math.max(g[name] ?? 0, ts);
  writeMap(lastKey, g);
}

/** Merge configured circle + everyone actually seen, for the C&C circle log. Pure given `now`. */
export function buildCircleLog(sessionId: string, members: CircleMember[], now: number): CirclePresence[] {
  const m = readMap<MemberRecord>(sessKey(sessionId));
  const g = readMap<number>(lastKey);
  const names = new Set<string>([...members.map((x) => x.name), ...Object.keys(m)]);
  const out: CirclePresence[] = [];
  for (const name of names) {
    const rec: MemberRecord = m[name] ?? {
      name,
      joinedAt: null,
      lastSeenAt: g[name] ?? null,
      lastAction: null,
      lastActionAt: null,
    };
    out.push({
      ...rec,
      lastSeenAt: rec.lastSeenAt ?? g[name] ?? null,
      watching: rec.lastSeenAt != null && now - rec.lastSeenAt < WATCHING_WINDOW_MS,
      inCircle: members.some((x) => x.name === name),
    });
  }
  return out.sort((a, b) => Number(b.watching) - Number(a.watching) || (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0));
}
