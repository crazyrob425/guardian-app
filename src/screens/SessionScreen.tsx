import { useEffect, useRef, useState } from "react";
import { TopBar, Card, Btn } from "../components/ui";
import PanicButton from "../components/PanicButton";
import MapView, { type MapMarker } from "../components/MapView";
import { getLabels } from "../lib/labels";
import { store } from "../lib/store";
import { importKey } from "../lib/crypto";
import { connectSession, clientLink, watchLink, type SyncHandle, type AlertMsg, type PosMsg } from "../lib/sync";
import { distanceM, formatDist, mapsLink, reverseGeocode, type LatLng } from "../lib/geo";
import { Tracker, publishDue, batteryLevel, type TrackMode } from "../lib/tracking";
import { db, outboxCount } from "../lib/db";
import { startSiren, stopSiren, playChime, buzz, lockAlarm, isAlarmLocked } from "../lib/audio";
import PinUnlock from "../components/PinUnlock";
import { alertCircle } from "../lib/sms";
import { sendEmergencyPush } from "../lib/notify";
import { shareLink, type SharePayload } from "../lib/share";
import ShareSheet from "../components/ShareSheet";
import { startBroadcast, type BroadcastHandle } from "../lib/webrtc";

interface FeedItem { ts: number; text: string; tone: "info" | "warn" | "danger" }

