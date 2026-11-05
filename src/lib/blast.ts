// Phase 8 — multi-path blast + delivery learning.
//
// Rob's fallback-messaging spec, as an engine:
//
//  · The backup paths are the ones SHE configured (Sis walkthrough step /
//    Settings → Backup alert paths). Only real paths exist in the catalog,
//    and manual ones (share sheet, deep links) are labeled manual — the
//    app can't pretend a human-tap path confirmed delivery.
//
//  · PROBE BLAST: when connectivity trouble is detected, a time-critical
//    message fires via EVERY configured automated path at once. That gets
//    delayed critical traffic out ASAP *and* probes which networks are
//    actually alive right now.
//
//  · DELIVERY LEARNING: every path's confirm/fail is recorded per session.
//    For the rest of that date the app leads with confirmed paths, then —
//    for critical traffic — fires the remaining paths (always including
//    the built-in Guardian push) 5–10 s later as a second wave.
//
// Delivery "confirmation" is honest per path: sync = broker accepted the
// publish / queued to outbox is NOT a confirm; push = the ntfy POST
// completed at network level; SMS relay = the relay answered OK. A demo /
// unconfigured path never reports a confirm.

import type { Settings } from "./store";
import { logEvent } from "./events";

export type PathId = "sync" | "ntfy" | "sms" | "smslink" | "share" | "email";

export interface PathDef {
  id: PathId;
  label: string;
  automated: boolean; // false = needs a human tap (composer / share sheet)
  builtin: boolean; // Guardian's own pipe — always rides the second wave
  blurb: string;
}

export const PATH_DEFS: Record<PathId, PathDef> = {
  sync: {
    id: "sync", label: "Guardian live sync", automated: true, builtin: true,
    blurb: "The encrypted session channel her circle watches live. Always on during a date.",
  },
  ntfy: {
    id: "ntfy", label: "Guardian push (ntfy)", automated: true, builtin: true,
    blurb: "Free push pings to her circle's phones via the ntfy server in Settings (ours by default). Content-free — just “check the app NOW”.",
  },
  sms: {
    id: "sms", label: "Text relay (SMS)", automated: true, builtin: false,
    blurb: "Real carrier texts to her circle via the SMS relay in Settings. Needs the relay configured.",
  },
  smslink: {
    id: "smslink", label: "My Messages app", automated: false, builtin: false,
    blurb: "Opens her own Messages app with the alert prefilled to the whole circle — she taps Send. Free, from her own number.",
  },
  share: {
    id: "share", label: "Share sheet", automated: false, builtin: false,
    blurb: "Her phone's share menu — WhatsApp, Messenger, Telegram, whatever she already uses.",
  },
  email: {
    id: "email", label: "Email", automated: false, builtin: false,
    blurb: "Opens her mail app with the alert prefilled to her circle's addresses she adds there.",
  },
};

export const ALL_PATH_IDS = Object.keys(PATH_DEFS) as PathId[];

/** Paths that are enabled in Settings AND actually usable right now. */
export function configuredPaths(s: Settings): PathDef[] {
  const wanted = new Set((s.backupPaths ?? []).length ? s.backupPaths : ["sync", "ntfy", "sms"]);
  return ALL_PATH_IDS
    .map((id) => PATH_DEFS[id])
    .filter((d) => {
      if (d.id === "sync") return true; // the session channel is always a path
      if (!wanted.has(d.id)) return false;
      if (d.id === "ntfy") return !!s.ntfyTopic.trim();
      if (d.id === "sms") return !!s.twilioWorkerUrl.trim();
      return true; // manual paths need no config
    });
}

export function automatedPaths(s: Settings): PathDef[] {
  return configuredPaths(s).filter((d) => d.automated);
}

export function manualPaths(s: Settings): PathDef[] {
  return configuredPaths(s).filter((d) => !d.automated);
}

// ---- delivery learning ------------------------------------------------------

export interface PathStat {
  ok: number;
  fail: number;
  lastOkAt: number | null;
  lastFailAt: number | null;
}

const rankKey = (sessionId: string) => `guardian.pathrank.${sessionId || "app"}.v1`;

export function loadPathStats(sessionId: string): Record<string, PathStat> {
  try {
    const raw = localStorage.getItem(rankKey(sessionId));
    if (raw) return JSON.parse(raw) as Record<string, PathStat>;
  } catch { /* fresh */ }
  return {};
}

export function recordPathResult(sessionId: string, id: PathId, ok: boolean): void {
  const stats = loadPathStats(sessionId);
  const st: PathStat = stats[id] ?? { ok: 0, fail: 0, lastOkAt: null, lastFailAt: null };
  if (ok) { st.ok += 1; st.lastOkAt = Date.now(); }
  else { st.fail += 1; st.lastFailAt = Date.now(); }
  stats[id] = st;
  try { localStorage.setItem(rankKey(sessionId), JSON.stringify(stats)); } catch { /* noop */ }
}

