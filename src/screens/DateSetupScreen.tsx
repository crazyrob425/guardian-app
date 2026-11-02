import { useState } from "react";
import { TopBar, Card, Btn, Field, inputCls } from "../components/ui";
import { getLabels } from "../lib/labels";
import { store } from "../lib/store";
import { genKey, exportKey, randomId } from "../lib/crypto";
import { getCurrentPosition, type LatLng } from "../lib/geo";

export default function DateSetupScreen(props: { discreet: boolean; onBack: () => void; go: (r: string) => void }) {
  const L = getLabels(props.discreet);
  // One-shot prefill from the booking board (Phase 5): "Start" on a booking
  // lands here with alias + duration already filled.
  const [prefill] = useState(() => {
    try {
      const raw = localStorage.getItem("guardian.prefill.v1");
      if (raw) {
        localStorage.removeItem("guardian.prefill.v1");
        return JSON.parse(raw) as { alias?: string; durationMin?: number };
      }
    } catch { /* noop */ }
    return null;
  });
  const [alias, setAlias] = useState(prefill?.alias ?? "");
  const [minutes, setMinutes] = useState(String(prefill?.durationMin ?? 60));
  const [incall, setIncall] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const useMyLocation = async () => {
    setLocating(true);
    setErr("");
    try {
      setIncall(await getCurrentPosition());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't get your location.");
    } finally {
      setLocating(false);
    }
  };

  const start = async () => {
    const mins = parseInt(minutes, 10);
    if (!mins || mins < 5 || mins > 1440) { setErr(`Enter a ${L.date} length between 5 and 1440 minutes.`); return; }
    setBusy(true);
    try {
      const key = await genKey();
      store.saveSession({
        id: randomId(12),
        keyB64: await exportKey(key),
        alias: alias.trim(),
        startedAt: Date.now(),
        expectedMin: mins,
        incall,
        state: "active",
      });
      props.go("#/session");
    } catch (e) {
      setErr("Couldn't start — your device blocked crypto. Try another browser.");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh">
      <TopBar title={`New ${L.date}`} onBack={props.onBack} />
      <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
        <Card className="space-y-4">
          <Field label={`${L.Date} label (private, only you see this)`}>
            <input className={inputCls} value={alias} onChange={(e) => setAlias(e.target.value)} placeholder={props.discreet ? "e.g. Downtown appointment" : "e.g. Friday regular"} />
          </Field>
          <Field label={`Expected length (minutes)`} hint={`When time runs out you'll be asked to check out. Miss it and your circle is alerted.`}>
            <input className={inputCls} value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" />
          </Field>
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-zinc-400">
              {props.discreet ? "Meeting" : "Incall"} location (optional)
            </span>
            {incall ? (
              <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                Pinned: {incall.lat.toFixed(5)}, {incall.lng.toFixed(5)} — you'll be alerted as your {L.client} approaches.
              </p>
            ) : (
              <Btn onClick={useMyLocation} disabled={locating}>{locating ? "Locating…" : `Pin my current location`}</Btn>
            )}
            <p className="mt-1 text-xs text-zinc-500">Used only for arrival alerts. Never shared with anyone but your circle in an emergency.</p>
          </div>
          {err && <p className="text-sm text-red-400">{err}</p>}
          <Btn variant="primary" onClick={start} disabled={busy}>{busy ? "Starting…" : `Check in — start ${L.date}`}</Btn>
        </Card>
        <p className="text-xs text-zinc-600">
          Checking in publishes an encrypted status your circle can see. Your exact location only goes out during the {L.date} or an emergency.
        </p>
      </div>
    </div>
  );
}
