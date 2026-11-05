import { useEffect, useMemo, useRef, useState } from "react";
import { TopBar, Card, Btn } from "../components/ui";
import { db, type ClientRow, type ClientVerdict, type BookingRow } from "../lib/db";
import { phoneIntel, emailIntel, SCREENING_CHECKS } from "../lib/screening";
import {
  validateDossier, dossierStrength, computeRollups, findDuplicates, mergeClients,
  contactChannelsOf, emptyReference, uid, MAX_REFERENCES, type ContactChannel,
  type DuplicateMatch, type MergePick,
} from "../lib/dossier";
import { extractFacts, extractFromImport, applyFacts, type CandidateFact } from "../lib/extract";
import ExtractionReview from "../components/ExtractionReview";

const VERDICTS: { id: ClientVerdict; label: string; cls: string }[] = [
  { id: "ok", label: "OK", cls: "bg-emerald-500/15 text-emerald-300" },
  { id: "caution", label: "Caution", cls: "bg-amber-500/15 text-amber-300" },
  { id: "avoid", label: "Avoid", cls: "bg-red-500/15 text-red-300" },
  { id: "unknown", label: "Unscreened", cls: "bg-white/10 text-zinc-300" },
];

const input = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600";
const label = "mb-1 block text-xs uppercase tracking-widest text-zinc-500";
const sectionTitle = "mb-2 text-xs uppercase tracking-widest text-zinc-500";

function blankClient(): ClientRow {
  return {
    name: "", phone: "", phoneE164: "", email: "", handle: "",
    verdict: "unknown", flags: [], checks: {}, notes: "",
    createdAt: Date.now(), updatedAt: Date.now(), lastSeenAt: null,
    aliases: [], extraChannels: [], references: [emptyReference(), emptyReference(), emptyReference()],
    tags: [], incidents: [], commsLog: [],
  };
}

type ImportState =
  | { mode: "closed" }
  | { mode: "paste" }
  | { mode: "review"; facts: CandidateFact[]; rawText: string };

/**
 * The full client dossier / contact manager page (2026-11-05). Extends
 * the Phase 2 client record into a complete dossier: identity + every
 * contact channel, status toggles (deposit / incall-outcall / three-way
 * verified), three structured provider references, screening details,
 * computed date/payment rollups, incidents, and a message-import flow
 * that auto-populates candidate facts behind a human review gate.
 * On-device only — the dossier never leaves this phone.
 */
