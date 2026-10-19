import { useEffect, useState } from "react";
import PanicButton from "../components/PanicButton";
import { Card, Btn } from "../components/ui";
import { getLabels } from "../lib/labels";
import { store, type ActiveSession } from "../lib/store";
import { startSiren, stopSiren, isSirenOn, buzz } from "../lib/audio";

export default function HomeScreen(props: {
  discreet: boolean;
  session: ActiveSession | null;
  onPanic: () => void;
  go: (r: string) => void;
}) {
  const L = getLabels(props.discreet);
  const [sirenOn, setSirenOn] = useState(isSirenOn());
  const settings = store.getSettings();

  useEffect(() => {
    const t = setInterval(() => setSirenOn(isSirenOn()), 500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 pb-10 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">Guardian</p>
          <h1 className="text-2xl font-bold text-zinc-100">
            {settings.displayName ? `Hey, ${settings.displayName}` : "Stay safe out there"}
          </h1>
        </div>
        <button onClick={() => props.go("#/settings")} className="rounded-xl bg-white/5 p-2.5 text-zinc-400" aria-label="Settings">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        </button>
      </div>

      {props.session && props.session.state === "active" && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-emerald-300">{L.Date} in progress</p>
              <p className="text-xs text-zinc-400">{props.session.alias || "Active session"}</p>
            </div>
            <Btn variant="emerald" className="!w-auto !px-5" onClick={() => props.go("#/session")}>Open</Btn>
          </div>
        </Card>
      )}

      <Card className="flex flex-col items-center py-8">
        <PanicButton label={`Hold for ${L.panic}`} onTrigger={() => { buzz([300]); props.onPanic(); }} />
        {sirenOn && (
          <button onClick={() => { stopSiren(); setSirenOn(false); }} className="mt-4 rounded-xl bg-amber-500/20 border border-amber-500/40 px-6 py-2.5 font-semibold text-amber-300">
            Stop siren
          </button>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Btn variant="primary" onClick={() => props.go("#/date")}>Start {L.date}</Btn>
        <Btn onClick={() => props.go("#/payments")}>Payments</Btn>
        <Btn onClick={() => props.go("#/circle")}>Safety circle</Btn>
        <Btn onClick={() => { if (sirenOn) { stopSiren(); setSirenOn(false); } else { startSiren(); setSirenOn(true); } }}>
          {sirenOn ? "Stop siren" : "Test siren"}
        </Btn>
      </div>

      <p className="text-center text-xs text-zinc-600">
        Everything is encrypted end-to-end. Your safety circle only sees what you share, when you share it.
      </p>
    </div>
  );
}
