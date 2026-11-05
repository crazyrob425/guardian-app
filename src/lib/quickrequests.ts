// Phase 8 — quick requests: the predefined one-tap messages from Rob's
// spec, sent from Command & Control to a circle member or the whole
// circle. Each entry maps to concrete app behavior:
//
//   · message     — the label itself is the message to the circle.
//   · extendMin   — also extends the active session locally + notifies.
//   · followupMin — also schedules a "NOW" follow-up that fires through
//                   the alert paths when the timer lands (persisted, so
//                   it survives navigation; run by App's follow-up host).
//   · followupAtEnd — follow-up fires at the scheduled end of the date.
//   · escalation  — raises/clears an escalation condition on send.
//   · cancelLast  — cancels pending follow-ups + tells the circle.
//
// The catalog is pure data so it can be unit-tested and rendered anywhere.

export type QuickSeverity = "ok" | "info" | "warn" | "critical";

export interface QuickRequest {
  id: string;
  label: string;
  icon: string;
  severity: QuickSeverity;
  extendMin?: number;
  followupMin?: number;
  followupAtEnd?: boolean;
  followupLabel?: string; // the "NOW" message when a timed follow-up fires
  escalation?: { source: string; level: 2 | 3; reason: string } | { clear: string };
  cancelLast?: boolean;
}

export const QUICK_REQUESTS: QuickRequest[] = [
  { id: "ok", label: "I'm ok", icon: "✅", severity: "ok" },
  { id: "wrong", label: "Something feels wrong", icon: "🟡", severity: "warn",
    escalation: { source: "concern", level: 2, reason: "She flagged: something feels wrong" } },
  { id: "abusive", label: "Client is being abusive verbally", icon: "🗯️", severity: "warn",
    escalation: { source: "concern", level: 2, reason: "Client is being verbally abusive" } },
  { id: "violent", label: "Client is being violent", icon: "🔴", severity: "critical",
    escalation: { source: "rescue", level: 3, reason: "Client is being violent" } },
  { id: "help", label: "I NEED HELP", icon: "🆘", severity: "critical",
    escalation: { source: "rescue", level: 3, reason: "She sent: I NEED HELP" } },
  { id: "fc", label: "Send FC (Fake Call)", icon: "📞", severity: "info" },
  { id: "siren5", label: "Trigger cop siren / armed guard warning in 5 minutes", icon: "🚨", severity: "warn",
    followupMin: 5, followupLabel: "Trigger the cop siren / armed guard warning NOW" },
  { id: "great", label: "Date is great", icon: "💚", severity: "ok" },
  { id: "late", label: "Date is running late", icon: "🕐", severity: "info" },
  { id: "ext15", label: "Date extended 15 minutes", icon: "⏩", severity: "info", extendMin: 15 },
  { id: "ext30", label: "Date extended 30 minutes", icon: "⏩", severity: "info", extendMin: 30 },
  { id: "ext60", label: "Date extended 60 minutes", icon: "⏩", severity: "info", extendMin: 60 },
  { id: "ext120", label: "Date extended 120 minutes", icon: "⏩", severity: "info", extendMin: 120 },
  { id: "rescue", label: "SEND RESCUE HERE ASAP", icon: "🚑", severity: "critical",
    escalation: { source: "rescue", level: 3, reason: "She sent: SEND RESCUE HERE ASAP" } },
  { id: "knock0", label: "Send Door Knock now", icon: "🚪", severity: "warn" },
  { id: "knock5", label: "Send Door Knock in 5 minutes", icon: "🚪", severity: "warn",
    followupMin: 5, followupLabel: "Door Knock — NOW" },
  { id: "knock10", label: "Send Door Knock in 10 minutes", icon: "🚪", severity: "warn",
    followupMin: 10, followupLabel: "Door Knock — NOW" },
  { id: "knock15", label: "Send Door Knock in 15 minutes", icon: "🚪", severity: "warn",
    followupMin: 15, followupLabel: "Door Knock — NOW" },
  { id: "knock20", label: "Send Door Knock in 20 minutes", icon: "🚪", severity: "warn",
    followupMin: 20, followupLabel: "Door Knock — NOW" },
  { id: "knock30", label: "Send Door Knock in 30 minutes", icon: "🚪", severity: "warn",
    followupMin: 30, followupLabel: "Door Knock — NOW" },
  { id: "knockend", label: "Send Door Knock at end of scheduled date", icon: "🚪", severity: "warn",
    followupAtEnd: true, followupLabel: "Door Knock — NOW (end of date)" },
  { id: "allgood", label: "All is good now", icon: "💚", severity: "ok",
    escalation: { clear: "concern" } },
  { id: "cancel", label: "Cancel last request", icon: "↩️", severity: "info", cancelLast: true },
];

export function quickRequestById(id: string): QuickRequest | undefined {
  return QUICK_REQUESTS.find((q) => q.id === id);
}

/** Critical requests always ride the full blast, probe-style. */
export function isCritical(q: QuickRequest): boolean {
  return q.severity === "critical";
}

// ---- scheduled follow-ups (persisted; run by the App-level host) -----------

export interface FollowUp {
  id: string;
  at: number;
  label: string;
  requestId: string;
  toName: string; // circle member name, or "circle"
}

const fuKey = (sessionId: string) => `guardian.followups.${sessionId}.v1`;

export function pendingFollowUps(sessionId: string): FollowUp[] {
  try {
    const raw = localStorage.getItem(fuKey(sessionId));
    if (raw) return JSON.parse(raw) as FollowUp[];
  } catch { /* fresh */ }
  return [];
}

function saveFollowUps(sessionId: string, list: FollowUp[]) {
  try { localStorage.setItem(fuKey(sessionId), JSON.stringify(list)); } catch { /* noop */ }
}

export function scheduleFollowUp(sessionId: string, f: Omit<FollowUp, "id">): FollowUp {
  const out: FollowUp = { ...f, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
  saveFollowUps(sessionId, [...pendingFollowUps(sessionId), out]);
  return out;
}

/** Remove and return everything due at `now`. Pure-ish; used by the host. */
export function takeDueFollowUps(sessionId: string, now: number): FollowUp[] {
  const all = pendingFollowUps(sessionId);
  const due = all.filter((f) => f.at <= now);
  if (due.length) saveFollowUps(sessionId, all.filter((f) => f.at > now));
  return due;
}

/** Cancel the most recent request's follow-ups ("Cancel last request"). */
export function cancelLastFollowUps(sessionId: string): number {
  const all = pendingFollowUps(sessionId);
  if (!all.length) return 0;
  const lastReq = all[all.length - 1].requestId;
  const kept = all.filter((f) => f.requestId !== lastReq);
  saveFollowUps(sessionId, kept);
  return all.length - kept.length;
}

export function clearFollowUps(sessionId: string): void {
  saveFollowUps(sessionId, []);
}
