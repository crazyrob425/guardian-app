import { useEffect, useRef, useState } from "react";
import { TopBar, Card, Btn } from "../components/ui";
import { db, type ClientRow, type ClientVerdict, type BookingRow } from "../lib/db";
import { SCREENING_CHECKS } from "../lib/screening";
import {
  dossierStrength, computeRollups, contactChannelsOf, findDuplicates, mergeClients,
  validateDossier, dossierRoute,
} from "../lib/dossier";
import { extractFacts, extractFromImport, applyFacts, type CandidateFact } from "../lib/extract";
import ExtractionReview from "../components/ExtractionReview";

const VERDICTS: { id: ClientVerdict; label: string; cls: string }[] = [
  { id: "ok", label: "OK", cls: "bg-emerald-500/15 text-emerald-300" },
  { id: "caution", label: "Caution", cls: "bg-amber-500/15 text-amber-300" },
  { id: "avoid", label: "Avoid", cls: "bg-red-500/15 text-red-300" },
  { id: "unknown", label: "Unscreened", cls: "bg-white/10 text-zinc-300" },
];

type Filter = "all" | "regulars" | "avoid" | "verified" | "unverified" | "refs";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "regulars", label: "⭐ Regulars" },
  { id: "avoid", label: "🚫 Avoid" },
  { id: "verified", label: "✓ Verified" },
  { id: "unverified", label: "Unverified" },
  { id: "refs", label: "Has references" },
];

const go = (r: string) => { window.location.hash = r; };

function blankClient(): ClientRow {
  return {
    name: "", phone: "", phoneE164: "", email: "", handle: "",
    verdict: "unknown", flags: [], checks: {}, notes: "",
    createdAt: Date.now(), updatedAt: Date.now(), lastSeenAt: null,
    aliases: [], extraChannels: [], tags: [], incidents: [], commsLog: [],
  };
}

type ImportState =
  | { mode: "closed" }
  | { mode: "paste" }
  | { mode: "review"; facts: CandidateFact[]; rawText: string };

/**
 * Contact manager (2026-11-05): the searchable/filterable client list
 * in front of the full dossier page. Everything lives ONLY in this
 * device's database — never synced, never uploaded. The conversation
 * import here runs the same extraction-review gate as the dossier:
 * Guardian proposes facts from a pasted/imported thread, she confirms,
 * and duplicates merge instead of twinning.
 */
