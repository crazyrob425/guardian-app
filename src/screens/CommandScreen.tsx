import { useEffect, useRef, useState } from "react";
import { TopBar, Card, Btn } from "../components/ui";
import { store, type CircleMember } from "../lib/store";
import { importKey } from "../lib/crypto";
import { connectSession, type SyncHandle } from "../lib/sync";
import { getCurrentPosition, distanceM, type LatLng } from "../lib/geo";
import { batteryLevel } from "../lib/tracking";
import { connectionInfo, registerConnProbes, unregisterConnProbes } from "../lib/connectivity";
import { getEscalation, levelLabel, type EscalationState } from "../lib/escalation";
import { sessionEvents, logEvent, type GuardianEvent } from "../lib/events";
import { outboxCount } from "../lib/db";
import { assembleStatusFacts, buildStatusBundle, type StatusFacts } from "../lib/statusping";
import { buildCircleLog, recordPresence, recordCircleAction, type CirclePresence } from "../lib/circlelog";
import { QUICK_REQUESTS, pendingFollowUps, clearFollowUps, type FollowUp } from "../lib/quickrequests";
import { executeQuickRequest, type SyncDoor } from "../lib/dispatch";
import { dossierRoute } from "../lib/dossier";
import { scheduleFakeCall } from "../lib/fakecall";

/**
 * Phase 8 — System Command & Control.
 *
 * The quick-reference cheat sheet for the current date, behind the
 * ticker's PIN gate: client + date facts, escalation level AND why,
 * the session command log, device/network state, the circle log with
 * presence + remote commands, per-member actions (DM, chat/voice
 * invites, the quick-request menu), and the exact status bundle a
 * circle status-request would receive — share-filtered, with the
 * withheld fields named.
 *
 * Circle presence here is REAL data only: watch-page heartbeats and
 * alert traffic recorded as it arrives. Chat/voice run on the Phase 8
 * Matrix backend (§12 of the blueprint) and are labeled as such.
 */
