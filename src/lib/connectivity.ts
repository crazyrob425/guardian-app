// Phase 8 — connectivity detection + Low Signal Mode driver.
//
// Detection is deliberately multi-signal, because no single browser API
// tells the truth in a dead zone:
//   · navigator.onLine + online/offline events (coarse, lies on captive
//     portals — but a hard "offline" is real),
//   · the live sync handle's connected() state (the pipe that matters),
//   · send outcomes from the alert stack (a failed blast is ground truth),
//   · the offline outbox depth (messages visibly stuck),
//   · the Network Information API where the platform exposes it
//     (effectiveType / downlink / rtt — Android Chrome yes, iOS no).
//
// When the classifier says the pipe is bad, Low Signal Mode engages (an
// escalation condition — see lib/escalation.ts) and the ticker announces
// it. Recovery uses hysteresis: 45 s of clean signals before standing
// down, so a flickering connection doesn't flap the mode.
//
// HARD RULE: detection is advisory only. Nothing in here can delay,
// block, or downgrade a panic/SOS — it only ever ADDS redundancy.

import { engageLowSignal, clearLowSignal, getEscalation } from "./escalation";
import { logEvent } from "./events";

export interface ConnInfo {
  effectiveType: string | null; // "4g" | "3g" | "2g" | "slow-2g" | null
  downlinkMbps: number | null;
  rttMs: number | null;
  saveData: boolean;
}

export function connectionInfo(): ConnInfo {
  try {
    const nav = navigator as Navigator & {
      connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
    };
    const c = nav.connection;
    if (!c) return { effectiveType: null, downlinkMbps: null, rttMs: null, saveData: false };
    return {
      effectiveType: c.effectiveType ?? null,
      downlinkMbps: typeof c.downlink === "number" ? c.downlink : null,
      rttMs: typeof c.rtt === "number" ? c.rtt : null,
      saveData: !!c.saveData,
    };
  } catch {
    return { effectiveType: null, downlinkMbps: null, rttMs: null, saveData: false };
  }
}

export interface ConnSignals {
  online: boolean;
  syncConnected: boolean | null; // null = no live session handle right now
  consecutiveFails: number;
  outboxDepth: number;
  effectiveType: string | null;
}

/** Pure classifier. Exported for tests. */
export function classifyConnectivity(s: ConnSignals): { lowSignal: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!s.online) reasons.push("phone reports no network connection");
  if (s.syncConnected === false) reasons.push("safety sync is disconnected");
  if (s.consecutiveFails >= 2) reasons.push(`${s.consecutiveFails} messages in a row failed to send`);
  if (s.outboxDepth >= 3) reasons.push(`${s.outboxDepth} alerts are stuck in the outbox`);
  if (s.effectiveType === "2g" || s.effectiveType === "slow-2g") reasons.push("connection is running at 2G speed");
  return { lowSignal: reasons.length > 0, reasons };
}

// ---- singleton monitor -----------------------------------------------------

interface MonitorState {
  started: boolean;
  sessionId: string;
  syncProbe: (() => boolean) | null;
  outboxProbe: (() => Promise<number>) | null;
  consecutiveFails: number;
  cleanSince: number | null;
  timer: number;
}

const M: MonitorState = {
  started: false,
  sessionId: "",
  syncProbe: null,
  outboxProbe: null,
  consecutiveFails: 0,
  cleanSince: null,
  timer: 0,
};

const CLEAR_AFTER_MS = 45_000;

/** The session screens register their live sync handle + outbox reader. */
export function registerConnProbes(p: { sessionId: string; syncConnected: () => boolean; outboxDepth: () => Promise<number> }) {
  M.sessionId = p.sessionId;
  M.syncProbe = p.syncConnected;
  M.outboxProbe = p.outboxDepth;
}

export function unregisterConnProbes() {
  M.syncProbe = null;
  M.outboxProbe = null;
}

/** Every alert-stack send reports its outcome here — failures are signal. */
export function noteSendOutcome(ok: boolean) {
  if (ok) M.consecutiveFails = 0;
  else {
    M.consecutiveFails += 1;
    void evaluate();
  }
}

async function evaluate(): Promise<void> {
  const sessionId = M.sessionId || currentSessionId();
  let outboxDepth = 0;
  if (M.outboxProbe) {
    try { outboxDepth = await M.outboxProbe(); } catch { /* treat as unknown */ }
  }
  const verdict = classifyConnectivity({
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    syncConnected: M.syncProbe ? safeSync() : null,
    consecutiveFails: M.consecutiveFails,
    outboxDepth,
    effectiveType: connectionInfo().effectiveType,
  });
  const esc = getEscalation(sessionId);
  if (verdict.lowSignal) {
    M.cleanSince = null;
    if (!esc.lowSignal) {
      engageLowSignal(sessionId, verdict.reasons);
      logEvent("status", `📶 LOW SIGNAL MODE — ${verdict.reasons.join("; ")}. Fallback messages will blast out every path the moment one works.`, sessionId);
    }
  } else if (esc.lowSignal) {
    if (M.cleanSince == null) M.cleanSince = Date.now();
    if (Date.now() - M.cleanSince >= CLEAR_AFTER_MS) {
      clearLowSignal(sessionId);
      logEvent("status", "📶 Signal recovered — Low Signal Mode off. Queued messages flushed.", sessionId);
      M.cleanSince = null;
    }
  } else {
    M.cleanSince = null;
  }
}

function safeSync(): boolean {
  try { return M.syncProbe ? M.syncProbe() : false; } catch { return false; }
}

function currentSessionId(): string {
  try {
    const raw = localStorage.getItem("guardian.session.v1");
    if (raw) return (JSON.parse(raw) as { id?: string }).id || "";
  } catch { /* noop */ }
  return "";
}

/** Idempotent. Started by App once unlocked; cheap 5 s tick. */
export function startConnectivityMonitor() {
  if (M.started) return;
  M.started = true;
  const tick = () => { void evaluate(); };
  M.timer = window.setInterval(tick, 5000);
  window.addEventListener("online", tick);
  window.addEventListener("offline", tick);
  tick();
}

export function connectivitySnapshot(): { online: boolean; info: ConnInfo; consecutiveFails: number } {
  return {
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    info: connectionInfo(),
    consecutiveFails: M.consecutiveFails,
  };
}
