import { useEffect, useRef, useState } from "react";
import { store } from "../lib/store";
import { recentEvents, subscribeEvents, type GuardianEvent } from "../lib/events";
import { getEscalation, levelLabel, type EscalationState } from "../lib/escalation";
import PinGate from "./PinGate";

/**
 * Phase 8 — the news ticker. A slim bar fixed across the bottom of the
 * app carrying, in rotation: Low Signal Mode and other status alerts,
 * circle communications, remote commands received, and anything else the
 * event log records as important. Tapping it demands the PIN (PinGate)
 * and opens System Command & Control.
 */
export default function NewsTicker(props: { go: (r: string) => void; onDecoy?: () => void }) {
  const [items, setItems] = useState<GuardianEvent[]>([]);
  const [idx, setIdx] = useState(0);
  const [gateOpen, setGateOpen] = useState(false);
  const [esc, setEsc] = useState<EscalationState>(() => getEscalation(store.getSession()?.id ?? ""));
  const sessionIdRef = useRef<string>(store.getSession()?.id ?? "");

  useEffect(() => {
    let dead = false;
    const load = async () => {
      const sid = store.getSession()?.id ?? "";
      sessionIdRef.current = sid;
      const rows = await recentEvents(12, sid || undefined);
      if (!dead) setItems(rows);
      setEsc(getEscalation(sid));
    };
    void load();
    const unsub = subscribeEvents((e) => {
      setItems((cur) => [e, ...cur.filter((x) => x.ts !== e.ts)].slice(0, 12));
      setEsc(getEscalation(sessionIdRef.current));
    });
    const slow = window.setInterval(() => { void load(); }, 15000);
    return () => { dead = true; unsub(); window.clearInterval(slow); };
  }, []);

  useEffect(() => {
    if (items.length < 2) return;
    const t = window.setInterval(() => setIdx((i) => i + 1), 4500);
    return () => window.clearInterval(t);
  }, [items.length]);

  const current = items.length ? items[idx % items.length] : null;
  const settings = store.getSettings();

  const openGate = () => {
    if (!settings.pinHash) {
      props.go("#/command");
      return;
    }
    setGateOpen(true);
  };

  const barCls = esc.level === 3
    ? "border-red-500/50 bg-[#170b0e]/95"
    : esc.lowSignal
      ? "border-amber-500/50 bg-[#171106]/95"
      : "border-white/10 bg-black/90";

  return (
    <>
      <button
        onClick={openGate}
        className={`fixed inset-x-0 bottom-0 z-40 flex h-11 items-center gap-2 border-t px-3 text-left backdrop-blur ${barCls}`}
        aria-label="Open Command and Control"
      >
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${esc.level === 3 ? "bg-red-500 text-white" : esc.lowSignal ? "bg-amber-500 text-black" : "bg-emerald-500/20 text-emerald-300"}`}>
          {esc.level === 3 ? "EMERGENCY" : esc.lowSignal ? "LOW SIGNAL" : levelLabel(esc).replace("Level 1 — ", "")}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">
          {current ? current.text : "Guardian is watching. Tap for Command & Control."}
        </span>
        {current && <span className="shrink-0 text-[10px] text-zinc-600">{new Date(current.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>}
        <span className="shrink-0 text-zinc-500">›</span>
      </button>
      {gateOpen && (
        <PinGate
          onReal={() => { setGateOpen(false); props.go("#/command"); }}
          onClose={() => setGateOpen(false)}
          onDecoy={props.onDecoy}
        />
      )}
    </>
  );
}