export default function ClientsScreen(props: { onBack: () => void }) {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [importState, setImportState] = useState<ImportState>({ mode: "closed" });
  const [pasteText, setPasteText] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const shotRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    const [rows, bs] = await Promise.all([
      db.clients.orderBy("updatedAt").reverse().toArray(),
      db.bookings.toArray().catch(() => [] as BookingRow[]),
    ]);
    setClients(rows);
    setBookings(bs);
  };
  useEffect(() => { void reload(); }, []);

  const filtered = clients.filter((c) => {
    if (filter === "regulars" && !c.regular) return false;
    if (filter === "avoid" && c.verdict !== "avoid") return false;
    if (filter === "verified" && c.verifiedStatus !== "yes") return false;
    if (filter === "unverified" && c.verifiedStatus === "yes") return false;
    if (filter === "refs" && !(c.references ?? []).some((r) => r.name.trim() || r.contact.trim())) return false;
    const needle = q.replace(/\D/g, "");
    const channels = contactChannelsOf(c).map((ch) => ch.value.toLowerCase()).join(" ");
    return (
      c.name.toLowerCase().includes(q.toLowerCase()) ||
      (c.aliases ?? []).join(" ").toLowerCase().includes(q.toLowerCase()) ||
      channels.includes(q.toLowerCase()) ||
      (needle.length >= 3 && c.phone.replace(/\D/g, "").includes(needle))
    );
  });

  // ---- conversation import → review → create / merge / hand off -------------
  const applyImport = async (selected: CandidateFact[], saveRawText: boolean) => {
    if (importState.mode !== "review") return;
    const draft = applyFacts(blankClient(), selected, { rawText: importState.rawText, saveRawText });
    setImportState({ mode: "closed" });
    setPasteText("");
    const all = await db.clients.toArray().catch(() => [] as ClientRow[]);
    const dupes = findDuplicates(draft, all);
    if (dupes.length) {
      // Same person: fold the confirmed facts into the existing dossier.
      const merged = mergeClients(dupes[0].client, draft);
      if (merged.id) await db.clients.put({ ...merged, updatedAt: Date.now() });
      go(dossierRoute(merged.id!));
      return;
    }
    if (validateDossier(draft).ok) {
      const id = await db.clients.add(draft);
      go(dossierRoute(id));
      return;
    }
    // Not enough for a record yet (no name): hand the confirmed facts to
    // the new-dossier page as a draft rather than dropping them.
    try { localStorage.setItem("guardian.dossier-draft.v1", JSON.stringify(draft)); } catch { /* noop */ }
    go(dossierRoute("new"));
  };

  const importFile = async (file: File) => {
    const text = await file.text();
    setImportState({ mode: "review", facts: extractFromImport(file.name, text), rawText: text });
  };

  /** OCR a screenshot on demand → the SAME extraction review as text imports. */
  const scanScreenshot = async (file: File) => {
    setScanning(true);
    setScanMsg("Reading screenshot on this device…");
    try {
      const w = window as unknown as { Tesseract?: { recognize: (f: File, l: string) => Promise<{ data: { text: string } }> } };
      if (!w.Tesseract) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.0.5/dist/tesseract.min.js";
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("OCR engine failed to load (offline?)"));
          document.head.appendChild(s);
        });
      }
      const res = await w.Tesseract!.recognize(file, "eng");
      setScanMsg("");
      setImportState({ mode: "review", facts: extractFacts(res.data.text), rawText: res.data.text });
    } catch (e) {
      setScanMsg(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const startDate = (c: ClientRow) => {
    try {
      localStorage.setItem("guardian.prefill.v1", JSON.stringify({ alias: c.name || c.handle || "Date", durationMin: 60, location: "", clientId: c.id }));
    } catch { /* noop */ }
    go("#/date");
  };

  const msgHref = (c: ClientRow): string => {
    const ch = contactChannelsOf(c)[0];
    if (!ch) return "";
    if (ch.kind === "phone") return `sms:${ch.value.replace(/[^+\d]/g, "")}`;
    if (ch.kind === "email") return `mailto:${ch.value}`;
    return "";
  };

  return (
    <div className="min-h-dvh pb-10">
      <TopBar title="Client dossiers" onBack={props.onBack} />
      <div className="mx-auto max-w-lg space-y-4 px-4 py-4">
        <Card>
          <p className="mb-2 text-sm text-zinc-300">Your private contact manager. It lives <strong>only on this phone</strong> — never uploaded, never synced, never shared. Only a name and one way to reach him are ever required; the dossier grows as facts show up.</p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button key={f.id} onClick={() => setFilter(f.id)} className={`rounded-xl px-2.5 py-1.5 text-xs font-semibold ${filter === f.id ? "bg-emerald-500/20 text-emerald-300" : "bg-white/5 text-zinc-400"}`}>{f.label}</button>
            ))}
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, alias, handle, email, or number…"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Btn variant="primary" onClick={() => go(dossierRoute("new"))}>+ Add client</Btn>
            <Btn onClick={() => setImportState({ mode: "paste" })}>📥 Import conversation</Btn>
            <Btn onClick={() => fileRef.current?.click()}>📁 Import file</Btn>
            <Btn onClick={() => shotRef.current?.click()} disabled={scanning}>{scanning ? "Scanning…" : "📷 Scan a screenshot"}</Btn>
          </div>
          {scanMsg && <p className="mt-2 text-xs text-amber-300">{scanMsg}</p>}
          <input ref={fileRef} type="file" accept=".txt,.json,.vcf,text/plain,application/json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ""; }} />
          <input ref={shotRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void scanScreenshot(f); e.target.value = ""; }} />
        </Card>

        {importState.mode === "paste" && (
          <Card>
            <p className="mb-2 text-sm font-semibold text-zinc-100">Paste a conversation</p>
            <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste the message thread here. Guardian reads it on this phone only, pulls out candidate facts, and shows them for your confirmation — nothing is saved without your say-so."
              className="min-h-36 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600" />
            <div className="mt-2 flex gap-2">
              <Btn variant="primary" disabled={!pasteText.trim()}
                onClick={() => setImportState({ mode: "review", facts: extractFacts(pasteText), rawText: pasteText })}>Read it</Btn>
              <Btn onClick={() => { setImportState({ mode: "closed" }); setPasteText(""); }}>Cancel</Btn>
            </div>
          </Card>
        )}
        {importState.mode === "review" && (
          <ExtractionReview facts={importState.facts} rawText={importState.rawText}
            onApply={(sel, saveRaw) => void applyImport(sel, saveRaw)} onCancel={() => setImportState({ mode: "closed" })} />
        )}

        {filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-zinc-600">{clients.length ? "No matches." : "No clients logged yet. Add one, or import a conversation and let Guardian build the first draft."}</p>
        )}
        {filtered.map((c) => {
          const v = VERDICTS.find((x) => x.id === c.verdict) ?? VERDICTS[3];
          const doneChecks = SCREENING_CHECKS.filter((k) => c.checks[k.id]).length;
          const roll = computeRollups(c, bookings);
          const strength = dossierStrength(c, roll);
          const refs = (c.references ?? []).filter((r) => r.name.trim() || r.contact.trim());
          const href = msgHref(c);
          return (
            <Card key={c.id} className="transition hover:border-white/25">
              <button onClick={() => c.id && go(dossierRoute(c.id))} className="w-full text-left">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-zinc-100">{c.regular ? "⭐ " : ""}{c.name || c.handle || c.phone || "Unnamed"}{c.verifiedStatus === "yes" ? " · ✓" : ""}</p>
                    <p className="truncate text-xs text-zinc-500">{[c.phone, c.handle && `@${c.handle}`, c.email].filter(Boolean).join(" · ") || "No contact channel yet"}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${v.cls}`}>{v.label}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${strength.pct}%` }} />
                  </div>
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Dossier {strength.pct}%</span>
                </div>
                <p className="mt-1.5 text-xs text-zinc-600">
                  Screening {doneChecks}/{SCREENING_CHECKS.length}
                  {c.flags.length ? ` · ⚑ ${c.flags.length} hint${c.flags.length === 1 ? "" : "s"}` : ""}
                  {roll.totalDates ? ` · ${roll.totalDates} date${roll.totalDates === 1 ? "" : "s"} done` : ""}
                  {refs.length ? ` · ${refs.length} ref${refs.length === 1 ? "" : "s"}` : ""}
                  {c.lastSeenAt ? ` · last seen ${new Date(c.lastSeenAt).toLocaleDateString()}` : ""}
                  {roll.noShows > 0 ? ` · ${roll.noShows} no-show${roll.noShows > 1 ? "s" : ""}` : ""}
                </p>
              </button>
              <div className="mt-3 grid grid-cols-4 gap-1.5">
                <button onClick={() => startDate(c)} className="rounded-lg bg-emerald-500/15 px-2 py-2 text-xs font-semibold text-emerald-300">▶ Start date</button>
                <button onClick={() => go("#/bookings")} className="rounded-lg bg-white/5 px-2 py-2 text-xs font-semibold text-zinc-200">+ Booking</button>
                {href
                  ? <a href={href} className="rounded-lg bg-white/5 px-2 py-2 text-center text-xs font-semibold text-zinc-200">✉ Message</a>
                  : <span className="rounded-lg bg-white/[0.02] px-2 py-2 text-center text-xs font-semibold text-zinc-600">✉ Message</span>}
                <button onClick={() => c.id && go(dossierRoute(c.id))} className="rounded-lg bg-white/5 px-2 py-2 text-xs font-semibold text-zinc-200">Dossier →</button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
