import { useState } from "react";
import { verifyPin } from "../lib/pin";
import { hasPasskey, verifyPasskey, passkeySupported } from "../lib/passkey";
import { store } from "../lib/store";
import { buzz } from "../lib/audio";
import { sendEmergencyAlert } from "../lib/emergency";
import { genKey, exportKey, randomId } from "../lib/crypto";
import { getCurrentPosition } from "../lib/geo";
import { logEvent } from "../lib/events";

/**
 * Phase 8 — the ticker's PIN gate to Command & Control.
 *
 * C&C is the most concentrated real data in the app (client, location,
 * circle, logs), so the gate follows the app-lock rules EXACTLY:
 *   · real PIN (or passkey) → opens C&C,
 *   · duress PIN → looks like it worked — shows a bland "all normal"
 *     status page with NO session data — and silently alerts the circle,
 *     exactly like a duress unlock,
 *   · decoy PIN → same bland page (or the full decoy app, if wired),
 *   · anything else → wrong-PIN buzz, nothing revealed.
 */
export default function PinGate(props: {
  onReal: () => void;
  onClose: () => void;
  onDecoy?: () => void;
}) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [bland, setBland] = useState(false);
  const settings = store.getSettings();
  const session = store.getSession();

  const silentDuress = async () => {
    // Mirror App.handleUnlock's duress behavior: alert in the background,
    // look completely normal in the foreground.
    try {
      const circle = store.getCircle();
      if (!circle.length) return;
      const id = randomId(12);
      const keyB64 = await exportKey(await genKey());
      let pos = null;
      try { pos = await getCurrentPosition(); } catch { /* noop */ }
      void sendEmergencyAlert({ settings, circle, type: "duress", sessionId: id, keyB64, pos, alias: "duress" });
      logEvent("status", "Duress PIN used at the Command & Control gate — silent alert sent.", session?.id ?? "");
    } catch { /* silent by design */ }
  };

  const submit = async () => {
    if (await verifyPin(pin, settings.pinHash)) {
      props.onReal();
    } else if (settings.duressPinHash && (await verifyPin(pin, settings.duressPinHash))) {
      void silentDuress();
      setBland(true);
    } else if (settings.decoyPinHash && (await verifyPin(pin, settings.decoyPinHash))) {
      if (props.onDecoy) props.onDecoy();
      else setBland(true);
    } else {
      buzz(120);
      setErr("Wrong PIN.");
      setPin("");
    }
  };

  if (bland) {
    // The duress/decoy face: plausible, calm, and completely empty of data.
    const now = new Date();
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 px-4 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#101014] p-6 shadow-2xl">
          <p className="text-center text-3xl">✓</p>
          <h2 className="mt-2 text-center text-lg font-bold text-zinc-100">System status</h2>
          <div className="mt-4 space-y-2 text-sm text-zinc-400">
            <p className="flex justify-between"><span>Time</span><span className="text-zinc-200">{now.toLocaleTimeString()}</span></p>
            <p className="flex justify-between"><span>Alerts</span><span className="text-zinc-200">None active</span></p>
            <p className="flex justify-between"><span>Network</span><span className="text-zinc-200">Connected</span></p>
            <p className="flex justify-between"><span>Reminders</span><span className="text-zinc-200">Nothing due</span></p>
          </div>
          <button onClick={props.onClose} className="mt-6 w-full rounded-xl bg-white/10 py-3 font-semibold text-zinc-100">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl border border-emerald-500/30 bg-[#0c1210] p-6 shadow-2xl">
        <p className="text-center text-3xl">🛡️</p>
        <h2 className="mt-2 text-center text-lg font-black uppercase tracking-widest text-emerald-300">Command &amp; Control</h2>
        <p className="mt-1 text-center text-sm text-zinc-400">Enter your PIN to open the full status board.</p>
        <div className="my-5 flex justify-center gap-3">
          {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
            <div key={i} className={`h-3.5 w-3.5 rounded-full ${i < pin.length ? "bg-emerald-400" : "bg-white/10"}`} />
          ))}
        </div>
        {err && <p className="mb-3 text-center text-sm font-semibold text-red-400">{err}</p>}
        <div className="grid grid-cols-3 gap-2.5">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((d) => (
            <button
              key={d || "empty"}
              onClick={() => (d === "⌫" ? setPin(pin.slice(0, -1)) : d && pin.length < 8 && setPin(pin + d))}
              className="rounded-2xl bg-white/5 py-3.5 text-2xl font-semibold text-zinc-100 active:bg-white/15"
            >
              {d}
            </button>
          ))}
        </div>
        <button onClick={() => void submit()} disabled={pin.length < 4} className="mt-5 w-full rounded-xl bg-emerald-500 py-3.5 font-bold text-black disabled:opacity-40">
          Open Command &amp; Control
        </button>
        {passkeySupported() && hasPasskey() && (
          <button
            onClick={async () => { try { if (await verifyPasskey()) props.onReal(); else setErr("Passkey didn't match."); } catch { setErr("Passkey didn't match."); } }}
            className="mt-2.5 w-full rounded-xl bg-white/10 py-3 font-semibold text-zinc-100"
          >
            Use passkey
          </button>
        )}
        <button onClick={props.onClose} className="mt-2.5 w-full rounded-xl bg-white/5 py-3 text-sm text-zinc-300">Cancel</button>
      </div>
    </div>
  );
}
