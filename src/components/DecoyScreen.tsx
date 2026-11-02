import { useRef, useState } from "react";

/**
 * Decoy mode (Phase 5): what the decoy PIN opens — a perfectly boring
 * notes app. For the moment someone insists on "just unlocking the phone
 * app for me." Triple-tap the Notes title to return to the real lock.
 */
const K = "guardian.decoyNotes.v1";
const SEED = ["Groceries — eggs, oat milk, basil", "Gift ideas for Mom", "Car service — book before the 15th", "Books to read: that sailing one"];

function load(): string[] {
  try {
    const raw = localStorage.getItem(K);
    if (raw) return JSON.parse(raw) as string[];
  } catch { /* seed */ }
  return SEED;
}

export default function DecoyScreen(props: { onExit: () => void }) {
  const [notes, setNotes] = useState<string[]>(load);
  const [draft, setDraft] = useState("");
  const tapsRef = useRef<number[]>([]);
  const holdRef = useRef<number | null>(null);

  const save = (n: string[]) => {
    setNotes(n);
    try { localStorage.setItem(K, JSON.stringify(n)); } catch { /* noop */ }
  };

  // Exit, two ways: 3 quick taps on the title (timestamp-based, no state
  // closures to go stale), or press-and-hold the title for 1.5 s.
  const titleTap = () => {
    const now = Date.now();
    tapsRef.current = [...tapsRef.current.filter((t) => now - t < 2000), now];
    if (tapsRef.current.length >= 3) {
      tapsRef.current = [];
      props.onExit();
    }
  };
  const holdStart = () => {
    holdRef.current = window.setTimeout(() => props.onExit(), 1500);
  };
  const holdEnd = () => {
    if (holdRef.current) window.clearTimeout(holdRef.current);
    holdRef.current = null;
  };

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-10 pt-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 onClick={titleTap} onPointerDown={holdStart} onPointerUp={holdEnd} onPointerLeave={holdEnd} className="cursor-default text-2xl font-bold text-zinc-100 select-none">📝 Notes</h1>
        <span className="text-xs text-zinc-600">{notes.length} notes</span>
      </div>
      <div className="mb-4 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="New note…"
          className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600"
        />
        <button
          onClick={() => { if (draft.trim()) { save([draft.trim(), ...notes]); setDraft(""); } }}
          className="rounded-xl bg-white/10 px-4 text-sm font-semibold text-zinc-100"
        >
          Add
        </button>
      </div>
      <div className="space-y-2">
        {notes.map((n, i) => (
          <div key={i} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <p className="text-sm text-zinc-300">{n}</p>
            <button onClick={() => save(notes.filter((_, j) => j !== i))} className="text-zinc-600" aria-label="Delete note">✕</button>
          </div>
        ))}
      </div>
      <p className="mt-8 text-center text-xs text-zinc-700">Notes</p>
    </div>
  );
}
