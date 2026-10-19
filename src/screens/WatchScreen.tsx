import { useEffect, useRef, useState } from "react";
import { TopBar, Card, Btn } from "../components/ui";
import MapView, { type MapMarker } from "../components/MapView";
import { importKey } from "../lib/crypto";
import { connectSession, type SyncHandle, type AlertMsg, type PosMsg, type StateMsg } from "../lib/sync";
import { playChime } from "../lib/audio";
import { joinBroadcast } from "../lib/webrtc";
import { store } from "../lib/store";
import type { LatLng } from "../lib/geo";

/** What a SAFETY CIRCLE member sees: live map, status, alerts, optional live A/V. */
export default function WatchScreen(props: { sessionId: string; keyB64: string }) {
  const [providerPos, setProviderPos] = useState<LatLng | null>(null);
  const [clientPos, setClientPos] = useState<LatLng | null>(null);
  const [state, setState] = useState<StateMsg | null>(null);
  const [alerts, setAlerts] = useState<AlertMsg[]>([]);
  const [watching, setWatching] = useState(false);
  const [err, setErr] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopWatch = useRef<(() => void) | null>(null);
  const syncRef = useRef<SyncHandle | null>(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const key = await importKey(props.keyB64);
        const sync = await connectSession({ broker: store.getSettings().mqttBroker, sessionId: props.sessionId, key });
        if (dead) { sync.close(); return; }
        syncRef.current = sync;
        sync.onPos((m: PosMsg) => {
          if (m.from === "provider") setProviderPos(m.pos);
          else setClientPos(m.pos);
        });
        sync.onState((m) => setState(m));
        sync.onAlert((m) => {
          setAlerts((a) => [m, ...a].slice(0, 20));
          if (m.type === "panic" || m.type === "duress" || m.type === "missed-checkout") playChime();
        });
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Connection failed");
      }
    })();
    return () => { dead = true; stopWatch.current?.(); syncRef.current?.close(); };
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

  const markers: MapMarker[] = [];
  if (providerPos) markers.push({ id: "p", pos: providerPos, color: "#34d399", label: "Them" });
  if (clientPos) markers.push({ id: "c", pos: clientPos, color: "#60a5fa", label: "Guest" });

  const emergency = state?.state === "panic" || alerts.some((a) => ["panic", "duress", "missed-checkout"].includes(a.type));

  return (
    <div className="min-h-dvh pb-10">
      <TopBar title="Guardian — live view" />
      <div className="mx-auto max-w-lg space-y-4 px-4 py-4">
        {err && <Card className="border-red-500/40"><p className="text-sm text-red-300">{err}</p></Card>}
        {emergency && (
          <Card className="border-red-500/50 bg-red-500/10">
            <p className="text-center text-lg font-black uppercase tracking-widest text-red-400">Emergency signal active</p>
            <p className="mt-1 text-center text-sm text-red-200/80">If you can't reach them, consider contacting local emergency services with the location below.</p>
          </Card>
        )}
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs uppercase tracking-widest text-zinc-500">Status</span>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${emergency ? "bg-red-500/20 text-red-300" : "bg-emerald-500/15 text-emerald-300"}`}>
              {state ? state.state.toUpperCase() : "CONNECTING…"}
            </span>
          </div>
          <MapView markers={markers} height={260} />
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
              {alerts.map((a, i) => (
                <li key={i} className={`text-sm ${["panic", "duress", "missed-checkout"].includes(a.type) ? "text-red-300 font-semibold" : "text-zinc-400"}`}>
                  <span className="mr-2 text-xs text-zinc-600">{new Date(a.ts).toLocaleTimeString()}</span>{a.type}{a.note ? ` — ${a.note}` : ""}
                </li>
              ))}
            </ul>
          </Card>
        )}
        <p className="text-center text-xs text-zinc-600">End-to-end encrypted. This link is the key — don't forward it.</p>
      </div>
    </div>
  );
}
