import { useEffect, useRef, useState } from "react";
import { TopBar, Card, Btn } from "../components/ui";
import MapView, { type MapMarker } from "../components/MapView";
import { importKey } from "../lib/crypto";
import { connectSession, type SyncHandle, type AlertMsg, type PosMsg, type StateMsg } from "../lib/sync";
import { playChime, buzz } from "../lib/audio";
import { joinBroadcast } from "../lib/webrtc";
import { store } from "../lib/store";
import { distanceM, formatDist, etaSeconds, formatEta, type LatLng } from "../lib/geo";

/** What a SAFETY CIRCLE member sees: live map, status, alerts, optional live A/V. */
export default function WatchScreen(props: { sessionId: string; keyB64: string }) {
  const [providerPos, setProviderPos] = useState<LatLng | null>(null);
  const [clientPos, setClientPos] = useState<LatLng | null>(null);
  const [providerMeta, setProviderMeta] = useState<{ ts: number; bat: number | null; acc?: number; seq?: number } | null>(null);
  const [clientMeta, setClientMeta] = useState<{ spd: number | null } | null>(null);
  const [tick, setTick] = useState(Date.now());
  const [myName, setMyName] = useState(() => { try { return localStorage.getItem("guardian.watcherName") || ""; } catch { return ""; } });
  const [myAck, setMyAck] = useState<string | null>(null);
  const [state, setState] = useState<StateMsg | null>(null);
  const [alerts, setAlerts] = useState<AlertMsg[]>([]);
  const [watching, setWatching] = useState(false);
  const [alertsOn, setAlertsOn] = useState(false);
  const [err, setErr] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopWatch = useRef<(() => void) | null>(null);
  const stopBeat = useRef<(() => void) | null>(null);
  const syncRef = useRef<SyncHandle | null>(null);
  const wakeLock = useRef<{ release: () => void } | null>(null);

  /** Loud local escalation: sound loop + vibration + system notification + wake lock. */
  const escalateLocal = (m: AlertMsg) => {
    playChime();
    setTimeout(playChime, 700);
    setTimeout(playChime, 1400);
    buzz([600, 200, 600, 200, 600]);
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("🆘 Guardian EMERGENCY", {
          body: `${m.type} signal received. Open the live view and check on them now.`,
          tag: "guardian-emergency",
          requireInteraction: true,
        } as NotificationOptions);
      }
    } catch { /* noop */ }
  };

  const enableAlerts = async () => {
    try {
      if ("Notification" in window && Notification.permission === "default") {
        await Notification.requestPermission();
      }
    } catch { /* noop */ }
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<{ release: () => void }> } };
      if (nav.wakeLock) wakeLock.current = await nav.wakeLock.request("screen");
    } catch { /* noop */ }
    playChime();
    setAlertsOn(true);
  };

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const key = await importKey(props.keyB64);
        const sync = await connectSession({ broker: store.getSettings().mqttBroker, sessionId: props.sessionId, key });
        if (dead) { sync.close(); return; }
        syncRef.current = sync;
        sync.onPos((m: PosMsg) => {
          if (m.from === "provider") {
            setProviderPos(m.pos);
            setProviderMeta({ ts: m.ts, bat: m.bat ?? null, acc: m.accuracyM, seq: m.seq });
          } else {
            setClientPos(m.pos);
            setClientMeta({ spd: m.spd ?? null });
          }
        });
        sync.onState((m) => setState(m));
        sync.onAlert((m) => {
          setAlerts((a) => [m, ...a].slice(0, 20));
          if (m.type === "panic" || m.type === "duress" || m.type === "missed-checkout") escalateLocal(m);
          if (m.type === "coded" && m.note === "pickup") escalateLocal(m);
          if (m.type === "checkout") setMyAck(null);
        });
        // Presence heartbeat: she can see that someone is watching.
        const beat = () => {
          sync.publish("presence", { name: (localStorage.getItem("guardian.watcherName") || "A friend"), ts: Date.now() }, false).catch(() => {});
        };
        beat();
        const beatTimer = window.setInterval(beat, 20000);
        stopBeat.current = () => window.clearInterval(beatTimer);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Connection failed");
      }
    })();
    const t = window.setInterval(() => setTick(Date.now()), 5000);
    return () => { dead = true; window.clearInterval(t); stopBeat.current?.(); stopWatch.current?.(); syncRef.current?.close(); try { wakeLock.current?.release(); } catch { /* noop */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleWatch = async () => {
    const sync = syncRef.current;
    if (!sync) return;
    if (watching) {
      stopWatch.current?.();
      stopWatch.current = null;
      setWatching(false);
      return;
    }
    try {
      stopWatch.current = await joinBroadcast(sync, (s) => {
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
      });
      setWatching(true);
    } catch {
      setErr("Couldn't start live video. The broadcaster may be offline.");
    }
  };

  /** Confirmation ladder: tell her a human has seen it — and what you're doing. */
  const sendAck = async (kind: "seen" | "onmyway" | "called-help") => {
    const sync = syncRef.current;
    if (!sync) return;
    const name = myName.trim() || "A friend";
    await sync.publish("alert", { type: "ack", ts: Date.now(), note: kind, by: name }, false).catch(() => {});
    setMyAck(kind);
  };

  const markers: MapMarker[] = [];
  if (providerPos) markers.push({ id: "p", pos: providerPos, color: "#34d399", label: "Them" });
  if (clientPos) markers.push({ id: "c", pos: clientPos, color: "#60a5fa", label: "Guest" });

  const emergency = state?.state === "panic" || alerts.some((a) => ["panic", "duress", "missed-checkout"].includes(a.type));

  return (
    <div className="min-h-dvh pb-10">
      <TopBar title="Guardian — live view" />
      <div className="mx-auto max-w-lg space-y-4 px-4 py-4">
        {err && <Card className="border-red-500/40"><p className="text-sm text-red-300">{err}</p></Card>}
        {!alertsOn && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <p className="mb-2 text-sm text-amber-100">Watching over someone? Turn on loud alerts so an emergency on this page can't be missed — repeating chime, vibration, a system notification, and your screen stays awake.</p>
            <Btn variant="primary" onClick={enableAlerts}>🔔 Enable loud alerts on this device</Btn>
          </Card>
        )}
        {alertsOn && <p className="text-center text-xs text-emerald-300">🔔 Loud alerts ON — keep this page open.</p>}
        {state?.state === "done" && (
          <Card className="border-emerald-500/50 bg-emerald-500/10 text-center">
            <p className="text-2xl font-black text-emerald-300">She's Safe ✅</p>
            <p className="mt-1 text-sm text-emerald-200/80">Checked out{alerts.find((a) => a.type === "checkout") ? ` at ${new Date(alerts.find((a) => a.type === "checkout")!.ts).toLocaleTimeString()}` : ""}. You can close this page — thank you for watching over her.</p>
          </Card>
        )}
        {emergency && (
          <Card className="border-red-500/50 bg-red-500/10">
            <p className="text-center text-lg font-black uppercase tracking-widest text-red-400">Emergency signal active</p>
            <p className="mt-1 text-center text-sm text-red-200/80">If you can't reach them, consider contacting local emergency services with the location below.</p>
            <p className="mt-3 text-center text-xs uppercase tracking-widest text-red-300/70">Let her know a human is responding</p>
            {myAck ? (
              <p className="mt-2 text-center text-sm font-semibold text-emerald-300">
                {myAck === "onmyway" ? "🚗 You told her you're on your way." : myAck === "called-help" ? "📞 You told her help has been called." : "👁 You acknowledged the alert."}
              </p>
            ) : (
              <div className="mt-2 grid grid-cols-3 gap-2">
                <Btn onClick={() => void sendAck("seen")}>👁 I see it</Btn>
                <Btn variant="primary" onClick={() => void sendAck("onmyway")}>🚗 On my way</Btn>
                <Btn onClick={() => void sendAck("called-help")}>📞 Called help</Btn>
              </div>
            )}
          </Card>
        )}
        <Card>
          <label className="mb-1 block text-xs uppercase tracking-widest text-zinc-500">Your name (she'll see who's watching & responding)</label>
          <input value={myName} onChange={(e) => { setMyName(e.target.value); try { localStorage.setItem("guardian.watcherName", e.target.value); } catch { /* noop */ } }}
            placeholder="e.g. Maria" className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600" />
        </Card>
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs uppercase tracking-widest text-zinc-500">Status</span>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${emergency ? "bg-red-500/20 text-red-300" : "bg-emerald-500/15 text-emerald-300"}`}>
              {state ? state.state.toUpperCase() : "CONNECTING…"}
            </span>
          </div>
          <MapView markers={markers} height={260} />
          {providerMeta && (() => {
            const ageSec = Math.max(0, Math.round((tick - providerMeta.ts) / 1000));
            const interrupted = state?.state === "active" && ageSec > 45;
            return (
              <div className="mt-2 space-y-1 text-center text-xs">
                <p className="text-zinc-500">
                  Last update {ageSec < 5 ? "just now" : `${ageSec}s ago`}
                  {providerMeta.acc ? ` · GPS ±${Math.round(providerMeta.acc)} m` : ""}
                  {providerMeta.bat != null ? ` · 🔋 ${providerMeta.bat}%` : ""}
                </p>
                {interrupted && (
                  <p className="font-semibold text-amber-300">⚠️ Signal interrupted — no update for {ageSec}s. Their phone may be off, out of coverage, or the app was closed.</p>
                )}
                {providerMeta.bat != null && providerMeta.bat <= 20 && (
                  <p className="font-semibold text-amber-300">🔋 Their battery is low ({providerMeta.bat}%).</p>
                )}
              </div>
            );
          })()}
          {clientPos && providerPos && (
            <p className="mt-1 text-center text-xs text-sky-300">
              Guest is {formatDist(distanceM(clientPos, providerPos))} away · {formatEta(etaSeconds(distanceM(clientPos, providerPos), clientMeta?.spd))} at current pace
            </p>
          )}
        </Card>

        <Card className={watching ? "" : "opacity-90"}>
          <p className="mb-2 text-xs uppercase tracking-widest text-zinc-500">Emergency camera</p>
          {watching ? (
            <video ref={videoRef} className="w-full rounded-xl bg-black" playsInline muted={false} controls={false} />
          ) : (
            <p className="text-sm text-zinc-400">If they trigger an emergency broadcast, you can watch live video + audio here.</p>
          )}
          <Btn className="mt-3" onClick={toggleWatch}>{watching ? "Stop watching" : "Watch live"}</Btn>
        </Card>

        {alerts.length > 0 && (
          <Card>
            <p className="mb-2 text-xs uppercase tracking-widest text-zinc-500">Alerts</p>
            <ul className="space-y-1.5">
              {alerts.map((a, i) => {
                const label =
                  a.type === "coded" && a.note === "pickup" ? "🚗 COME GET ME — she asked for a pickup" :
                  a.type === "coded" && a.note === "call" ? "📞 She asked you to call her" :
                  a.type === "coded" && a.note === "talk" ? "💬 She needs to talk" :
                  a.type === "ack" ? `👁 ${a.by || "A watcher"} acknowledged (${a.note})` :
                  a.type === "checkin" ? `✅ Check-in${a.note ? ` — ${a.note}` : ""}` :
                  a.type === "checkout" ? "✅ Checked out — safe" :
                  `${a.type}${a.note ? ` — ${a.note}` : ""}`;
                return (
                  <li key={i} className={`text-sm ${["panic", "duress", "missed-checkout"].includes(a.type) || (a.type === "coded" && a.note === "pickup") ? "text-red-300 font-semibold" : "text-zinc-400"}`}>
                    <span className="mr-2 text-xs text-zinc-600">{new Date(a.ts).toLocaleTimeString()}</span>{label}{a.addr ? <span className="block text-xs text-zinc-500">{a.addr}</span> : null}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
        <p className="text-center text-xs text-zinc-600">End-to-end encrypted. This link is the key — don't forward it.</p>
      </div>
    </div>
  );
}
