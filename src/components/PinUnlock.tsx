import { useState } from "react";
import { verifyPin } from "../lib/pin";
import { hasPasskey, verifyPasskey, passkeySupported } from "../lib/passkey";
import { store } from "../lib/store";
import { buzz, unlockAlarm } from "../lib/audio";

/**
 * Panic PIN gate. When a panic alarm is sounding, this is the ONLY way to
 * silence it: the App PIN set in Settings. The duress PIN also "works" —
 * the alarm stops — but onDuress fires a silent coercion alert, so being
 * forced to silence it still calls for help. "Keep it sounding" closes
 * the pad and leaves the alarm blaring.
 */
export default function PinUnlock(props: {
  onUnlocked: () => void;
  onDuress?: () => void;
  onKeepSounding: () => void;
}) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const settings = store.getSettings();

  const press = (d: string) => {
    if (pin.length >= 8) return;
    setPin(pin + d);
    setErr("");
  };

  const submit = async () => {
    if (await verifyPin(pin, settings.pinHash)) {
      unlockAlarm();
      props.onUnlocked();
    } else if (settings.duressPinHash && (await verifyPin(pin, settings.duressPinHash))) {
      // Coerced silence: looks like a normal unlock, alerts silently.
      unlockAlarm();
      try { props.onDuress?.(); } catch { /* noop */ }
      props.onUnlocked();
    } else {
      buzz(120);
      setErr("Wrong PIN — alarm keeps sounding");
      setPin("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl border border-red-500/40 bg-[#14090c] p-6 shadow-2xl">
        <p className="text-center text-3xl">🔒</p>
        <h2 className="mt-2 text-center text-lg font-black uppercase tracking-widest text-red-400">Alarm locked</h2>
        <p className="mt-1 text-center text-sm text-zinc-400">
          This panic alarm can only be silenced with your PIN — the one you set in Settings.
        </p>
        <div className="my-5 flex justify-center gap-3">
          {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
            <div key={i} className={`h-3.5 w-3.5 rounded-full ${i < pin.length ? "bg-red-400" : "bg-white/10"}`} />
          ))}
        </div>
        {err && <p className="mb-3 text-center text-sm font-semibold text-red-400">{err}</p>}
        <div className="grid grid-cols-3 gap-2.5">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((d) => (
            <button
              key={d || "empty"}
              onClick={() => (d === "⌫" ? setPin(pin.slice(0, -1)) : d && press(d))}
              className="rounded-2xl bg-white/5 py-3.5 text-2xl font-semibold text-zinc-100 active:bg-white/15"
            >
              {d}
            </button>
          ))}
        </div>
        <button onClick={submit} disabled={pin.length < 4} className="mt-5 w-full rounded-xl bg-red-500 py-3.5 font-bold text-white disabled:opacity-40">
          Enter PIN — silence alarm
        </button>
        {passkeySupported() && hasPasskey() && (
          <button
            onClick={async () => { try { if (await verifyPasskey()) { unlockAlarm(); props.onUnlocked(); } else setErr("Passkey didn't verify — alarm keeps sounding"); } catch { setErr("Passkey didn't verify — alarm keeps sounding"); } }}
            className="mt-2.5 w-full rounded-xl bg-white/10 py-3 font-semibold text-zinc-100"
          >
            🖐 Silence with fingerprint / Face ID
          </button>
        )}
        <button onClick={props.onKeepSounding} className="mt-2.5 w-full rounded-xl bg-white/5 py-3 text-sm text-zinc-300">
          Keep it sounding
        </button>
      </div>
    </div>
  );
}
