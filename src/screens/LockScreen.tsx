import { useState } from "react";
import { verifyPin } from "../lib/pin";
import { hasPasskey, verifyPasskey, passkeySupported } from "../lib/passkey";
import { buzz } from "../lib/audio";

/** PIN pad. Duress PIN unlocks silently AND triggers a silent alert. */
export default function LockScreen(props: {
  pinHash: string;
  duressPinHash: string;
  onUnlock: (duress: boolean) => void;
  title: string;
}) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  const press = (d: string) => {
    if (pin.length >= 8) return;
    setPin(pin + d);
    setErr("");
  };

  const submit = async () => {
    if (await verifyPin(pin, props.pinHash)) {
      props.onUnlock(false);
    } else if (props.duressPinHash && (await verifyPin(pin, props.duressPinHash))) {
      // Silent: behaves like a normal unlock, but flags duress upstream.
      props.onUnlock(true);
    } else {
      buzz(120);
      setErr("Wrong PIN");
      setPin("");
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-6">
      <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2">
          <path d="M12 22s8-3.6 8-10V5l-8-3-8 3v7c0 6.4 8 10 8 10z" />
        </svg>
      </div>
      <h1 className="mb-1 text-xl font-bold text-zinc-100">{props.title}</h1>
      <p className="mb-6 text-sm text-zinc-500">Enter PIN to continue</p>
      <div className="mb-6 flex gap-3">
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <div key={i} className={`h-3.5 w-3.5 rounded-full ${i < pin.length ? "bg-emerald-400" : "bg-white/10"}`} />
        ))}
      </div>
      {err && <p className="mb-4 text-sm text-red-400">{err}</p>}
      <div className="grid w-full grid-cols-3 gap-3">
        {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((d) => (
          <button
            key={d || "empty"}
            onClick={() => (d === "⌫" ? setPin(pin.slice(0, -1)) : d && press(d))}
            className="rounded-2xl bg-white/5 py-4 text-2xl font-semibold text-zinc-100 active:bg-white/15"
          >
            {d}
          </button>
        ))}
      </div>
      <button onClick={submit} className="mt-6 w-full rounded-xl bg-emerald-500 py-3.5 font-semibold text-black">
        Unlock
      </button>
      {passkeySupported() && hasPasskey() && (
        <button
          onClick={async () => { try { if (await verifyPasskey()) props.onUnlock(false); else setErr("Passkey didn't verify — PIN still works."); } catch { setErr("Passkey didn't verify — PIN still works."); } }}
          className="mt-3 w-full rounded-xl bg-white/10 py-3.5 font-semibold text-zinc-100"
        >
          🖐 Unlock with fingerprint / Face ID
        </button>
      )}
    </div>
  );
}
