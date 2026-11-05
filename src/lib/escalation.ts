// Phase 8 — escalation levels with reasons.
//
// Guardian historically had two postures (active / panic). Rob's spec adds
// a named middle: LOW SIGNAL MODE — when the phone can't reliably reach
// the circle, the app's posture rises and SAYS why. Levels:
//
//   1 — Normal. Everything nominal.
//   2 — Heightened. Low Signal Mode lives here, alongside "something
//       feels wrong" concern flags from quick requests.
//   3 — Emergency. Panic, missed check-out, rescue requests.
//
// The level is the max of a set of named conditions, each carrying its
// reason, so Command & Control can always answer "why is it there?".
// Conditions are device-local and per-session. Escalation NEVER gates a
// safety action: panic/SOS fire identically at every level; a higher
// level only adds redundancy (see lib/blast.ts).

export type EscalationLevel = 1 | 2 | 3;

export interface EscalationCondition {
  source: string; // "lowsignal" | "panic" | "missed" | "concern" | "rescue" | ...
  level: EscalationLevel;
  reason: string;
  since: number;
}

export interface EscalationState {
  level: EscalationLevel;
  conditions: EscalationCondition[];
  lowSignal: boolean;
}

const EMPTY: EscalationState = { level: 1, conditions: [], lowSignal: false };

/** Pure: fold a condition set into the effective state. Exported for tests. */
export function computeEscalation(conditions: EscalationCondition[]): EscalationState {
  if (!conditions.length) return { ...EMPTY };
  const level = conditions.reduce<EscalationLevel>((m, c) => (c.level > m ? c.level : m), 1);
  return {
    level,
    conditions: [...conditions].sort((a, b) => b.level - a.level || a.since - b.since),
    lowSignal: conditions.some((c) => c.source === "lowsignal"),
  };
}

export function levelLabel(state: EscalationState): string {
  if (state.level === 3) return "Level 3 — Emergency";
  if (state.lowSignal) return "Level 2 — Low Signal Mode";
  if (state.level === 2) return "Level 2 — Heightened";
  return "Level 1 — Normal";
}

const KEY = (sessionId: string) => `guardian.escalation.${sessionId || "app"}.v1`;

function read(sessionId: string): EscalationCondition[] {
  try {
    const raw = localStorage.getItem(KEY(sessionId));
    if (raw) return JSON.parse(raw) as EscalationCondition[];
  } catch { /* fresh */ }
  return [];
}

function write(sessionId: string, conditions: EscalationCondition[]) {
  try {
    localStorage.setItem(KEY(sessionId), JSON.stringify(conditions));
  } catch { /* noop */ }
  emit(sessionId);
}

type Listener = (s: EscalationState) => void;
const listeners = new Map<string, Set<Listener>>();

function emit(sessionId: string) {
  const set = listeners.get(sessionId) ?? listeners.get("*");
  if (!set) return;
  const state = getEscalation(sessionId);
  set.forEach((fn) => { try { fn(state); } catch { /* noop */ } });
}

export function getEscalation(sessionId: string): EscalationState {
  return computeEscalation(read(sessionId));
}

export function setCondition(sessionId: string, source: string, level: EscalationLevel, reason: string): EscalationState {
  const cur = read(sessionId).filter((c) => c.source !== source);
  cur.push({ source, level, reason, since: Date.now() });
  write(sessionId, cur);
  return computeEscalation(cur);
}

export function clearCondition(sessionId: string, source: string): EscalationState {
  const cur = read(sessionId).filter((c) => c.source !== source);
  write(sessionId, cur);
  return computeEscalation(cur);
}

export function clearAllConditions(sessionId: string): void {
  write(sessionId, []);
}

export function subscribeEscalation(sessionId: string, fn: Listener): () => void {
  const key = sessionId || "*";
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(fn);
  return () => { listeners.get(key)?.delete(fn); };
}

/** Convenience: engage / clear Low Signal Mode for a session. */
export function engageLowSignal(sessionId: string, reasons: string[]): EscalationState {
  return setCondition(sessionId, "lowsignal", 2, `Low Signal Mode — ${reasons.join("; ")}`);
}

export function clearLowSignal(sessionId: string): EscalationState {
  return clearCondition(sessionId, "lowsignal");
}
