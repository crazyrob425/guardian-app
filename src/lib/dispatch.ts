// Phase 8 — one dispatch door for circle-bound messages.
//
// SessionScreen, Command & Control, and the follow-up host all send
// through here so every message gets the same treatment:
//   · per-path senders are built from the paths SHE configured,
//   · the blast engine (lib/blast.ts) orders/probes/second-waves them,
//   · outcomes feed delivery learning AND the connectivity monitor,
//   · everything is written to the event/command log.
//
// Privacy note: the ntfy path stays content-free by design (its topic is
// a shared bell, not a mailbox) — it pings "open Guardian", while the
// actual words travel on the encrypted sync channel and carrier SMS.

import { store, type Settings, type CircleMember, type ActiveSession } from "./store";
import { blastSend, automatedPaths, type BlastSender, type BlastOutcome, type PathId } from "./blast";
import { sendPush } from "./notify";
import { alertCircle } from "./sms";
import { noteSendOutcome } from "./connectivity";
import { logEvent } from "./events";
import { setCondition, clearCondition, getEscalation } from "./escalation";
import { scheduleFollowUp, cancelLastFollowUps, type FollowUp } from "./quickrequests";
import type { QuickRequest } from "./quickrequests";

export interface SyncDoor {
  connected: () => boolean;
  send: () => Promise<void>; // performs the caller's sync publish
}

export interface DispatchOpts {
  sessionId: string;
  settings: Settings;
  circle: CircleMember[];
  label: string; // short label for logs ("PANIC BUTTON", "Quick request: …")
  critical: boolean;
  probe?: boolean; // fire every path at once (trouble / explicit)
  sync?: SyncDoor;
  smsBody?: string; // text for the SMS path
  pushTitle?: string; // ntfy title (content-free)
  pushBody?: string; // ntfy body (content-free)
  smsMembers?: CircleMember[]; // restrict SMS to one member (1:1 requests)
  onlyPaths?: PathId[]; // restrict to these paths (e.g. stand-down stays sync-only, as before)
}

export async function dispatchMessage(opts: DispatchOpts): Promise<BlastOutcome> {
  const { settings, sessionId } = opts;
  const paths = automatedPaths(settings).filter((d) => !opts.onlyPaths || opts.onlyPaths.includes(d.id));
  const senders: BlastSender[] = [];

  for (const def of paths) {
    if (def.id === "sync" && opts.sync) {
      const door = opts.sync;
      senders.push({
        id: "sync",
        run: async () => {
          await door.send();
          // QoS-1 publish on a live socket = delivered. Offline publishes
          // land in the encrypted outbox instead — queued, NOT confirmed.
          return door.connected();
        },
      });
    } else if (def.id === "ntfy") {
      senders.push({
        id: "ntfy",
        run: () =>
          sendPush(settings, {
            title: opts.pushTitle ?? "Guardian",
            body: opts.pushBody ?? `${settings.displayName || "Your Guardian contact"} sent a message — open your Guardian watch link.`,
            priority: opts.critical ? 5 : 4,
            tags: opts.critical ? "rotating_light" : "speech_balloon",
          }),
      });
    } else if (def.id === "sms" && opts.smsBody) {
      const body = opts.smsBody;
      const members = opts.smsMembers ?? opts.circle;
      senders.push({
        id: "sms",
        run: async () => {
          const results = await alertCircle(settings, members, body);
          // Demo-mode "ok" is not a delivery. A confirm needs a real send.
          return results.some((r) => r.result.ok && !("demo" in r.result && r.result.demo));
        },
      });
    }
  }

  if (!senders.length) {
    logEvent("command", `No automated path available for: ${opts.label} — message kept on-device (event log).`, sessionId);
    noteSendOutcome(false);
    return { results: {}, secondWaveAt: null };
  }

  const outcome = await blastSend({
    sessionId,
    senders,
    critical: opts.critical,
    probe: opts.probe,
    secondWaveSec: settings.backupSecondWaveSec,
    label: opts.label,
  });
  const anyOk = Object.values(outcome.results).some(Boolean);
  noteSendOutcome(anyOk);
  return outcome;
}

// ---- quick request execution -------------------------------------------------