/** A path counts as confirmed when its latest outcome is a success. Pure. */
export function isConfirmed(st: PathStat | undefined): boolean {
  if (!st || st.ok === 0) return false;
  return st.lastFailAt == null || (st.lastOkAt ?? 0) > st.lastFailAt;
}

/**
 * Pure ordering: confirmed paths first (freshest success first), then
 * never-tried, then failed. The built-in push wins ties — it's ours.
 * Exported for tests.
 */
export function rankPaths(ids: PathId[], stats: Record<string, PathStat>): PathId[] {
  const score = (id: PathId): [number, number] => {
    const st = stats[id];
    if (isConfirmed(st)) return [0, -(st!.lastOkAt ?? 0)];
    if (!st || (st.ok === 0 && st.fail === 0)) return [1, id === "ntfy" ? 0 : 1];
    return [2, -(st?.lastFailAt ?? 0)];
  };
  return [...ids].sort((a, b) => {
    const [ga, ta] = score(a);
    const [gb, tb] = score(b);
    return ga - gb || ta - tb;
  });
}

// ---- the blast itself ---------------------------------------------------------

export interface BlastSender {
  id: PathId;
  run: () => Promise<boolean>; // true = delivered/confirmed at that path's honesty level
}

export interface BlastOutcome {
  results: Partial<Record<PathId, boolean>>;
  secondWaveAt: number | null;
}

/**
 * Send a message through the path engine.
 *
 * opts.probe — fire every automated path at once (trouble detected / Low
 *   Signal Mode engaging). This is the probe blast.
 * otherwise — first wave = confirmed paths (or best-ranked single path if
 *   nothing is confirmed yet). For critical messages with any configured
 *   path left over, a second wave fires after `secondWaveSec` covering the
 *   rest — always including the built-in push path.
 */
export async function blastSend(opts: {
  sessionId: string;
  senders: BlastSender[];
  critical: boolean;
  probe?: boolean;
  secondWaveSec?: number;
  label: string;
}): Promise<BlastOutcome> {
  const { sessionId, senders, critical, label } = opts;
  const stats = loadPathStats(sessionId);
  const ids = senders.map((s) => s.id);
  const ranked = rankPaths(ids, stats);
  const byId = new Map(senders.map((s) => [s.id, s]));

  const results: Partial<Record<PathId, boolean>> = {};
  const runOne = async (id: PathId): Promise<void> => {
    const sender = byId.get(id);
    if (!sender) return;
    let ok = false;
    try { ok = await sender.run(); } catch { ok = false; }
    results[id] = ok;
    recordPathResult(sessionId, id, ok);
  };

  let firstWave: PathId[];
  if (opts.probe) {
    firstWave = ranked;
  } else {
    const confirmed = ranked.filter((id) => isConfirmed(stats[id]));
    firstWave = confirmed.length ? confirmed : ranked.slice(0, 1);
  }
  await Promise.all(firstWave.map(runOne));

  const delivered = firstWave.some((id) => results[id]);
  let secondWaveAt: number | null = null;

  if (critical) {
    const rest = ranked.filter((id) => !firstWave.includes(id));
    // The built-in push always rides the second wave, even if it ran first.
    if (byId.has("ntfy") && !rest.includes("ntfy")) rest.push("ntfy");
    if (rest.length) {
      const delaySec = Math.min(10, Math.max(5, opts.secondWaveSec ?? 7));
      secondWaveAt = Date.now() + delaySec * 1000;
      const pending = [...rest];
      window.setTimeout(() => {
        void (async () => {
          const second: string[] = [];
          for (const id of pending) {
            await runOne(id);
            second.push(`${PATH_DEFS[id].label}: ${results[id] ? "delivered" : "failed"}`);
          }
          logEvent("command", `Second wave (${label}): ${second.join(" · ")}`, sessionId);
        })();
      }, delaySec * 1000);
    }
  }

  const summary = firstWave.map((id) => `${PATH_DEFS[id].label}: ${results[id] ? "delivered" : "failed"}`).join(" · ");
  logEvent("command", `${opts.probe ? "Probe blast" : "Sent"} (${label}) — ${summary}${secondWaveAt ? " · second wave in " + Math.round((secondWaveAt - Date.now()) / 1000) + "s" : ""}${!delivered && !secondWaveAt ? " · NOTHING DELIVERED — queued for retry" : ""}`, sessionId);
  return { results, secondWaveAt };
}
