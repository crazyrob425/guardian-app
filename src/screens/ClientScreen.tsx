import { useEffect, useRef, useState } from "react";
import { Card, Btn } from "../components/ui";
import { importKey } from "../lib/crypto";
import { connectSession, type SyncHandle, type StateMsg } from "../lib/sync";
import { watchPosition, type LatLng } from "../lib/geo";
import { store } from "../lib/store";

/** What the CLIENT sees: a discreet location-sharing page. No branding beyond "Guardian". */
export default function ClientScreen(props: { sessionId: string; keyB64: string }) {
  const [sharing, setSharing] = useState(false);
  const [state, setState] = useState<StateMsg | null>(null);
  const [err, setErr] = useState("");
  const syncRef = useRef<SyncHandle | null>(null);
  const lastPub = useRef(0);

  useEffect(() => {
    let dead = false;
    let unwatch = () => {};
    (async () => {
      try {
        const key = await importKey(props.keyB64);
        const sync = await connectSession({
          broker: store.getSettings().mqttBroker,
          sessionId: props.sessionId,
          key,
          subscribe: ["state"],
        });
        if (dead) { sync.close(); return; }
        syncRef.current = sync;
        sync.onState((m) => setState(m));
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Connection failed");
      }
    })();
    return () => { dead = true; unwatch(); syncRef.current?.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async (on: boolean) => {
    setSharing(on);
    if (!on) return;
    unwatchRef.current = watchPosition(
      (p: LatLng) => {
        const t = Date.now();
        if (t - lastPub.current > 10000 && syncRef.current) {
          lastPub.current = t;
          // (re)connect with pos subscription if needed — we only publish
          syncRef.current.publish("pos", { from: "client", ts: t, pos: p }, true).catch(() => {});
        }
      },
      (m) => setErr(m)
    );
  };
  const unwatchRef = useRef(() => {});

  useEffect(() => () => unwatchRef.current(), []);

  const active = !state || state.state === "active";

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-6 text-center">
      <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2">
          <path d="M12 22s8-3.6 8-10V5l-8-3-8 3v7c0 6.4 8 10 8 10z" />
        </svg>
      </div>
      <h1 className="mb-1 text-xl font-bold text-zinc-100">Guardian</h1>
      <p className="mb-6 text-sm text-zinc-500">
        {active ? "Location sharing for your upcoming appointment." : "This appointment has ended. Thanks!"}
      </p>
      {err && <p className="mb-4 text-sm text-red-400">{err}</p>}
      {active && (
        <Card className="w-full">
          <button
            onClick={() => toggle(!sharing)}
            className={`relative mx-auto mb-4 block h-16 w-28 rounded-full transition ${sharing ? "bg-emerald-500" : "bg-white/10"}`}
            aria-label="Share location"
          >
            <span className={`absolute top-2 h-12 w-12 rounded-full bg-white transition-all ${sharing ? "left-[60px]" : "left-2"}`} />
          </button>
          <p className="text-sm font-semibold text-zinc-200">{sharing ? "Sharing your location" : "Location sharing off"}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {sharing
              ? "Your host can see when you're nearby so they're ready when you arrive. Nothing else is shared."
              : "Turn this on when you're on your way."}
          </p>
        </Card>
      )}
      <Btn className="mt-6" onClick={() => toggle(false)}>Done</Btn>
    </div>
  );
}