export interface QuickExecOpts {
  req: QuickRequest;
  session: ActiveSession;
  settings: Settings;
  circle: CircleMember[];
  target?: CircleMember | null; // null = whole circle
  sync?: SyncDoor;
}

/**
 * Execute a quick request end-to-end: escalation effects, session
 * extension, follow-up scheduling, then the message itself through the
 * blast door. Returns a human summary for the UI.
 */
export async function executeQuickRequest(opts: QuickExecOpts): Promise<string> {
  const { req, session, settings, circle, target } = opts;
  const sid = session.id;
  const who = target ? target.name : "the whole circle";

  logEvent("request", `${req.icon} Quick request to ${who}: “${req.label}”`, sid);

  if (req.cancelLast) {
    const n = cancelLastFollowUps(sid);
    logEvent("command", `Cancelled ${n} pending follow-up${n === 1 ? "" : "s"} from the last request.`, sid);
  }

  if (req.escalation) {
    if ("clear" in req.escalation) {
      clearCondition(sid, req.escalation.clear);
      logEvent("status", `Escalation cleared: ${req.escalation.clear}.`, sid);
    } else {
      setCondition(sid, req.escalation.source, req.escalation.level, req.escalation.reason);
      logEvent("status", `Escalation raised: ${req.escalation.reason}.`, sid);
    }
  }

  let extendedTo: number | null = null;
  if (req.extendMin) {
    const cur = store.getSession();
    if (cur && cur.id === sid) {
      const next = { ...cur, expectedMin: cur.expectedMin + req.extendMin };
      store.saveSession(next);
      extendedTo = next.startedAt + next.expectedMin * 60000;
      logEvent("command", `Session extended by ${req.extendMin} min — new end ${new Date(extendedTo).toLocaleTimeString()}.`, sid);
    }
  }

  if (req.followupMin || req.followupAtEnd) {
    const at = req.followupAtEnd
      ? session.startedAt + session.expectedMin * 60000
      : Date.now() + (req.followupMin ?? 0) * 60000;
    scheduleFollowUp(sid, {
      at,
      label: req.followupLabel ?? req.label,
      requestId: req.id,
      toName: target?.name ?? "circle",
    });
    logEvent("command", `Follow-up scheduled for ${new Date(at).toLocaleTimeString()}: “${req.followupLabel ?? req.label}”`, sid);
  }

  if (req.id === "ok" || req.id === "allgood" || req.id === "great") {
    logEvent("checkin", `Check-in via quick request: “${req.label}”`, sid);
  }

  const esc = getEscalation(sid);
  const critical = req.severity === "critical";
  const body = `Guardian${target ? ` (for ${target.name})` : ""}: ${settings.displayName || "Your contact"} — ${req.label}${extendedTo ? ` New end: ${new Date(extendedTo).toLocaleTimeString()}.` : ""}`;
  await dispatchMessage({
    sessionId: sid,
    settings,
    circle,
    label: `Quick request: ${req.label}`,
    critical,
    probe: esc.lowSignal || critical,
    sync: opts.sync,
    smsBody: body,
    smsMembers: target ? [target] : undefined,
    pushTitle: critical ? "🆘 GUARDIAN REQUEST" : "Guardian request",
    pushBody: `${settings.displayName || "Your Guardian contact"}: ${req.label}. Open your Guardian watch link.`,
  });
  return `Sent “${req.label}” to ${who}.`;
}

/** Fire a due follow-up (App-level host — push + SMS + log; no sync handle). */
export async function runFollowUp(fu: FollowUp, session: ActiveSession): Promise<void> {
  const settings = store.getSettings();
  const circle = store.getCircle();
  logEvent("command", `⏰ Follow-up fired: “${fu.label}” (for ${fu.toName})`, session.id);
  const members = fu.toName === "circle" ? circle : circle.filter((m) => m.name === fu.toName);
  await dispatchMessage({
    sessionId: session.id,
    settings,
    circle,
    label: `Follow-up: ${fu.label}`,
    critical: true,
    probe: getEscalation(session.id).lowSignal,
    smsBody: `Guardian: ${settings.displayName || "Your contact"} — ${fu.label}`,
    smsMembers: members.length ? members : circle,
    pushTitle: "Guardian follow-up",
    pushBody: `${settings.displayName || "Your Guardian contact"} — ${fu.label}. Open your Guardian watch link.`,
  });
}
