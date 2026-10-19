import { useEffect, useRef, useState } from "react";
import { TopBar, Card, Btn } from "../components/ui";
import PanicButton from "../components/PanicButton";
import MapView, { type MapMarker } from "../components/MapView";
import { getLabels } from "../lib/labels";
import { store } from "../lib/store";
import { importKey } from "../lib/crypto";
import { connectSession, clientLink, watchLink, type SyncHandle, type AlertMsg, type PosMsg } from "../lib/sync";
import { watchPosition, distanceM, formatDist, mapsLink, type LatLng } from "../lib/geo";
import { startSiren, stopSiren, playChime, buzz } from "../lib/audio";
import { alertCircle } from "../lib/sms";
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
  const [syncErr, setSyncErr] = useState("");

  const syncRef = useRef<SyncHandle | null>(null);
  const sessionRef = useRef(session);
  const myPosRef = useRef<LatLng | null>(null);
  const lastPubRef = useRef(0);
  const broadcastRef = useRef<BroadcastHandle | null>(null);
  const flagsRef = useRef({ approaching: false, arrived: false, escalated: false });

  const pushFeed = (text: string, tone: FeedItem["tone"] = "info") =>
    setFeed((f) => [{ ts: Date.now(), text, tone }, ...f].slice(0, 30));

  // ---- connect + GPS -------------------------------------------------------
  useEffect(() => {
    if (!session) { props.go("#/"); return; }
    let dead = false;
    let unwatch = () => {};
    let timer = 0;

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
        sync.onAlert((m: AlertMsg) => pushFeed(`Circle event: ${m.type}`, m.type === "panic" || m.type === "duress" ? "danger" : "warn"));

        unwatch = watchPosition(
          (p) => {
            myPosRef.current = p;
            setMyPos(p);
            const t = Date.now();
            if (t - lastPubRef.current > 10000 && syncRef.current) {
              lastPubRef.current = t;
              syncRef.current.publish("pos", { from: "provider", ts: t, pos: p }, true).catch(() => {});
            }
          },
          (msg) => pushFeed(`Location issue: ${msg}`, "warn")
        );
      } catch (e) {
        setSyncErr(e instanceof Error ? e.message : "Sync failed");
      }
    })();

    timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      dead = true;
      clearInterval(timer);
      unwatch();
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
    startSiren();
    buzz([500, 200, 500]);
    pushFeed("MISSED CHECK-OUT — circle alerted.", "danger");
    const key = await importKey(s.keyB64).catch(() => null);
    if (key && syncRef.current) {
      const sync = syncRef.current;
      await sync.publish("alert", { type: "missed-checkout", ts: Date.now(), pos: myPosRef.current ?? undefined }, false).catch(() => {});
      await sync.publish("state", { state: "panic", alias: s.alias, startedAt: s.startedAt, expectedMin: s.expectedMin, ts: Date.now() }, true).catch(() => {});
    }
    const link = watchLink(window.location.origin, s.id, s.keyB64);
    const pos = myPosRef.current;
    await alertCircle(settings, circle,
      `Guardian ALERT (missed check-in): ${settings.displayName || "Someone you protect"} didn't check out.` +
      (pos ? ` Last location: ${mapsLink(pos)}` : "") + ` Live view: ${link}`
    ).catch(() => {});
  };

  const doCheckOut = async () => {
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
    startSiren();
    buzz([400, 100, 400, 100, 400]);
    pushFeed("PANIC TRIGGERED — circle alerted.", "danger");
    const sync = syncRef.current;
    if (sync) {
      await sync.publish("alert", { type: "panic", ts: Date.now(), pos: myPosRef.current ?? undefined }, false).catch(() => {});
      await sync.publish("state", { state: "panic", alias: s.alias, startedAt: s.startedAt, expectedMin: s.expectedMin, ts: Date.now() }, true).catch(() => {});
    }
    const link = watchLink(window.location.origin, s.id, s.keyB64);
    const pos = myPosRef.current;
    alertCircle(settings, circle,
      `Guardian ALERT (PANIC BUTTON): ${settings.displayName || "Someone you protect"} needs help NOW.` +
      (pos ? ` Live location: ${mapsLink(pos)}` : "") + ` Watch: ${link}`
    ).catch(() => {});
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
    const s = sessionRef.current!;
    setPanicOn(false);
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
            <p className="mb-4 text-sm text-red-200/80">Your circle has your live location. Siren is sounding.</p>
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
        </Card>

        <div className="flex justify-center py-2">
          <PanicButton label={L.Panic} onTrigger={doPanic} size={168} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Btn onClick={() => copy(clientLink(window.location.origin, session.id, session.keyB64), "client")}>
            {copied === "client" ? "Copied!" : `Copy ${L.client} link`}
          </Btn>
          <Btn onClick={textCircle}>{copied === "watch" ? "Copied!" : "Text circle link"}</Btn>
          <Btn onClick={() => props.go("#/payments")}>Request payment</Btn>
          <Btn variant="primary" onClick={doCheckOut}>Check out</Btn>
        </div>

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
      </div>
    </div>
  );
}