export default function CommandScreen(props: { onBack: () => void; go: (r: string) => void }) {
  const session = store.getSession();
  const settings = store.getSettings();
  const circle = store.getCircle();

  const [now, setNow] = useState(Date.now());
  const [facts, setFacts] = useState<StatusFacts | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientId, setClientId] = useState<number | null>(null);
  const [esc, setEsc] = useState<EscalationState>(() => getEscalation(session?.id ?? ""));
  const [log, setLog] = useState<GuardianEvent[]>([]);
  const [members, setMembers] = useState<CirclePresence[]>([]);
  const [battery, setBattery] = useState<number | null>(null);
  const [freshPos, setFreshPos] = useState<LatLng | null>(null);
  const [selected, setSelected] = useState<CircleMember | null>(null);
  const [dmText, setDmText] = useState("");
  const [quickId, setQuickId] = useState(QUICK_REQUESTS[0].id);
  const [notice, setNotice] = useState("");
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [syncLive, setSyncLive] = useState(false);

  const syncRef = useRef<SyncHandle | null>(null);

  const refresh = async () => {
    if (!session) return;
    const { facts: f, client } = await assembleStatusFacts(session);
    setFacts(f);
    setClientId(client?.id ?? null);
    setClientName(client?.name || f.clientName || session.alias || "—");
    setEsc(getEscalation(session.id));
    setLog(await sessionEvents(session.id, undefined, 60));
    setMembers(buildCircleLog(session.id, store.getCircle(), Date.now()));
    setFollowUps(pendingFollowUps(session.id));
  };

  useEffect(() => {
    if (!session) return;
    let dead = false;
    void refresh();
    void batteryLevel().then(setBattery);
    const t = window.setInterval(() => { setNow(Date.now()); void refresh(); }, 15000);
    const t1 = window.setInterval(() => setNow(Date.now()), 1000);

    (async () => {
      try {
        const key = await importKey(session.keyB64);
        const sync = await connectSession({ broker: settings.mqttBroker, sessionId: session.id, key });
        if (dead) { sync.close(); return; }
        syncRef.current = sync;
        setSyncLive(sync.connected());
        registerConnProbes({
          sessionId: session.id,
          syncConnected: () => sync.connected(),
          outboxDepth: () => outboxCount(session.id),
        });
        sync.onPresence((m) => {
          recordPresence(session.id, m.name, m.ts);
          setMembers(buildCircleLog(session.id, store.getCircle(), Date.now()));
        });
        sync.onAlert((m) => {
          const who = m.by || "A watcher";
          if (m.type === "ack") {
            recordCircleAction(session.id, who, `acknowledged (${m.note ?? "seen"})`, m.ts);
            logEvent("circle", `👁 ${who} acknowledged: ${m.note ?? "seen"}`, session.id);
          } else if (m.type === "status-request") {
            recordCircleAction(session.id, who, "requested full status", m.ts);
            logEvent("circle", `📋 ${who} requested a full status update — replying with the share-filtered bundle.`, session.id);
            void replyStatus(sync);
          } else if (m.type === "stream-request") {
            recordCircleAction(session.id, who, "requested live stream", m.ts);
            logEvent("circle", `🎥 ${who} requested the live stream — open the date screen to start the camera.`, session.id);
          } else if (m.type === "fakecall-request") {
            recordCircleAction(session.id, who, "requested a fake call", m.ts);
            scheduleFakeCall(1);
            logEvent("circle", `📞 ${who} requested a fake call — scheduled in 1 minute.`, session.id);
          } else if (m.type === "dm") {
            recordCircleAction(session.id, who, "sent a direct message", m.ts);
            logEvent("circle", `💬 ${who}: ${m.note ?? ""}`, session.id);
          }
          void refresh();
        });
      } catch {
        setSyncLive(false);
      }
    })();

    return () => {
      dead = true;
      window.clearInterval(t);
      window.clearInterval(t1);
      unregisterConnProbes();
      syncRef.current?.close();
      syncRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const replyStatus = async (sync: SyncHandle) => {
    if (!session) return;
    const { facts: f } = await assembleStatusFacts(session);
    const bundle = buildStatusBundle(f);
    await sync.publish("alert", { type: "status-reply", ts: Date.now(), by: settings.displayName || "Guardian", data: bundle.text }, false).catch(() => {});
    logEvent("command", `Status bundle sent to the circle (${bundle.included.length} fields in, ${bundle.withheld.length} withheld by her share settings).`, session.id);
    void refresh();
  };

  if (!session) {
    return (
      <div className="min-h-dvh pb-16">
        <TopBar title="Command & Control" onBack={props.onBack} />
        <div className="mx-auto max-w-lg space-y-4 px-4 py-4">
          <Card>
            <p className="text-sm text-zinc-300">No active date right now. Command &amp; Control lights up during a date — client cheat sheet, escalation reasons, circle log, quick requests, the works.</p>
            <p className="mt-2 text-sm text-zinc-500">Your backup alert paths and Low Signal Mode are armed app-wide either way (Settings → Backup alert paths).</p>
          </Card>
          <Btn variant="primary" onClick={() => props.go("#/date")}>Start a date</Btn>
        </div>
      </div>
    );
  }

  const endAt = session.startedAt + session.expectedMin * 60000;
  const elapsedMin = Math.max(0, Math.floor((now - session.startedAt) / 60000));
  const remainMin = Math.max(0, Math.ceil((endAt - now) / 60000));
  const conn = connectionInfo();
  const bundle = facts ? buildStatusBundle(facts) : null;
  const depositPaid = facts?.deposit != null && facts.deposit > 0;

  const sendDm = async () => {
    if (!selected || !dmText.trim()) return;
    const sync = syncRef.current;
    const text = dmText.trim();
    if (sync) {
      await sync.publish("alert", { type: "dm", ts: Date.now(), by: settings.displayName || "Her", note: text }, false).catch(() => {});
    }
    logEvent("circle", `💬 You → ${selected.name}: ${text}`, session.id);
    recordCircleAction(session.id, selected.name, "received your DM", Date.now());
    setDmText("");
    setNotice(sync ? `Message sent to ${selected.name} on the live channel.` : `Live channel is down — message logged. Text ${selected.name} from your Messages app as a backup.`);
    void refresh();
  };

  const sendQuick = async (target: CircleMember | null) => {
    const req = QUICK_REQUESTS.find((q) => q.id === quickId) ?? QUICK_REQUESTS[0];
    const sync = syncRef.current;
    const door: SyncDoor | undefined = sync
      ? {
          connected: () => sync.connected(),
          send: async () => {
            await sync.publish("alert", { type: "quick", ts: Date.now(), note: req.label, by: target?.name ?? undefined }, false);
          },
        }
      : undefined;
    const msg = await executeQuickRequest({
      req,
      session: store.getSession() ?? session,
      settings: store.getSettings(),
      circle: store.getCircle(),
      target,
      sync: door,
    });
    setNotice(msg);
    void refresh();
  };

  const refreshGps = async () => {
    try {
      const p = await getCurrentPosition();
      setFreshPos(p);
    } catch {
      setNotice("Couldn't get a fresh GPS fix just now.");
    }
  };

  const matchText = (() => {
    if (!session.incall) return facts?.locationText ? "No pinned date location to compare against." : "No fix yet.";
    const pos = freshPos;
    if (!pos) return facts?.locationMatches == null ? "Tap “Refresh GPS” for a live comparison." : facts.locationMatches ? "Latest recorded fix matches the pinned date location." : "Latest recorded fix does NOT match the pinned date location.";
    const d = distanceM(pos, session.incall);
    return d <= settings.arrivalRadiusM ? `Matches — you're ${Math.round(d)} m from the pinned date location.` : `Does NOT match — ${Math.round(d)} m from the pinned date location.`;
  })();

  return (
    <div className="min-h-dvh pb-16">
      <TopBar title="Command & Control" onBack={props.onBack}
        right={<span className={`rounded-full px-3 py-1 text-xs font-bold ${esc.level === 3 ? "bg-red-500/20 text-red-300" : esc.lowSignal ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/15 text-emerald-300"}`}>{levelLabel(esc)}</span>} />
      <div className="mx-auto max-w-lg space-y-4 px-4 py-4">
        {notice && <Card className="border-emerald-500/30 bg-emerald-500/5"><p className="text-sm text-emerald-200">{notice}</p></Card>}

        <Card>
          <p className="mb-2 text-xs uppercase tracking-widest text-zinc-500">Tonight's date — quick reference</p>
          <div className="space-y-1.5 text-sm">
            <p className="flex justify-between gap-3"><span className="text-zinc-500">Client</span><span className="text-right font-semibold text-zinc-100">{clientName}</span></p>
            <p className="flex justify-between gap-3"><span className="text-zinc-500">Booked location</span><span className="text-right text-zinc-200">{facts?.locationText ?? "—"}</span></p>
            <p className="flex justify-between gap-3"><span className="text-zinc-500">Deposit</span><span className="text-right text-zinc-200">{depositPaid ? `Paid — $${facts?.deposit}` : "No deposit recorded on the booking"}</span></p>
            <p className="flex justify-between gap-3"><span className="text-zinc-500">Started</span><span className="text-right text-zinc-200">{new Date(session.startedAt).toLocaleTimeString()}</span></p>
            <p className="flex justify-between gap-3"><span className="text-zinc-500">Scheduled end</span><span className="text-right text-zinc-200">{new Date(endAt).toLocaleTimeString()}</span></p>
            <p className="flex justify-between gap-3"><span className="text-zinc-500">Elapsed / remaining</span><span className="text-right font-mono text-zinc-100">{elapsedMin} min in · {remainMin} min left</span></p>
            <p className="flex justify-between gap-3"><span className="text-zinc-500">Next booking today</span><span className="text-right text-zinc-200">{facts?.nextBookingToday ? `${facts.nextBookingToday.alias} at ${new Date(facts.nextBookingToday.ts).toLocaleTimeString()}` : "None"}</span></p>
            <p className="flex justify-between gap-3"><span className="text-zinc-500">Client history</span><span className="text-right text-zinc-200">{facts?.clientDatesDone == null ? "Not linked to a dossier entry" : facts.clientIsNew ? "NEW client — first date" : `Returning — ${facts.clientDatesDone} completed date${facts.clientDatesDone === 1 ? "" : "s"}`}</span></p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Btn onClick={() => props.go(clientId != null ? dossierRoute(clientId) : "#/clients")}>Open full dossier</Btn>
            <Btn onClick={() => props.go("#/payments")}>Payments &amp; comms</Btn>
          </div>
          <p className="mt-2 text-xs text-zinc-600">Dossier notes &amp; ratings stay on this phone. They only leave if you toggle sharing on for this client (Client log → their record).</p>
        </Card>

        <Card>
          <p className="mb-2 text-xs uppercase tracking-widest text-zinc-500">Escalation — level &amp; why</p>
          <p className={`text-base font-bold ${esc.level === 3 ? "text-red-300" : esc.lowSignal ? "text-amber-300" : "text-emerald-300"}`}>{levelLabel(esc)}</p>
          {esc.conditions.length === 0 && <p className="mt-1 text-sm text-zinc-500">No active conditions. Everything nominal.</p>}
          {esc.conditions.map((c) => (
            <p key={c.source} className="mt-1 text-sm text-zinc-300">• {c.reason} <span className="text-xs text-zinc-600">since {new Date(c.since).toLocaleTimeString()}</span></p>
          ))}
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
            <p className="text-zinc-500">Battery</p><p className="text-right text-zinc-200">{battery == null ? "Not exposed by this browser" : `${battery}%`}</p>
            <p className="text-zinc-500">Network</p><p className="text-right text-zinc-200">{conn.effectiveType ? `${conn.effectiveType}${conn.downlinkMbps ? ` · ~${conn.downlinkMbps} Mbps` : ""}${conn.rttMs ? ` · ${conn.rttMs} ms` : ""}` : "Not exposed by this browser"}</p>
            <p className="text-zinc-500">Live sync</p><p className="text-right text-zinc-200">{syncLive ? "Connected" : "Reconnecting / down"}</p>
            <p className="text-zinc-500">Last check-in</p><p className="text-right text-zinc-200">{facts?.lastCheckInAt ? new Date(facts.lastCheckInAt).toLocaleTimeString() : "—"}</p>
            <p className="text-zinc-500">GPS match</p><p className="text-right text-zinc-200">{matchText}</p>
          </div>
          <Btn className="mt-3" onClick={() => void refreshGps()}>📍 Refresh GPS</Btn>
        </Card>

        <Card>
          <p className="mb-2 text-xs uppercase tracking-widest text-zinc-500">Your circle</p>
          {members.length === 0 && <p className="text-sm text-zinc-500">No circle members yet — add them in the Circle screen.</p>}
          <div className="space-y-2">
            {members.map((m) => (
              <button key={m.name} onClick={() => setSelected(circle.find((c) => c.name === m.name) ?? { id: m.name, name: m.name, phone: "" })}
                className={`w-full rounded-xl px-3 py-2.5 text-left ${selected?.name === m.name ? "bg-emerald-500/10 ring-1 ring-emerald-400/40" : "bg-white/[0.04]"}`}>
                <p className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-zinc-100">{m.watching ? "🟢" : "⚫"} {m.name}</span>
                  <span className="text-xs text-zinc-500">{m.watching ? "watching now" : m.lastSeenAt ? `last active ${new Date(m.lastSeenAt).toLocaleTimeString()}` : "offline — no activity recorded"}</span>
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {m.joinedAt ? `Joined ${new Date(m.joinedAt).toLocaleTimeString()}` : "Hasn't joined this date yet"}
                  {m.lastAction ? ` · last response: ${m.lastAction} (${m.lastActionAt ? new Date(m.lastActionAt).toLocaleTimeString() : ""})` : " · no responses yet"}
                </p>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-zinc-600">Presence comes from their watch-page heartbeats; “last response” is the last ack, message, or remote command actually received — Guardian doesn't fake read receipts.</p>

          {selected && (
            <div className="mt-3 space-y-3 rounded-xl bg-white/[0.04] p-3">
              <p className="text-sm font-bold text-zinc-100">{selected.name}</p>
              <div className="flex gap-2">
                <input value={dmText} onChange={(e) => setDmText(e.target.value)} placeholder={`Message ${selected.name}…`}
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600" />
                <Btn className="!w-auto !px-4" variant="primary" onClick={() => void sendDm()}>Send</Btn>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Btn onClick={() => setNotice(`Encrypted 1:1 chat with ${selected.name} arrives with the Phase 8 chat update. Today, the DM above rides the live encrypted session channel while they're watching.`)}>💬 1:1 chat</Btn>
                <Btn onClick={() => setNotice("The full-circle support room arrives with the Phase 8 chat update. Today, quick requests below reach the whole circle at once.")}>👥 Group room</Btn>
                <Btn onClick={() => setNotice(`In-app voice calls arrive with the Phase 8 chat update. Today, ${selected.name} can watch the live emergency camera from their watch link.`)}>🎙️ Voice call</Btn>
              </div>
              <div>
                <p className="mb-1.5 text-xs uppercase tracking-widest text-zinc-500">Quick request — to {selected.name}</p>
                <div className="flex gap-2">
                  <select value={quickId} onChange={(e) => setQuickId(e.target.value)}
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-zinc-100">
                    {QUICK_REQUESTS.map((q) => <option key={q.id} value={q.id}>{q.icon} {q.label}</option>)}
                  </select>
                  <Btn className="!w-auto !px-4" variant="primary" onClick={() => void sendQuick(selected)}>Send</Btn>
                </div>
              </div>
            </div>
          )}

          <div className="mt-3">
            <p className="mb-1.5 text-xs uppercase tracking-widest text-zinc-500">Quick request — whole circle</p>
            <Btn variant="emerald" onClick={() => void sendQuick(null)}>Send selected request to the whole circle</Btn>
          </div>
        </Card>

        {followUps.length > 0 && (
          <Card>
            <p className="mb-2 text-xs uppercase tracking-widest text-zinc-500">Scheduled follow-ups</p>
            {followUps.map((f) => (
              <p key={f.id} className="text-sm text-zinc-300">⏰ {new Date(f.at).toLocaleTimeString()} — “{f.label}” → {f.toName}</p>
            ))}
            <Btn className="mt-2" variant="danger" onClick={() => { clearFollowUps(session.id); setFollowUps([]); logEvent("command", "All scheduled follow-ups cancelled.", session.id); }}>Cancel all follow-ups</Btn>
          </Card>
        )}

        {bundle && (
          <Card>
            <p className="mb-2 text-xs uppercase tracking-widest text-zinc-500">Status ping preview — what a full-status request sends</p>
            <pre className="whitespace-pre-wrap rounded-xl bg-black/40 p-3 text-xs leading-relaxed text-zinc-300">{bundle.text}</pre>
            {bundle.withheld.length > 0 && (
              <p className="mt-2 text-xs text-amber-300/90">Withheld by your share settings: {bundle.withheld.join(" · ")}</p>
            )}
            <Btn className="mt-3" variant="primary" onClick={() => { const sync = syncRef.current; if (sync) void replyStatus(sync); else setNotice("Live channel is down — the bundle is queued in the log; your circle gets it on reconnect."); }}>Send status to my circle now</Btn>
          </Card>
        )}

        <Card>
          <p className="mb-2 text-xs uppercase tracking-widest text-zinc-500">Command &amp; activity log — this date</p>
          {log.length === 0 && <p className="text-sm text-zinc-500">Nothing yet.</p>}
          <ul className="max-h-80 space-y-1.5 overflow-y-auto">
            {log.map((e) => (
              <li key={e.id ?? e.ts} className={`text-sm ${e.kind === "command" ? "text-amber-200/90" : e.kind === "request" ? "text-sky-200/90" : "text-zinc-400"}`}>
                <span className="mr-2 text-xs text-zinc-600">{new Date(e.ts).toLocaleTimeString()}</span>{e.text}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
