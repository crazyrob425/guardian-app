import { Card } from "./ui";
import type { Settings } from "../lib/store";
import { ALL_PATH_IDS, PATH_DEFS, type PathId } from "../lib/blast";
import { ntfyConfigured } from "../lib/notify";

/**
 * Phase 8 — backup alert paths configuration. Shared by the Sis setup
 * wizard step and Settings so both surfaces edit the same truth.
 *
 * Honest labeling rules (the app does not fake delivery):
 *  · automated paths can confirm delivery and take part in blast probing,
 *  · manual paths (share sheet / deep links) need her tap and never
 *    report a "confirmed" delivery,
 *  · a path that isn't configured yet says so instead of silently
 *    pretending to be a backup.
 */
export default function BackupPathsCard(props: {
  s: Settings;
  set: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
}) {
  const { s, set } = props;
  const enabled = new Set(s.backupPaths ?? []);

  const toggle = (id: PathId) => {
    if (id === "sync") return; // the session channel is always a path
    const next = new Set(enabled);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set("backupPaths", ALL_PATH_IDS.filter((x) => next.has(x) || x === "sync"));
  };

  const stateNote = (id: PathId): string | null => {
    switch (id) {
      case "sync": return "Always on during a date.";
      case "ntfy": return ntfyConfigured(s) ? "Paired and ready." : "Needs a push topic — set it in the push alerts card (Settings) or the Circle step.";
      case "sms": return s.twilioWorkerUrl.trim() ? "Relay configured." : "Needs the SMS relay URL (Settings) before it can really send.";
      default: return null;
    }
  };

  return (
    <Card className="space-y-3">
      <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Backup alert paths — when the signal dies</p>
      <p className="text-sm text-zinc-300">
        If Guardian detects a dead zone or failed deliveries, it switches to <strong className="text-amber-300">Low Signal Mode</strong> and
        blasts time-critical messages out <strong>every automated path at once</strong> — then remembers which paths actually
        delivered and leads with those for the rest of the date, with a second wave a few seconds behind.
      </p>
      <div className="space-y-2">
        {ALL_PATH_IDS.map((id) => {
          const def = PATH_DEFS[id];
          const on = id === "sync" || enabled.has(id);
          const note = stateNote(id);
          return (
            <div key={id} className={`rounded-xl px-3 py-2.5 ${on ? "bg-white/[0.06]" : "bg-white/[0.02] opacity-70"}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-zinc-100">
                  {def.label}
                  {def.builtin && <span className="ml-2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-300">built-in</span>}
                  {!def.automated && <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-zinc-400">manual — your tap</span>}
                </p>
                <button
                  onClick={() => toggle(id)}
                  disabled={id === "sync"}
                  className={`relative h-7 w-12 shrink-0 rounded-full ${on ? "bg-emerald-500" : "bg-white/10"} ${id === "sync" ? "opacity-60" : ""}`}
                  aria-label={`Toggle ${def.label}`}
                >
                  <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all ${on ? "left-[1.375rem]" : "left-0.5"}`} />
                </button>
              </div>
              <p className="mt-1 text-xs text-zinc-500">{def.blurb}</p>
              {note && <p className="mt-0.5 text-xs text-zinc-400">{note}</p>}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5">
        <div>
          <p className="text-sm font-semibold text-zinc-100">Second-wave delay</p>
          <p className="text-xs text-zinc-500">For critical alerts: confirmed paths fire first, the rest follow this many seconds later.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => set("backupSecondWaveSec", Math.max(5, (s.backupSecondWaveSec ?? 7) - 1))} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-bold text-zinc-100">−</button>
          <span className="w-10 text-center font-mono text-sm text-zinc-100">{s.backupSecondWaveSec ?? 7}s</span>
          <button onClick={() => set("backupSecondWaveSec", Math.min(10, (s.backupSecondWaveSec ?? 7) + 1))} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-bold text-zinc-100">+</button>
        </div>
      </div>
    </Card>
  );
}
