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
import ClientsScreen from "./screens/ClientsScreen";
import DossierScreen from "./screens/DossierScreen"; // Dossier/contact-manager (2026-11-05)
import UpdateToast from "./components/UpdateToast";
import DecoyScreen from "./components/DecoyScreen";
import LedgerScreen from "./screens/LedgerScreen";
import BookingsScreen from "./screens/BookingsScreen";
import VaultScreen from "./screens/VaultScreen";
import PlacesScreen from "./screens/PlacesScreen";
import SetupWizard from "./screens/SetupWizard";
import CommandScreen from "./screens/CommandScreen";
import NewsTicker from "./components/NewsTicker";
import { startConnectivityMonitor } from "./lib/connectivity";
import { logEvent } from "./lib/events";
import { takeDueFollowUps } from "./lib/quickrequests";
import { runFollowUp } from "./lib/dispatch";
import { getSetup } from "./lib/setup";
import FakeCall from "./components/FakeCall";
import { fakeCallDue, clearFakeCall } from "./lib/fakecall";
import { ErrorBoundary } from "react-error-boundary";
import { store, type ActiveSession } from "./lib/store";
import { logDiagnostic } from "./lib/db";
import { genKey, exportKey, randomId } from "./lib/crypto";
import { getCurrentPosition } from "./lib/geo";
import { startSiren, stopSiren, lockAlarm, isAlarmLocked } from "./lib/audio";
import PinUnlock from "./components/PinUnlock";
import { sendEmergencyAlert } from "./lib/emergency";
import { watchLink } from "./lib/sync";
import { shareLink, type SharePayload } from "./lib/share";
import ShareSheet from "./components/ShareSheet";

type Route =
  | { name: "home" } | { name: "date" } | { name: "session" }
  | { name: "circle" } | { name: "payments" } | { name: "settings" }
  | { name: "clients" }
  | { name: "ledger" } | { name: "bookings" } | { name: "vault" } | { name: "places" }
  | { name: "setup" } | { name: "command" }
  | { name: "dossier"; id?: number } // Dossier/contact-manager (2026-11-05): #/dossier/<id> or #/dossier/new
  | { name: "client"; id: string; k: string }
  | { name: "watch"; id: string; k: string };

