import { useCallback, useEffect, useState } from "react";
import LockScreen from "./screens/LockScreen";
import HomeScreen from "./screens/HomeScreen";
import CircleScreen from "./screens/CircleScreen";
import DateSetupScreen from "./screens/DateSetupScreen";
import SessionScreen from "./screens/SessionScreen";
import ClientScreen from "./screens/ClientScreen";
import WatchScreen from "./screens/WatchScreen";
import PaymentsScreen from "./screens/PaymentsScreen";
import SettingsScreen from "./screens/SettingsScreen";
import { store, type ActiveSession } from "./lib/store";
import { genKey, exportKey, randomId } from "./lib/crypto";
import { getCurrentPosition } from "./lib/geo";
import { startSiren, stopSiren } from "./lib/audio";
import { sendEmergencyAlert } from "./lib/emergency";
import { watchLink } from "./lib/sync";

type Route =
  | { name: "home" } | { name: "date" } | { name: "session" }
  | { name: "circle" } | { name: "payments" } | { name: "settings" }
  | { name: "client"; id: string; k: string }
  | { name: "watch"; id: string; k: string };

function parseHash(): Route {
  const h = window.location.hash || "#/";
  const noHash = h.startsWith("#") ? h.slice(1) : h;
  const [pathPart, queryPart] = noHash.split("?");
  const segs = pathPart.split("/").filter(Boolean);
  const q = new URLSearchParams(queryPart || "");
  if (segs[0] === "client" && segs[1]) return { name: "client", id: segs[1], k: q.get("k") || "" };
  if (segs[0] === "watch" && segs[1]) return { name: "watch", id: segs[1], k: q.get("k") || "" };
  switch (segs[0]) {
    case "date": return { name: "date" };
    case "session": return { name: "session" };
    case "circle": return { name: "circle" };
    case "payments": return { name: "payments" };
    case "settings": return { name: "settings" };
    default: return { name: "home" };
  }
}

export function go(r: string) {
  window.location.hash = r;
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash());
  const [settings, setSettings] = useState(store.getSettings());
  const [session, setSession] = useState<ActiveSession | null>(store.getSession());
  const [unlocked, setUnlocked] = useState(false);
  const [sos, setSos] = useState<{ watchUrl: string; count: number } | null>(null);

  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash());
      setSession(store.getSession());
      setSettings(store.getSettings());
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const refresh = useCallback(() => {
    setSettings(store.getSettings());
    setSession(store.getSession());
  }, []);

  const discreet = settings.discreetMode;
  const needsLock = (route.name !== "client" && route.name !== "watch") && !!settings.pinHash && !unlocked;

  /** Silent duress unlock: looks normal, alerts the circle in the background. */
  const handleUnlock = async (duress: boolean) => {
    setUnlocked(true);
    if (!duress) return;
    try {
      const s = store.getSettings();
      const circle = store.getCircle();
      if (circle.length === 0) return;
      const id = randomId(12);
      const keyB64 = await exportKey(await genKey());
      let pos = null;
      try { pos = await getCurrentPosition(); } catch { /* noop */ }
      sendEmergencyAlert({ settings: s, circle, type: "duress", sessionId: id, keyB64, pos, alias: "duress" });
    } catch { /* silent by design */ }
  };

  /** Big red button on Home with no active session: SOS right now. */
  const panicNow = async () => {
    const s = store.getSettings();
    const circle = store.getCircle();
    startSiren();
    try {
      const id = randomId(12);
      const keyB64 = await exportKey(await genKey());
      let pos = null;
      try { pos = await getCurrentPosition(); } catch { /* noop */ }
      const url = watchLink(window.location.origin, id, keyB64);
      setSos({ watchUrl: url, count: circle.length });
      sendEmergencyAlert({ settings: s, circle, type: "panic", sessionId: id, keyB64, pos, alias: "SOS" });
    } catch {
      setSos({ watchUrl: "", count: 0 });
    }
  };

  if (needsLock) {
    return (
      <div className="min-h-dvh bg-[#0a0a0f] text-zinc-100">
        <LockScreen pinHash={settings.pinHash} duressPinHash={settings.duressPinHash} onUnlock={handleUnlock} title={discreet ? "Guardian" : "Guardian"} />
      </div>
    );
  }

  const back = () => go(session ? "#/session" : "#/");

  let screen: React.ReactNode;
  switch (route.name) {
    case "client":
      screen = route.k ? <ClientScreen sessionId={route.id} keyB64={route.k} /> : <p className="p-8 text-center text-red-400">This link is missing its key.</p>;
      break;
    case "watch":
      screen = route.k ? <WatchScreen sessionId={route.id} keyB64={route.k} /> : <p className="p-8 text-center text-red-400">This link is missing its key.</p>;
      break;
    case "date":
      screen = <DateSetupScreen discreet={discreet} onBack={() => go("#/")} go={go} />;
      break;
    case "session":
      screen = session ? <SessionScreen discreet={discreet} onBack={() => go("#/")} go={go} /> : <HomeScreen discreet={discreet} session={null} onPanic={panicNow} go={go} />;
      break;
    case "circle":
      screen = <CircleScreen onBack={back} />;
      break;
    case "payments":
      screen = <PaymentsScreen onBack={back} />;
      break;
    case "settings":
      screen = <SettingsScreen onBack={back} onChanged={refresh} />;
      break;
    default:
      screen = <HomeScreen discreet={discreet} session={session} onPanic={panicNow} go={go} />;
  }

  return (
    <div className="min-h-dvh bg-[#0a0a0f] text-zinc-100">
      {sos && route.name === "home" && (
        <div className="border-b border-red-500/40 bg-red-500/10 px-4 py-3 text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-red-300">SOS sent to {sos.count} {sos.count === 1 ? "person" : "people"}</p>
          <div className="mt-2 flex justify-center gap-2">
            <button onClick={() => { stopSiren(); setSos(null); }} className="rounded-lg bg-white/10 px-4 py-2 text-sm text-zinc-200">Stop siren / dismiss</button>
            {sos.watchUrl && <button onClick={() => { navigator.clipboard?.writeText(sos.watchUrl).catch(() => {}); }} className="rounded-lg bg-white/10 px-4 py-2 text-sm text-zinc-200">Copy live link</button>}
          </div>
        </div>
      )}
      {screen}
    </div>
  );
}