export default function SessionScreen(props: { discreet: boolean; onBack: () => void; go: (r: string) => void }) {
  const L = getLabels(props.discreet);
  const session = store.getSession();
  const settings = store.getSettings();
  const circle = store.getCircle();

  const [myPos, setMyPos] = useState<LatLng | null>(null);
  const [clientPos, setClientPos] = useState<LatLng | null>(null);
  const [clientState, setClientState] = useState<"none" | "approaching" | "arrived">("none");
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [now, setNow] = useState(Date.now());
  const [graceEnds, setGraceEnds] = useState<number | null>(null);
  const [escalated, setEscalated] = useState(false);
  const [panicOn, setPanicOn] = useState(false);
  const [copied, setCopied] = useState("");
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);
  const [pinGate, setPinGate] = useState<null | "standdown" | "checkout">(null);
  const [syncErr, setSyncErr] = useState("");

  const syncRef = useRef<SyncHandle | null>(null);
  const sessionRef = useRef(session);
  const myPosRef = useRef<LatLng | null>(null);
  const lastPubRef = useRef<{ ts: number; pos: LatLng } | null>(null);
  const seqRef = useRef(0);
  const batRef = useRef<number | null>(null);
  const modeRef = useRef<TrackMode>("session");
  const addrRef = useRef<string | null>(null);
  const panicAtRef = useRef<number | null>(null);
  const ackedRef = useRef(false);
  const reAlertedRef = useRef(false);
  const [watchers, setWatchers] = useState<string[]>([]);
  const [gpsMeta, setGpsMeta] = useState<{ acc: number; queued: number } | null>(null);
  const broadcastRef = useRef<BroadcastHandle | null>(null);
  const flagsRef = useRef({ approaching: false, arrived: false, escalated: false });

  const pushFeed = (text: string, tone: FeedItem["tone"] = "info") =>
    setFeed((f) => [{ ts: Date.now(), text, tone }, ...f].slice(0, 30));

  // ---- connect + GPS -------------------------------------------------------
  useEffect(() => {
    if (!session) { props.go("#/"); return; }
    let dead = false;
    let tracker: Tracker | null = null;
    let timer = 0;
    let metaTimer = 0;

    (async () => {
      try {
        const key = await importKey(session.keyB64);
        const sync = await connectSession({ broker: settings.mqttBroker, sessionId: session.id, key });
        if (dead) { sync.close(); return; }
        syncRef.current = sync;
        await sync.publish("state", { state: "active", alias: session.alias, startedAt: session.startedAt, expectedMin: session.expectedMin, ts: Date.now() }, true);
        pushFeed(`${L.Date} checked in — encrypted sync live.`);

        sync.onPos((m: PosMsg) => {
          if (m.from !== "client") return;
          setClientPos(m.pos);
          const s = sessionRef.current;
          if (s?.incall && !flagsRef.current.arrived) {
            const d = distanceM(m.pos, s.incall);
            if (d < 30) {
              flagsRef.current.arrived = true;
              setClientState("arrived");
              playChime();
              pushFeed(`${L.Client} has arrived.`, "warn");
            } else if (d < settings.arrivalRadiusM && !flagsRef.current.approaching) {
              flagsRef.current.approaching = true;
              setClientState("approaching");
              playChime();
              pushFeed(`${L.Client} approaching — ${formatDist(d)} away.`, "info");
            }
          }
        });
        sync.onAlert((m: AlertMsg) => {
          // Phase 2 confirmation ladder: watcher acknowledgments land here.
          if (m.type === "ack") {
            ackedRef.current = true;
            const who = m.by || "Your circle";
            if (m.note === "onmyway") { playChime(); pushFeed(`🚗 ${who} is ON THEIR WAY to you.`, "warn"); }
            else if (m.note === "called-help") pushFeed(`📞 ${who} has called for help.`, "warn");
            else pushFeed(`👁 ${who} saw your alert.`, "info");
            return;
          }
          pushFeed(`Circle event: ${m.type}`, m.type === "panic" || m.type === "duress" ? "danger" : "warn");
        });
        // Phase 2 presence: who is actively watching right now.
        const seen = new Map<string, number>();
        sync.onPresence((m) => {
          seen.set(m.name, m.ts);
          const nowTs = Date.now();
          setWatchers(Array.from(seen.entries()).filter(([, ts]) => nowTs - ts < 45000).map(([n]) => n));
        });

        // Phase 1 tracking engine: filtered + Kalman-smoothed fixes,
        // adaptive publish cadence (5s session / 2s panic), v2 payloads
        // with sequence + battery, on-device session trail.
        batteryLevel().then((b) => { batRef.current = b; });
        tracker = new Tracker(
          (fix) => {
            myPosRef.current = fix.pos;
            setMyPos(fix.pos);
            setGpsMeta((m) => ({ acc: Math.round(fix.accuracyM), queued: m?.queued ?? 0 }));
            const t = Date.now();
            if (syncRef.current && publishDue(modeRef.current, lastPubRef.current, fix, t)) {
              lastPubRef.current = { ts: t, pos: fix.pos };
              seqRef.current += 1;
              syncRef.current.publish("pos", {
                from: "provider", v: 2, seq: seqRef.current, ts: t, pos: fix.pos,
                accuracyM: Math.round(fix.accuracyM), spd: fix.speedMps, hdg: fix.headingDeg, bat: batRef.current,
              }, true).catch(() => {});
              db.trail.add({ sessionId: session.id, ts: t, lat: fix.pos.lat, lng: fix.pos.lng, accuracyM: fix.accuracyM }).catch(() => {});
              if (seqRef.current % 6 === 0) {
                batteryLevel().then((b) => { batRef.current = b; });
                reverseGeocode(fix.pos).then((a) => { if (a) addrRef.current = a; });
              }
            }
          },
          (msg) => pushFeed(`Location issue: ${msg}`, "warn")
        );
        tracker.start();
        metaTimer = window.setInterval(() => {
          outboxCount(session.id).then((n) => setGpsMeta((m) => ({ acc: m?.acc ?? 0, queued: n })));
        }, 10000);
      } catch (e) {
        setSyncErr(e instanceof Error ? e.message : "Sync failed");
      }
    })();

    timer = window.setInterval(() => {
      setNow(Date.now());
      // Confirmation ladder (Phase 2): an emergency nobody acknowledged
      // within 3 minutes re-fires push + SMS once — silence escalates.
      if (panicAtRef.current && !ackedRef.current && !reAlertedRef.current && Date.now() - panicAtRef.current > 180000) {
        reAlertedRef.current = true;
        pushFeed("No one has acknowledged your alert — re-sending to your circle now.", "danger");
        const s = sessionRef.current;
        if (s) {
          const link = watchLink(window.location.origin, s.id, s.keyB64);
          sendEmergencyPush(settings, "STILL NO ACK — emergency alert unacknowledged for 3 minutes. Check the live view NOW").catch(() => {});
          alertCircle(settings, circle, `Guardian URGENT: the emergency alert for ${settings.displayName || "someone you protect"} is still unacknowledged. Live view: ${link}`).catch(() => {});
        }
      }
    }, 1000);
    return () => {
      dead = true;
      clearInterval(timer);
      clearInterval(metaTimer);
      tracker?.stop();
      broadcastRef.current?.stop();
      syncRef.current?.close();
      syncRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- check-out timer ------------------------------------------------------
  const endAt = session ? session.startedAt + session.expectedMin * 60000 : 0;
  const graceMs = settings.checkOutGraceMin * 60000;
  useEffect(() => {
    if (!session || graceEnds || flagsRef.current.escalated) return;
    if (now > endAt) {
      setGraceEnds(now + graceMs);
      playChime();
      pushFeed(`Time's up — check out within ${settings.checkOutGraceMin} min.`, "warn");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);
  useEffect(() => {
    if (graceEnds && now > graceEnds && !flagsRef.current.escalated) {
      flagsRef.current.escalated = true;
      setEscalated(true);
      escalateMissed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, graceEnds]);

  if (!session) return null;

  const escalateMissed = async () => {
    const s = sessionRef.current!;
    modeRef.current = "panic"; // Phase 1: 2-second publish cadence in emergencies
    panicAtRef.current = Date.now();
    ackedRef.current = false;
    startSiren();
    lockAlarm();
    buzz([500, 200, 500]);
    pushFeed("MISSED CHECK-OUT — circle alerted.", "danger");
    const key = await importKey(s.keyB64).catch(() => null);
    if (key && syncRef.current) {
      const sync = syncRef.current;
      await sync.publish("alert", { type: "missed-checkout", ts: Date.now(), pos: myPosRef.current ?? undefined, addr: addrRef.current ?? undefined }, false).catch(() => {});
      await sync.publish("state", { state: "panic", alias: s.alias, startedAt: s.startedAt, expectedMin: s.expectedMin, ts: Date.now() }, true).catch(() => {});
    }
    const link = watchLink(window.location.origin, s.id, s.keyB64);
    const pos = myPosRef.current;
    await alertCircle(settings, circle,
      `Guardian ALERT (missed check-in): ${settings.displayName || "Someone you protect"} didn't check out.` +
      (addrRef.current ? ` Location: ${addrRef.current}.` : "") +
      (pos ? ` Map: ${mapsLink(pos)}` : "") + ` Live view: ${link}`
    ).catch(() => {});
    await sendEmergencyPush(settings, "MISSED CHECK-OUT — they did not check out when expected").catch(() => {});
  };

  const doCheckOut = async () => {
    // Panic lock: checking out silences the alarm, so it needs the PIN first.
    if (isAlarmLocked()) { setPinGate("checkout"); return; }
    await doCheckOutNow();
  };

  const doCheckOutNow = async () => {
    const s = sessionRef.current!;
    stopSiren();
    const sync = syncRef.current;
    if (sync) {
      await sync.publish("alert", { type: "checkout", ts: Date.now() }, false).catch(() => {});
      await sync.publish("state", { state: "done", alias: s.alias, startedAt: s.startedAt, expectedMin: s.expectedMin, ts: Date.now() }, true).catch(() => {});
    }
    store.saveSession(null);
    props.go("#/");
  };

  const doPanic = async () => {
    const s = sessionRef.current!;
    setPanicOn(true);
    modeRef.current = "panic"; // Phase 1: 2-second publish cadence in emergencies
    panicAtRef.current = Date.now();
    ackedRef.current = false;
    reAlertedRef.current = false;
    startSiren();
    lockAlarm();
    buzz([400, 100, 400, 100, 400]);
    pushFeed("PANIC TRIGGERED — circle alerted.", "danger");
    const sync = syncRef.current;
    if (sync) {
      await sync.publish("alert", { type: "panic", ts: Date.now(), pos: myPosRef.current ?? undefined, addr: addrRef.current ?? undefined }, false).catch(() => {});
      await sync.publish("state", { state: "panic", alias: s.alias, startedAt: s.startedAt, expectedMin: s.expectedMin, ts: Date.now() }, true).catch(() => {});
    }
    const link = watchLink(window.location.origin, s.id, s.keyB64);
    const pos = myPosRef.current;
    alertCircle(settings, circle,
      `Guardian ALERT (PANIC BUTTON): ${settings.displayName || "Someone you protect"} needs help NOW.` +
      (addrRef.current ? ` Location: ${addrRef.current}.` : "") +
      (pos ? ` Map: ${mapsLink(pos)}` : "") + ` Watch: ${link}`
    ).catch(() => {});
    sendEmergencyPush(settings, "PANIC BUTTON pressed — they need help NOW").catch(() => {});
    // Offer live camera/mic to the circle (best-effort)
    if (sync) {
      try {
        const b = await startBroadcast(sync);
        broadcastRef.current = b;
        pushFeed("Emergency camera is live for your circle.", "warn");
      } catch {
        pushFeed("Camera unavailable — location + alerts still active.", "warn");
      }
    }
  };

  const standDown = async () => {
    // Panic lock: standing down silences the alarm, so it needs the PIN first.
    if (isAlarmLocked()) { setPinGate("standdown"); return; }
    await standDownNow();
  };

  /** Silent coercion alert: duress PIN used to silence the alarm. */
  const duressSilence = () => {
    const sync = syncRef.current;
    if (sync) {
      sync.publish("alert", { type: "duress", ts: Date.now(), pos: myPosRef.current ?? undefined }, false).catch(() => {});
    }
    sendEmergencyPush(settings, "DURESS — the alarm was silenced with the duress PIN. Possible coercion — check on them NOW").catch(() => {});
  };

  /** Coded quick messages (Phase 2): discreet one-tap signals to the circle. */
  const sendCoded = async (code: "pizza" | "call" | "pickup" | "talk") => {
    const sync = syncRef.current;
    if (!sync) return;
    if (code === "pizza") {
      await sync.publish("alert", { type: "checkin", ts: Date.now(), note: "🍕 All good" }, false).catch(() => {});
      pushFeed("Sent: 🍕 I'm OK.");
    } else {
      await sync.publish("alert", { type: "coded", ts: Date.now(), note: code, pos: myPosRef.current ?? undefined, addr: addrRef.current ?? undefined }, false).catch(() => {});
      pushFeed(code === "pickup" ? "Sent: 🚗 come get me." : code === "call" ? "Sent: 📞 call me." : "Sent: 💬 need to talk.");
      if (code === "pickup") buzz([300, 100, 300]);
    }
  };

  const standDownNow = async () => {
    const s = sessionRef.current!;
    setPanicOn(false);
    panicAtRef.current = null;
    modeRef.current = "session";
    stopSiren();
    broadcastRef.current?.stop();
    broadcastRef.current = null;
    const sync = syncRef.current;
    if (sync) {
      await sync.publish("alert", { type: "checkin", ts: Date.now(), note: "stood down" }, false).catch(() => {});
      await sync.publish("state", { state: "active", alias: s.alias, startedAt: s.startedAt, expectedMin: s.expectedMin, ts: Date.now() }, true).catch(() => {});
    }
    pushFeed("Stood down — all clear sent to circle.");
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copy this link:", text);
    }
    setCopied(what);
    setTimeout(() => setCopied(""), 2500);
  };

  const doShare = async (p: SharePayload) => {
    const r = await shareLink(p);
    if (r === "fallback") setSharePayload(p);
    else if (r === "shared") pushFeed("Link shared.");
  };

  const shareClient = () => {
    const s = sessionRef.current!;
    doShare({
      title: "Guardian — your check-in link",
      text: `Hi! For both our safety, please open this link when you head over and share your location — it lets me know when you've arrived:`,
      url: clientLink(window.location.origin, s.id, s.keyB64),
    });
  };

  const shareWatch = () => {
    const s = sessionRef.current!;
    doShare({
      title: "Guardian — watch over me",
      text: `You're my safety person for this ${L.date.toLowerCase()}. This private link shows my live location — please keep it open and don't forward it:`,
      url: watchLink(window.location.origin, s.id, s.keyB64),
    });
  };

  const textCircle = async () => {
    const s = sessionRef.current!;
    const link = watchLink(window.location.origin, s.id, s.keyB64);
    const results = await alertCircle(settings, circle, `Guardian: live ${L.date} view for ${settings.displayName || "your contact"}: ${link}`);
    const failed = results.filter((r) => !r.result.ok);
    pushFeed(failed.length ? `${failed.length} text(s) failed — link copied, send manually.` : `Watch link texted to ${results.length} ${results.length === 1 ? "person" : "people"}.`, failed.length ? "warn" : "info");
    if (failed.length) copy(link, "watch");
  };

  const markers: MapMarker[] = [];
  if (myPos) markers.push({ id: "me", pos: myPos, color: "#34d399", label: "You" });
  if (clientPos) markers.push({ id: "client", pos: clientPos, color: "#60a5fa", label: L.Client });

  const remainMs = Math.max(0, endAt - now);
  const mm = Math.floor(remainMs / 60000);
  const ss = Math.floor((remainMs % 60000) / 1000);
  const graceRemain = graceEnds ? Math.max(0, graceEnds - now) : 0;

  return (
    <div className="min-h-dvh pb-10">
      <TopBar title={`${L.Date} — ${session.alias || "active"}`} onBack={props.onBack}
        right={<span className={`rounded-full px-3 py-1 text-xs font-bold ${panicOn || escalated ? "bg-red-500/20 text-red-300" : "bg-emerald-500/15 text-emerald-300"}`}>{panicOn || escalated ? "EMERGENCY" : "LIVE"}</span>} />
      <div className="mx-auto max-w-lg space-y-4 px-4 py-4">
        {syncErr && <Card className="border-red-500/40 bg-red-500/10"><p className="text-sm text-red-300">Sync offline: {syncErr}. GPS + siren still work on this device.</p></Card>}

        {(panicOn || escalated) && (
          <Card className="border-red-500/50 bg-red-500/10 text-center">
            <p className="mb-1 text-lg font-black uppercase tracking-widest text-red-400">Emergency active</p>
            <p className="mb-4 text-sm text-red-200/80">Your circle has your live location. The siren is sounding — and it's PIN-locked: only your Settings PIN can silence it.</p>
            <Btn variant="emerald" onClick={standDown}>I'm OK — stand down</Btn>
          </Card>
        )}

        {graceEnds && !escalated && (
          <Card className="border-amber-500/50 bg-amber-500/10 text-center">
            <p className="mb-1 text-lg font-black uppercase tracking-widest text-amber-300">Check out now</p>
            <p className="mb-4 font-mono text-3xl text-amber-200">{Math.floor(graceRemain / 60000)}:{String(Math.floor((graceRemain % 60000) / 1000)).padStart(2, "0")}</p>
            <Btn variant="primary" onClick={doCheckOut}>I'm safe — check out</Btn>
          </Card>
        )}

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs uppercase tracking-widest text-zinc-500">{L.Date} timer</span>
            <span className={`font-mono text-2xl font-bold ${remainMs === 0 ? "text-amber-300" : "text-zinc-100"}`}>{mm}:{String(ss).padStart(2, "0")}</span>
          </div>
          <MapView markers={markers} geofence={session.incall ? { center: session.incall, radiusM: settings.arrivalRadiusM } : null} height={260} />
          {clientPos && clientState !== "none" && (
            <p className={`mt-2 text-center text-sm font-semibold ${clientState === "arrived" ? "text-amber-300" : "text-sky-300"}`}>
              {clientState === "arrived" ? `${L.Client} has arrived` : `${L.Client} approaching`}
            </p>
          )}
          {gpsMeta && (
            <p className="mt-2 text-center text-xs text-zinc-600">
              GPS ±{gpsMeta.acc} m{gpsMeta.queued > 0 ? ` · ${gpsMeta.queued} alert${gpsMeta.queued === 1 ? "" : "s"} queued — will send when connection returns` : " · signal live"}
            </p>
          )}
        </Card>

        <div className="flex justify-center py-2">
          <PanicButton label={L.Panic} onTrigger={doPanic} size={168} />
        </div>

        {watchers.length > 0 && (
          <p className="text-center text-xs text-emerald-300">👁 Watching now: {watchers.join(", ")}</p>
        )}

        <Card>
          <p className="mb-2 text-xs uppercase tracking-widest text-zinc-500">Quick signals — tap to send your circle a coded message</p>
          <div className="grid grid-cols-4 gap-2 text-center">
            <button onClick={() => void sendCoded("pizza")} className="rounded-xl bg-white/5 px-2 py-3 text-sm">🍕<br /><span className="text-xs text-zinc-400">I'm OK</span></button>
            <button onClick={() => void sendCoded("call")} className="rounded-xl bg-white/5 px-2 py-3 text-sm">📞<br /><span className="text-xs text-zinc-400">Call me</span></button>
            <button onClick={() => void sendCoded("pickup")} className="rounded-xl bg-amber-500/15 px-2 py-3 text-sm">🚗<br /><span className="text-xs text-amber-200">Come get me</span></button>
            <button onClick={() => void sendCoded("talk")} className="rounded-xl bg-white/5 px-2 py-3 text-sm">💬<br /><span className="text-xs text-zinc-400">Need to talk</span></button>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Btn onClick={shareClient}>📤 Share {L.client} link</Btn>
          <Btn onClick={shareWatch}>📤 Share circle link</Btn>
          <Btn onClick={() => copy(clientLink(window.location.origin, session.id, session.keyB64), "client")}>
            {copied === "client" ? "Copied!" : `Copy ${L.client} link`}
          </Btn>
          <Btn onClick={textCircle}>{copied === "watch" ? "Copied!" : "Text circle (SMS)"}</Btn>
          <Btn onClick={() => props.go("#/payments")}>Request payment</Btn>
          <Btn variant="primary" onClick={doCheckOut}>Check out</Btn>
        </div>
        <p className="text-center text-xs text-zinc-600">Share opens your phone's share menu — text it, Messenger it, WhatsApp it, email it. Your apps, your accounts, no sign-ups.</p>

        {feed.length > 0 && (
          <Card>
            <p className="mb-2 text-xs uppercase tracking-widest text-zinc-500">Activity</p>
            <ul className="space-y-1.5">
              {feed.map((f, i) => (
                <li key={i} className={`text-sm ${f.tone === "danger" ? "text-red-300" : f.tone === "warn" ? "text-amber-300" : "text-zinc-400"}`}>
                  <span className="mr-2 text-xs text-zinc-600">{new Date(f.ts).toLocaleTimeString()}</span>{f.text}
                </li>
              ))}
            </ul>
          </Card>
        )}
        {sharePayload && <ShareSheet payload={sharePayload} onClose={() => setSharePayload(null)} />}
        {pinGate && (
          <PinUnlock
            onUnlocked={() => { const g = pinGate; setPinGate(null); if (g === "standdown") void standDownNow(); else void doCheckOutNow(); }}
            onDuress={duressSilence}
            onKeepSounding={() => setPinGate(null)}
          />
        )}
      </div>
    </div>
  );
}