export default function DossierScreen(props: { clientId?: number; onBack: () => void; go: (r: string) => void }) {
  const [row, setRow] = useState<ClientRow | null>(null);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [saved, setSaved] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [importState, setImportState] = useState<ImportState>({ mode: "closed" });
  const [pasteText, setPasteText] = useState("");
  const [dupes, setDupes] = useState<DuplicateMatch[]>([]);
  const [mergePicks, setMergePicks] = useState<Partial<Record<string, MergePick>>>({});
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const shotRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      if (props.clientId) {
        const c = await db.clients.get(props.clientId).catch(() => undefined);
        setRow(c ?? blankClient());
        const bs = await db.bookings.where("clientId").equals(props.clientId).toArray().catch(() => [] as BookingRow[]);
        setBookings(bs.sort((a, b) => b.ts - a.ts));
      } else {
        // A conversation import from the contact manager may hand over a
        // prefilled draft (facts confirmed there, record not yet saved).
        let draft = blankClient();
        try {
          const raw = localStorage.getItem("guardian.dossier-draft.v1");
          if (raw) {
            localStorage.removeItem("guardian.dossier-draft.v1");
            draft = { ...draft, ...(JSON.parse(raw) as Partial<ClientRow>), id: undefined };
          }
        } catch { /* no draft handed over */ }
        setRow(draft);
      }
    })();
  }, [props.clientId]);

  const rollups = useMemo(() => (row ? computeRollups(row, bookings) : null), [row, bookings]);
  const strength = useMemo(() => (row ? dossierStrength(row, rollups ?? undefined) : null), [row, rollups]);
  const refs = useMemo(() => {
    const r = [...(row?.references ?? [])];
    while (r.length < MAX_REFERENCES) r.push(emptyReference());
    return r.slice(0, MAX_REFERENCES);
  }, [row?.references]);

  if (!row || !rollups || !strength) return <div className="min-h-dvh"><TopBar title="Dossier" onBack={props.onBack} /></div>;

  const set = (patch: Partial<ClientRow>) => setRow((r) => (r ? { ...r, ...patch } : r));
  const phone = phoneIntel(row.phone);
  const email = emailIntel(row.email);

  // ---- save + duplicate gate ------------------------------------------------
  const persist = async (rec: ClientRow): Promise<ClientRow> => {
    const flags = Array.from(new Set([...phoneIntel(rec.phone).flags, ...emailIntel(rec.email).flags]));
    const out: ClientRow = { ...rec, phoneE164: phoneIntel(rec.phone).e164, flags, updatedAt: Date.now() };
    if (out.id) await db.clients.put(out);
    else out.id = await db.clients.add(out);
    return out;
  };

  const save = async (force = false) => {
    const v = validateDossier(row);
    setErrors(v.errors);
    if (!v.ok) { setSaved(""); return; }
    if (!force) {
      const all = await db.clients.toArray().catch(() => [] as ClientRow[]);
      const found = findDuplicates(row, all);
      if (found.length) { setDupes(found); setSaved(""); return; }
    }
    const out = await persist(row);
    setRow(out);
    setDupes([]);
    setSaved("Saved — on this device only.");
    setTimeout(() => setSaved(""), 2500);
  };

  const doMerge = async (match: DuplicateMatch) => {
    const merged = mergeClients(match.client, row, mergePicks);
    const out = await persist(merged);
    // If the draft was its own saved record, it has been folded in — remove it.
    if (row.id && row.id !== match.client.id) await db.clients.delete(row.id).catch(() => {});
    setRow(out);
    setDupes([]);
    setSaved(`Merged into ${out.name || "the existing record"} — on this device only.`);
  };

  const remove = async () => {
    if (row.id && window.confirm("Delete this dossier from this device? This cannot be undone.")) {
      await db.clients.delete(row.id);
      props.onBack();
    }
  };

  const rateBooking = async (b: BookingRow, rating: number) => {
    if (!b.id) return;
    const next = b.rating === rating ? undefined : rating;
    await db.bookings.update(b.id, { rating: next });
    setBookings((h) => h.map((x) => (x.id === b.id ? { ...x, rating: next } : x)));
  };

  // ---- import flows ------------------------------------------------------------
  const openReview = (facts: CandidateFact[], rawText: string) => setImportState({ mode: "review", facts, rawText });
  const applyImport = (selected: CandidateFact[], saveRawText: boolean) => {
    if (importState.mode !== "review") return;
    setRow((r) => (r ? applyFacts(r, selected, { rawText: importState.rawText, saveRawText }) : r));
    setImportState({ mode: "closed" });
    setPasteText("");
    setSaved("Confirmed facts added — hit Save record to keep them.");
  };

  const importFile = async (file: File) => {
    const text = await file.text();
    openReview(extractFromImport(file.name, text), text);
  };

  const pickContact = async () => {
    const nav = navigator as Navigator & { contacts?: { select: (props: string[], opts: { multiple: boolean }) => Promise<{ name?: string[]; tel?: string[]; email?: string[] }[]> } };
    if (!nav.contacts?.select) { setScanMsg("Contact Picker isn't available in this browser — paste or import a file instead."); return; }
    try {
      const picked = await nav.contacts.select(["name", "tel", "email"], { multiple: false });
      const c = picked[0];
      if (!c) return;
      const facts: CandidateFact[] = [];
      if (c.name?.[0]) facts.push({ id: uid("f"), kind: "name", label: "Name (device contacts)", value: c.name[0], snippet: c.name[0], confidence: 0.9, preChecked: true });
      for (const t of c.tel ?? []) facts.push({ id: uid("f"), kind: "phone", label: "Phone number", value: t, snippet: t, confidence: 0.95, preChecked: true });
      for (const e of c.email ?? []) facts.push({ id: uid("f"), kind: "email", label: "Email", value: e, snippet: e, confidence: 0.95, preChecked: true });
      openReview(facts, "");
    } catch { /* picker dismissed */ }
  };

  /** Screenshot OCR → the SAME extraction-review gate as text imports. */
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
      openReview(extractFacts(res.data.text), res.data.text);
    } catch (e) {
      setScanMsg(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const startDate = () => {
    try {
      localStorage.setItem("guardian.prefill.v1", JSON.stringify({ alias: row.name || row.handle || "Date", durationMin: 60, location: "", clientId: row.id }));
    } catch { /* noop */ }
    props.go("#/date");
  };

  const msgHref = (() => {
    const ch = contactChannelsOf(row)[0];
    if (!ch) return "";
    if (ch.kind === "phone") return `sms:${ch.value.replace(/[^+\d]/g, "")}`;
    if (ch.kind === "email") return `mailto:${ch.value}`;
    return "";
  })();

  const setRef = (i: number, patch: Partial<(typeof refs)[number]>) =>
    set({ references: refs.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const setChannel = (i: number, patch: Partial<ContactChannel>) =>
    set({ extraChannels: (row.extraChannels ?? []).map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  return (
    <div className="min-h-dvh pb-10">
      <TopBar title={row.id ? "Client dossier" : "New dossier"} onBack={props.onBack} />
      <div className="mx-auto max-w-lg space-y-4 px-4 py-4">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-zinc-300">The full dossier. It lives <strong>only on this phone</strong> — never uploaded, never synced. Only a name and one way to reach him are required; everything else is there when you have it.</p>
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-xs text-zinc-500"><span>Dossier strength</span><span>{strength.pct}%</span></div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${strength.pct}%` }} />
            </div>
            {strength.missing.length > 0 && <p className="mt-1.5 text-xs text-zinc-600">Still empty: {strength.missing.slice(0, 4).join(" · ")}{strength.missing.length > 4 ? ` · +${strength.missing.length - 4} more` : ""}</p>}
          </div>
          {row.id && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Btn variant="primary" onClick={startDate}>▶ Start date</Btn>
              <Btn onClick={() => props.go("#/bookings")}>+ Booking</Btn>
              {msgHref
                ? <a href={msgHref} className="rounded-xl bg-white/5 px-5 py-3.5 text-center text-base text-zinc-200 border border-white/10 transition hover:bg-white/10">✉ Message</a>
                : <Btn disabled>✉ Message</Btn>}
            </div>
          )}
        </Card>

        {/* ---- import ---- */}
        <Card>
          <p className={sectionTitle}>Import — let Guardian read the messages</p>
          <p className="mb-3 text-xs leading-relaxed text-zinc-500">Paste a conversation, import an export file (.txt / .json / .vcf), pick from your device contacts, or scan a screenshot. Guardian pulls out candidate facts <strong className="text-zinc-300">on this device</strong> and shows them for your confirmation first — nothing inferred is ever saved without your say-so.</p>
          {importState.mode === "closed" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Btn variant="primary" onClick={() => setImportState({ mode: "paste" })}>📋 Paste conversation</Btn>
                <Btn onClick={() => fileRef.current?.click()}>📁 Import file</Btn>
                <Btn onClick={() => void pickContact()}>👤 From contacts</Btn>
                <Btn onClick={() => shotRef.current?.click()} disabled={scanning}>{scanning ? "Scanning…" : "📷 Scan screenshot"}</Btn>
              </div>
              {scanMsg && <p className="mt-2 text-xs text-amber-300">{scanMsg}</p>}
              <input ref={fileRef} type="file" accept=".txt,.json,.vcf,text/plain,application/json" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ""; }} />
              <input ref={shotRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void scanScreenshot(f); e.target.value = ""; }} />
            </>
          )}
          {importState.mode === "paste" && (
            <div>
              <textarea className={input + " min-h-36"} value={pasteText} onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste the message thread here. It is read on this phone only and discarded after review unless you choose to save it to the comms log." />
              <div className="mt-2 flex gap-2">
                <Btn variant="primary" disabled={!pasteText.trim()} onClick={() => openReview(extractFacts(pasteText), pasteText)}>Read it</Btn>
                <Btn onClick={() => { setImportState({ mode: "closed" }); setPasteText(""); }}>Cancel</Btn>
              </div>
            </div>
          )}
        </Card>
        {importState.mode === "review" && (
          <ExtractionReview facts={importState.facts} rawText={importState.rawText}
            onApply={applyImport} onCancel={() => setImportState({ mode: "closed" })} />
        )}

        {/* ---- identity & contacts ---- */}
        <Card>
          <p className={sectionTitle}>Identity &amp; contacts</p>
          <div className="space-y-3">
            <div><label className={label}>Name *</label>
              <input className={input} value={row.name} onChange={(e) => set({ name: e.target.value })} placeholder="Name he gave you (required)" /></div>
            <div><label className={label}>Aliases / other names</label>
              <input className={input} value={(row.aliases ?? []).join(", ")} onChange={(e) => set({ aliases: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} placeholder="Comma-separated" /></div>
            <div><label className={label}>Phone</label>
              <input className={input} value={row.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+1 555 123 4567" inputMode="tel" />
              {row.phone && <p className="mt-1 text-xs text-zinc-500">{phone.valid ? `${phone.e164} · ${phone.country} · ${phone.typeLabel}` : "Not a recognized number yet"}</p>}
              {phone.flags.map((f) => <p key={f} className="mt-1 text-xs text-amber-300">⚑ {f}</p>)}
            </div>
            <div><label className={label}>Email</label>
              <input className={input} value={row.email} onChange={(e) => set({ email: e.target.value })} placeholder="name@example.com" inputMode="email" />
              {email.flags.map((f) => <p key={f} className="mt-1 text-xs text-amber-300">⚑ {f}</p>)}
            </div>
            <div><label className={label}>Booking handle / username</label>
              <input className={input} value={row.handle} onChange={(e) => set({ handle: e.target.value })} placeholder="Where they booked from" /></div>

            {(row.extraChannels ?? []).map((ch, i) => (
              <div key={ch.id} className="flex gap-2">
                <select value={ch.kind} onChange={(e) => setChannel(i, { kind: e.target.value as ContactChannel["kind"] })}
                  className="w-24 shrink-0 rounded-xl border border-white/10 bg-white/5 px-2 py-2.5 text-sm text-zinc-100">
                  <option value="phone">Phone</option><option value="email">Email</option><option value="handle">Handle</option><option value="other">Other</option>
                </select>
                <input className={input} value={ch.label} onChange={(e) => setChannel(i, { label: e.target.value })} placeholder="Platform" />
                <input className={input} value={ch.value} onChange={(e) => setChannel(i, { value: e.target.value })} placeholder="Value" />
                <button onClick={() => set({ extraChannels: (row.extraChannels ?? []).filter((_, j) => j !== i) })} className="shrink-0 rounded-xl bg-white/5 px-3 text-zinc-400" aria-label="Remove channel">✕</button>
              </div>
            ))}
            <Btn onClick={() => set({ extraChannels: [...(row.extraChannels ?? []), { id: uid("ch"), kind: "handle", label: "", value: "" }] })}>+ Another way to reach him</Btn>

            <div><label className={label}>Where you met / source platform</label>
              <input className={input} value={row.source ?? ""} onChange={(e) => set({ source: e.target.value })} placeholder="Tryst, P411, SkipTheGames, referral…" /></div>
            <div><label className={label}>First contact</label>
              <input type="date" className={input} value={row.firstContactAt ? new Date(row.firstContactAt).toISOString().slice(0, 10) : ""}
                onChange={(e) => set({ firstContactAt: e.target.value ? new Date(e.target.value + "T12:00:00").getTime() : null })} /></div>
            <div><label className={label}>Tags</label>
              <input className={input} value={(row.tags ?? []).join(", ")} onChange={(e) => set({ tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} placeholder="Comma-separated — e.g. generous, chatty, hotel-only" /></div>
          </div>
        </Card>

        {/* ---- status toggles ---- */}
        <Card>
          <p className={sectionTitle}>Status</p>
          <div><label className={label}>Verdict</label>
            <div className="grid grid-cols-4 gap-2">
              {VERDICTS.map((v) => (
                <button key={v.id} onClick={() => set({ verdict: v.id })}
                  className={`rounded-xl px-2 py-2 text-xs font-bold ${row.verdict === v.id ? v.cls + " ring-2 ring-white/40" : "bg-white/5 text-zinc-400"}`}>{v.label}</button>
              ))}
            </div>
          </div>
          <div className="mt-4"><label className={label}>Verified</label>
            <div className="grid grid-cols-3 gap-2">
              {([["yes", "✓ Yes"], ["in-progress", "… In progress"], ["no", "✗ No"]] as const).map(([v, l]) => (
                <button key={v} onClick={() => set({ verifiedStatus: row.verifiedStatus === v ? undefined : v })}
                  className={`rounded-xl px-2 py-2 text-xs font-bold ${row.verifiedStatus === v ? "bg-emerald-500/20 text-emerald-300 ring-2 ring-emerald-400/40" : "bg-white/5 text-zinc-400"}`}>{l}</button>
              ))}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5">
              <span className="text-sm text-zinc-200">Deposit required</span>
              <input type="checkbox" checked={!!row.depositRequired} onChange={(e) => set({ depositRequired: e.target.checked })} className="h-5 w-5 shrink-0 accent-emerald-500" />
            </label>
            <div>
              <label className={label}>Incall / outcall</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(["incall", "outcall", "both"] as const).map((v) => (
                  <button key={v} onClick={() => set({ servicePref: row.servicePref === v ? "" : v })}
                    className={`rounded-lg px-2 py-2 text-xs font-bold capitalize ${row.servicePref === v ? "bg-emerald-500/20 text-emerald-300 ring-2 ring-emerald-400/40" : "bg-white/5 text-zinc-400"}`}>{v}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-2.5">
            <label className="flex cursor-pointer items-center gap-3 text-sm text-zinc-300">
              <input type="checkbox" checked={!!row.regular} onChange={(e) => set({ regular: e.target.checked })} className="h-5 w-5 accent-emerald-500" />
              ⭐ This is a regular
            </label>
            <div>
              <p className="mb-1 text-xs text-zinc-500">Permission to re-contact them?</p>
              <div className="grid grid-cols-3 gap-2">
                {(["unknown", "yes", "no"] as const).map((v) => (
                  <button key={v} onClick={() => set({ rebook: v })} className={`rounded-xl px-2 py-2 text-xs font-bold ${(row.rebook ?? "unknown") === v ? "bg-emerald-500/20 text-emerald-300 ring-2 ring-emerald-400/40" : "bg-white/5 text-zinc-400"}`}>{v === "unknown" ? "Not asked" : v === "yes" ? "Yes — ask me" : "Never"}</button>
                ))}
              </div>
            </div>
          </div>
          {(row.noShows ?? 0) > 0 && <p className="mt-3 text-xs text-amber-300">⚑ {row.noShows} no-show(s) on record.</p>}
        </Card>

        {/* ---- references ---- */}
        <Card>
          <p className={sectionTitle}>Provider references</p>
          <p className="mb-3 text-xs leading-relaxed text-zinc-500">Up to three. Who vouched for him, how to reach her, what she said, and whether you confirmed it yourself. This stays on this phone — a future Guardian network check will use these without ever exposing them.</p>
          <div className="space-y-3">
            {refs.map((r, i) => (
              <div key={i} className="rounded-xl bg-white/[0.04] p-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">Reference {i + 1}</p>
                <div className="grid grid-cols-2 gap-2">
                  <input className={input} value={r.name} onChange={(e) => setRef(i, { name: e.target.value })} placeholder="Her name" />
                  <input className={input} value={r.contact} onChange={(e) => setRef(i, { contact: e.target.value })} placeholder="Her number / contact" />
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="grid flex-1 grid-cols-3 gap-1.5">
                    {(["positive", "neutral", "negative"] as const).map((s) => (
                      <button key={s} onClick={() => setRef(i, { sentiment: s })}
                        className={`rounded-lg px-2 py-1.5 text-xs font-bold capitalize ${r.sentiment === s
                          ? s === "positive" ? "bg-emerald-500/20 text-emerald-300 ring-2 ring-emerald-400/40"
                            : s === "negative" ? "bg-red-500/20 text-red-300 ring-2 ring-red-400/40"
                            : "bg-white/15 text-zinc-100 ring-2 ring-white/40"
                          : "bg-white/5 text-zinc-400"}`}>{s}</button>
                    ))}
                  </div>
                  <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-zinc-300">
                    <input type="checkbox" checked={r.confirmed} onChange={(e) => setRef(i, { confirmed: e.target.checked })} className="h-5 w-5 accent-emerald-500" />
                    Ref confirmed
                  </label>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* ---- screening ---- */}
        <Card>
          <p className={sectionTitle}>Screening</p>
          <div className="space-y-2">
            {SCREENING_CHECKS.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-3 text-sm text-zinc-300">
                <input type="checkbox" checked={!!row.checks[c.id]}
                  onChange={(e) => set({ checks: { ...row.checks, [c.id]: e.target.checked } })}
                  className="h-5 w-5 accent-emerald-500" />
                {c.label}
              </label>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div><label className={label}>Age (as stated)</label>
              <input className={input} value={row.screenDetails?.age ?? ""} onChange={(e) => set({ screenDetails: { ...(row.screenDetails ?? {}), age: e.target.value } })} placeholder="40s" /></div>
            <div><label className={label}>Occupation</label>
              <input className={input} value={row.screenDetails?.occupation ?? ""} onChange={(e) => set({ screenDetails: { ...(row.screenDetails ?? {}), occupation: e.target.value } })} placeholder="As stated" /></div>
            <div><label className={label}>Vehicle</label>
              <input className={input} value={row.screenDetails?.vehicle ?? ""} onChange={(e) => set({ screenDetails: { ...(row.screenDetails ?? {}), vehicle: e.target.value } })} placeholder="Silver F-150, plate…" /></div>
            <div><label className={label}>ID checked</label>
              <div className="grid grid-cols-2 gap-1.5">
                {([true, false] as const).map((v) => (
                  <button key={String(v)} onClick={() => set({ screenDetails: { ...(row.screenDetails ?? {}), idChecked: v } })}
                    className={`rounded-lg px-2 py-2.5 text-xs font-bold ${row.screenDetails?.idChecked === v ? "bg-emerald-500/20 text-emerald-300 ring-2 ring-emerald-400/40" : "bg-white/5 text-zinc-400"}`}>{v ? "Yes" : "No"}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3"><label className={label}>Social / profile links</label>
            <textarea className={input + " min-h-16"} value={row.screenDetails?.socials ?? ""} onChange={(e) => set({ screenDetails: { ...(row.screenDetails ?? {}), socials: e.target.value } })} placeholder="One per line" /></div>
        </Card>

        {/* ---- dates & ratings + payments ---- */}
        <Card>
          <p className={sectionTitle}>Dates, ratings &amp; payments — computed from your bookings</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              [`${rollups.totalDates}`, "dates done"],
              [rollups.averageRating ? `★ ${rollups.averageRating.toFixed(1)}` : "—", "avg rating"],
              [`${rollups.noShows}`, "no-shows"],
              [`$${rollups.depositsTaken}`, "deposits taken"],
              [`$${rollups.depositsUpcoming}`, "deposits upcoming"],
              [rollups.lastDateAt ? new Date(rollups.lastDateAt).toLocaleDateString() : "—", "last date"],
            ].map(([v, l]) => (
              <div key={l} className="rounded-xl bg-white/[0.04] px-2 py-2.5">
                <p className="text-base font-bold text-zinc-100">{v}</p>
                <p className="text-[10px] uppercase tracking-widest text-zinc-500">{l}</p>
              </div>
            ))}
          </div>
          {bookings.length === 0 && <p className="mt-3 text-xs text-zinc-600">No bookings linked to this client yet. Link a booking to this dossier and dates, deposits, and ratings collect themselves here — nothing to type.</p>}
          <div className="mt-3 space-y-2">
            {bookings.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.04] px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-zinc-200">{new Date(b.ts).toLocaleDateString()} — {b.alias}</p>
                  <p className="text-xs text-zinc-500">{b.durationMin} min · {b.status}{b.deposit ? ` · $${b.deposit} deposit` : ""}</p>
                </div>
                {b.status === "done" && (
                  <div className="flex shrink-0 gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} onClick={() => void rateBooking(b, n)} className={`text-base leading-none ${(b.rating ?? 0) >= n ? "text-amber-300" : "text-zinc-700"}`} aria-label={`Rate ${n} stars`}>★</button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* ---- notes & incidents ---- */}
        <Card>
          <p className={sectionTitle}>Notes, preferences &amp; incidents</p>
          <div className="space-y-3">
            <div><label className={label}>Private notes</label>
              <textarea className={input + " min-h-24"} value={row.notes} onChange={(e) => set({ notes: e.target.value })}
                placeholder="Anything future-you needs. Never leaves this phone." /></div>
            <div><label className={label}>His preferences</label>
              <textarea className={input + " min-h-16"} value={row.preferences ?? ""} onChange={(e) => set({ preferences: e.target.value })} placeholder="What he likes, how he books, timing quirks…" /></div>
            <div><label className={label}>Boundaries</label>
              <textarea className={input + " min-h-16"} value={row.boundaries ?? ""} onChange={(e) => set({ boundaries: e.target.value })} placeholder="Your limits with this client — stated, agreed, or learned." /></div>
          </div>
          <p className="mb-1 mt-4 text-xs text-zinc-500">Safety flags / incident log</p>
          <div className="space-y-2">
            {(row.incidents ?? []).slice().sort((a, b) => b.ts - a.ts).map((inc) => (
              <div key={inc.id} className="flex items-start gap-2 rounded-xl bg-white/[0.04] px-3 py-2">
                <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${inc.severity === "serious" ? "bg-red-500/20 text-red-300" : inc.severity === "caution" ? "bg-amber-500/20 text-amber-300" : "bg-white/10 text-zinc-300"}`}>{inc.severity}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-200">{inc.text}</p>
                  <p className="text-xs text-zinc-600">{new Date(inc.ts).toLocaleString()}</p>
                </div>
                <button onClick={() => set({ incidents: (row.incidents ?? []).filter((x) => x.id !== inc.id) })} className="shrink-0 rounded-lg bg-white/5 px-2 py-1 text-xs text-zinc-400" aria-label="Remove incident">✕</button>
              </div>
            ))}
            <IncidentAdder onAdd={(severity, text) => set({ incidents: [...(row.incidents ?? []), { id: uid("in"), ts: Date.now(), severity, text }] })} />
          </div>
          <div className="mt-4">
            <p className="mb-1 text-xs text-zinc-500">Follow-up flow — deniable, permission-based. Tap to copy, send it yourself, and stamp it done.</p>
            <div className="space-y-2">
              {([
                ["thanks", "1 · Thank-you", `Hi ${row.name || "there"} — thank you for a lovely time. I really enjoyed meeting you. 💋`],
                ["review", "2 · Review ask", "If you had a good time, a kind word where you found me helps me more than you know. No pressure at all."],
                ["recontact", "3 · Re-invite", "I'll be around this week if you'd like to do that again sometime. No worries either way."],
              ] as const).map(([k, l2, text]) => (
                <div key={k} className="flex items-center justify-between gap-2">
                  <span className="text-sm text-zinc-300">{l2}{row.followUps?.[k] ? <span className="ml-2 text-xs text-emerald-300">✓ {new Date(row.followUps[k]!).toLocaleDateString()}</span> : ""}</span>
                  <button onClick={async () => { try { await navigator.clipboard.writeText(text); } catch { /* noop */ } set({ followUps: { ...(row.followUps ?? {}), [k]: Date.now() } }); }} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-100">Copy + stamp</button>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* ---- comms log ---- */}
        {(row.commsLog ?? []).length > 0 && (
          <Card>
            <p className={sectionTitle}>Communications log</p>
            <div className="space-y-2">
              {(row.commsLog ?? []).slice().sort((a, b) => b.ts - a.ts).map((e) => (
                <details key={e.id} className="rounded-xl bg-white/[0.04] px-3 py-2">
                  <summary className="cursor-pointer text-sm text-zinc-300">{e.channel} — {new Date(e.ts).toLocaleString()}</summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-zinc-400">{e.text}</pre>
                </details>
              ))}
            </div>
          </Card>
        )}

        {/* ---- share toggles (status-ping consent) ---- */}
        <Card>
          <p className="mb-1 text-xs uppercase tracking-widest text-zinc-500">Share with my circle — status updates only</p>
          <p className="mb-3 text-xs leading-relaxed text-zinc-500">
            When someone in your circle taps “Full status” during a date, Guardian answers with a bundle. These three
            switches decide which dossier fields may ride along <strong className="text-zinc-300">for this client</strong>.
            All default OFF, and they apply to nothing else — your notes never leave this phone any other way.
          </p>
          <div className="space-y-2.5">
            {([
              ["shareNotes", "Dossier notes", "The private notes above, word for word."],
              ["shareRatings", "Date ratings", "The stars you gave after each completed date."],
              ["shareHistory", "Visit history", "New vs returning, and how many dates you've completed together."],
            ] as const).map(([k, title, hint]) => (
              <label key={k} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5">
                <span>
                  <span className="block text-sm text-zinc-200">{title}</span>
                  <span className="block text-xs text-zinc-500">{hint}</span>
                </span>
                <input type="checkbox" checked={!!row[k]}
                  onChange={(e) => set({ [k]: e.target.checked } as Partial<ClientRow>)}
                  className="h-5 w-5 shrink-0 accent-emerald-500" />
              </label>
            ))}
          </div>
        </Card>

        {/* ---- duplicate / merge gate ---- */}
        {dupes.length > 0 && (
          <Card className="border-amber-500/40">
            <p className="mb-1 text-sm font-semibold text-amber-200">This looks like someone already in your log</p>
            <p className="mb-3 text-xs text-zinc-400">Same phone, email, or handle. Merge instead of keeping twins — lists (channels, references, incidents, history) always combine; where the two records disagree, pick which value wins.</p>
            {dupes.map((d) => (
              <div key={d.client.id} className="mb-3 rounded-xl bg-white/[0.04] p-3">
                <p className="text-sm font-semibold text-zinc-100">{d.client.name || d.client.handle || d.client.phone}</p>
                <p className="text-xs text-amber-300">Matched on: {d.matchedOn.map((m) => `${m.kind} ${m.display}`).join(" · ")}</p>
                {(["name", "phone", "email", "handle", "verdict", "notes"] as const).map((f) => {
                  const a = String(d.client[f] ?? "");
                  const b = String(row[f] ?? "");
                  if (!a.trim() || !b.trim() || a === b) return null;
                  return (
                    <div key={f} className="mt-2 flex items-center gap-2 text-xs">
                      <span className="w-14 shrink-0 capitalize text-zinc-500">{f}</span>
                      <button onClick={() => setMergePicks((p) => ({ ...p, [f]: "keep" }))} className={`flex-1 truncate rounded-lg px-2 py-1.5 text-left ${mergePicks[f] !== "incoming" ? "bg-emerald-500/20 text-emerald-200" : "bg-white/5 text-zinc-400"}`}>Theirs: {a}</button>
                      <button onClick={() => setMergePicks((p) => ({ ...p, [f]: "incoming" }))} className={`flex-1 truncate rounded-lg px-2 py-1.5 text-left ${mergePicks[f] === "incoming" ? "bg-emerald-500/20 text-emerald-200" : "bg-white/5 text-zinc-400"}`}>This one: {b}</button>
                    </div>
                  );
                })}
                <Btn variant="primary" className="mt-3" onClick={() => void doMerge(d)}>Merge into “{d.client.name || "existing record"}”</Btn>
              </div>
            ))}
            <Btn onClick={() => void save(true)}>Save as a separate record anyway</Btn>
          </Card>
        )}

        {/* ---- save bar ---- */}
        <Card>
          {errors.length > 0 && (
            <div className="mb-3 rounded-xl bg-red-500/10 px-3 py-2">
              {errors.map((e) => <p key={e} className="text-sm text-red-300">{e}</p>)}
              <p className="mt-1 text-xs text-zinc-500">That&apos;s the whole list — those two are the only required facts in the entire dossier.</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Btn variant="primary" onClick={() => void save()}>Save record</Btn>
            <Btn onClick={() => set({ lastSeenAt: Date.now() })}>Mark seen today</Btn>
            {row.id && <Btn variant="danger" onClick={() => void remove()}>Delete</Btn>}
          </div>
          {saved && <p className="mt-2 text-sm text-emerald-300">{saved}</p>}
        </Card>
      </div>
    </div>
  );
}

function IncidentAdder(props: { onAdd: (severity: "note" | "caution" | "serious", text: string) => void }) {
  const [text, setText] = useState("");
  const [severity, setSeverity] = useState<"note" | "caution" | "serious">("note");
  return (
    <div className="flex gap-2">
      <select value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)}
        className="w-24 shrink-0 rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-xs text-zinc-100">
        <option value="note">Note</option><option value="caution">Caution</option><option value="serious">Serious</option>
      </select>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Log a flag or incident…"
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600" />
      <button disabled={!text.trim()} onClick={() => { props.onAdd(severity, text.trim()); setText(""); }}
        className="shrink-0 rounded-xl bg-white/10 px-3 text-sm font-semibold text-zinc-100 disabled:opacity-40">Add</button>
    </div>
  );
}