function parseHash(): Route {
  const h = window.location.hash || "#/";
  const noHash = h.startsWith("#") ? h.slice(1) : h;
  const [pathPart, queryPart] = noHash.split("?");
  const segs = pathPart.split("/").filter(Boolean);
  const q = new URLSearchParams(queryPart || "");
  if (segs[0] === "client" && segs[1]) return { name: "client", id: segs[1], k: q.get("k") || "" };
  // Dossier/contact-manager (2026-11-05): deep link into one client's dossier.
  if (segs[0] === "dossier") return { name: "dossier", id: segs[1] && segs[1] !== "new" ? parseInt(segs[1], 10) || undefined : undefined };
  if (segs[0] === "watch" && segs[1]) return { name: "watch", id: segs[1], k: q.get("k") || "" };
  switch (segs[0]) {
    case "date": return { name: "date" };
    case "session": return { name: "session" };
    case "circle": return { name: "circle" };
    case "payments": return { name: "payments" };
    case "settings": return { name: "settings" };
    case "clients": return { name: "clients" };
    case "ledger": return { name: "ledger" };
    case "bookings": return { name: "bookings" };
    case "vault": return { name: "vault" };
    case "places": return { name: "places" };
    case "setup": return { name: "setup" };
    case "command": return { name: "command" };
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
  const [pinUnlockOpen, setPinUnlockOpen] = useState(false);
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);
  const [fakeRinging, setFakeRinging] = useState(false);
  const [decoy, setDecoy] = useState(false);
  const [deadmanDue, setDeadmanDue] = useState(false);
  const [deadmanCount, setDeadmanCount] = useState(60);

  // Dead-man's switch (Phase 5): if enabled and no proof-of-life inside the
  // interval, demand a check-in — and if that's ignored for 60 s, fire the
  // SOS exactly like the panic button. Unlocking counts as proof of life.
  useEffect(() => {
    if (!unlocked || decoy || !settings.deadmanEnabled) return;
    const check = () => {
      let last = 0;
      try { last = parseInt(localStorage.getItem("guardian.deadman.v1") || "0", 10) || 0; } catch { /* noop */ }
      if (!last) { try { localStorage.setItem("guardian.deadman.v1", String(Date.now())); } catch { /* noop */ } return; }
      if (Date.now() - last > settings.deadmanHours * 3600 * 1000) setDeadmanDue(true);
    };
    check();
    const t = window.setInterval(check, 20000);
    return () => window.clearInterval(t);
  }, [unlocked, decoy, settings.deadmanEnabled, settings.deadmanHours]);

  useEffect(() => {
    if (!deadmanDue) return;
    setDeadmanCount(60);
    const t = window.setInterval(() => {
      setDeadmanCount((c) => {
        if (c <= 1) {
          window.clearInterval(t);
          setDeadmanDue(false);
          try { localStorage.setItem("guardian.deadman.v1", String(Date.now())); } catch { /* noop */ }
          void panicNow();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadmanDue]);

  const deadmanOk = () => {
    try { localStorage.setItem("guardian.deadman.v1", String(Date.now())); } catch { /* noop */ }
    logEvent("checkin", "✅ Dead-man's check-in answered — I'm OK.", store.getSession()?.id ?? "");
    setDeadmanDue(false);
  };

  // Phase 8: connectivity monitor (Low Signal Mode driver) — advisory
  // only, it can never block a safety path. Runs app-wide once.
  useEffect(() => { startConnectivityMonitor(); }, []);

  // Phase 8: scheduled quick-request follow-ups (door knocks, siren
  // triggers) fire from here so they survive navigation between screens.
  useEffect(() => {
    if (!unlocked || decoy) return;
    const t = window.setInterval(() => {
      const s = store.getSession();
      if (!s) return;
      for (const fu of takeDueFollowUps(s.id, Date.now())) {
        void runFollowUp(fu, s);
      }
    }, 5000);
    return () => window.clearInterval(t);
  }, [unlocked, decoy]);

  // Fake rescue call host: fires the scheduled call from any screen.
  useEffect(() => {
    const t = window.setInterval(() => {
      if (!fakeRinging && fakeCallDue()) setFakeRinging(true);
    }, 2000);
    return () => window.clearInterval(t);
  }, [fakeRinging]);

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

  // Phase 6 first-run gate: until Sis has walked her through setup, Home IS
  // the wizard. Guests (watch/client links) never see this.
  useEffect(() => {
    if (unlocked && route.name === "home" && !getSetup().done && !store.getSession()) {
      go("#/setup");
    }
  }, [unlocked, route.name]);

  /** Silent duress unlock: looks normal, alerts the circle in the background. */
  const handleUnlock = async (duress: boolean) => {
    setUnlocked(true);
    try { localStorage.setItem("guardian.deadman.v1", String(Date.now())); } catch { /* noop */ }
    if (!duress) {
      logEvent("checkin", "✅ App unlocked — proof of life.", store.getSession()?.id ?? "");
      return;
    }
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
    logEvent("command", "🆘 SOS fired from the home screen — siren on, circle alerted.", store.getSession()?.id ?? "");
    startSiren();
    lockAlarm();
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
        <LockScreen pinHash={settings.pinHash} duressPinHash={settings.duressPinHash} decoyPinHash={settings.decoyPinHash} onUnlock={handleUnlock} onDecoy={() => { setDecoy(true); setUnlocked(true); }} title={discreet ? "Guardian" : "Guardian"} />
      </div>
    );
  }

  if (decoy) {
    return (
      <div className="min-h-dvh bg-[#0a0a0f] text-zinc-100">
        <DecoyScreen onExit={() => { setDecoy(false); setUnlocked(false); }} />
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
    case "clients":
      screen = <ClientsScreen onBack={back} />;
      break;
    case "payments":
      screen = <PaymentsScreen onBack={back} />;
      break;
    case "ledger":
      screen = <LedgerScreen onBack={back} />;
      break;
    case "bookings":
      screen = <BookingsScreen onBack={back} go={go} />;
      break;
    case "vault":
      screen = <VaultScreen onBack={back} />;
      break;
    case "places":
      screen = <PlacesScreen onBack={back} />;
      break;
    case "setup":
      screen = <SetupWizard go={go} onDone={refresh} />;
      break;
    case "command":
      screen = <CommandScreen onBack={back} go={go} />;
      break;
    case "dossier": // Dossier/contact-manager (2026-11-05)
      screen = <DossierScreen clientId={route.id} onBack={() => go("#/clients")} go={go} />;
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
          {isAlarmLocked() && <p className="mt-0.5 text-xs text-red-200/70">Alarm is PIN-locked — only your Settings PIN can silence it.</p>}
          <div className="mt-2 flex justify-center gap-2">
            <button onClick={() => { if (isAlarmLocked()) { setPinUnlockOpen(true); return; } stopSiren(); setSos(null); }} className="rounded-lg bg-white/10 px-4 py-2 text-sm text-zinc-200">{isAlarmLocked() ? "🔒 Enter PIN to stop alarm" : "Stop alarm / dismiss"}</button>
            {sos.watchUrl && <button onClick={() => { navigator.clipboard?.writeText(sos.watchUrl).catch(() => {}); }} className="rounded-lg bg-white/10 px-4 py-2 text-sm text-zinc-200">Copy live link</button>}
            {sos.watchUrl && <button onClick={async () => { const p = { title: "Guardian SOS — watch over me", text: "SOS — I need help. This private link shows my live location, please open it now and don't forward it:", url: sos.watchUrl }; const r = await shareLink(p); if (r === "fallback") setSharePayload(p); }} className="rounded-lg bg-red-500/30 px-4 py-2 text-sm font-semibold text-red-100">📤 Share live link</button>}
          </div>
        </div>
      )}
      {sharePayload && <ShareSheet payload={sharePayload} onClose={() => setSharePayload(null)} />}
      <UpdateToast />
      {deadmanDue && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-amber-500/40 bg-[#141007] p-6 text-center shadow-2xl">
            <p className="text-3xl">⏰</p>
            <h2 className="mt-2 text-lg font-black uppercase tracking-widest text-amber-300">Are you OK?</h2>
            <p className="mt-1 text-sm text-zinc-400">Guardian hasn't had a check-in from you in {settings.deadmanHours} hours. If you don't answer in <strong className="text-amber-200">{deadmanCount}s</strong>, your circle gets an emergency alert with your location.</p>
            <button onClick={deadmanOk} className="mt-5 w-full rounded-xl bg-emerald-500 py-3.5 font-bold text-black">I'm OK — check in</button>
          </div>
        </div>
      )}
      {/* Crash-proofing (Phase 1): a failure in any single screen shows a
          calm fallback instead of a dead app. The SOS banner above and any
          sounding alarm live OUTSIDE this boundary, so they keep working. */}
      {pinUnlockOpen && (
        <PinUnlock
          onUnlocked={() => { setPinUnlockOpen(false); stopSiren(); setSos(null); }}
          onDuress={() => { void handleUnlock(true); }}
          onKeepSounding={() => setPinUnlockOpen(false)}
        />
      )}
      {fakeRinging && (
        <FakeCall
          callerName={settings.fakeCallerName || "Mom"}
          personaId={settings.fakeCallPersona}
          theme={settings.fakeCallTheme}
          live={settings.fakeCallLive}
          onDone={() => { clearFakeCall(); setFakeRinging(false); }}
        />
      )}
      {/* Phase 8 news ticker: rides the bottom of every owner screen;
          guests (watch/client links) never see it. Spacer keeps page
          content clear of the fixed bar. */}
      {route.name !== "client" && route.name !== "watch" && (
        <>
          <div className="h-11" />
          <NewsTicker go={go} onDecoy={() => { setDecoy(true); setUnlocked(true); }} />
        </>
      )}
      <ErrorBoundary
        onError={(e) => { void logDiagnostic(e instanceof Error ? e.message : String(e), `route:${route.name}`); }}
        fallbackRender={({ resetErrorBoundary }) => (
          <div className="mx-auto max-w-sm px-6 py-16 text-center">
            <p className="mb-2 text-lg font-bold text-zinc-100">Guardian hit a snag</p>
            <p className="mb-6 text-sm text-zinc-400">This screen failed, but your session, your circle alerts, and any sounding alarm are unaffected.</p>
            <button onClick={resetErrorBoundary} className="rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-emerald-950">Reload this screen</button>
          </div>
        )}
      >
        {screen}
      </ErrorBoundary>
    </div>
  );
}
