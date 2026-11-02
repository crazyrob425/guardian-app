import { useEffect, useRef, useState } from "react";
import { TopBar, Card, Btn } from "../components/ui";
import { db, type ClientRow, type ClientVerdict } from "../lib/db";
import { phoneIntel, emailIntel, extractIdentifiers, SCREENING_CHECKS } from "../lib/screening";

const VERDICTS: { id: ClientVerdict; label: string; cls: string }[] = [
  { id: "ok", label: "OK", cls: "bg-emerald-500/15 text-emerald-300" },
  { id: "caution", label: "Caution", cls: "bg-amber-500/15 text-amber-300" },
  { id: "avoid", label: "Avoid", cls: "bg-red-500/15 text-red-300" },
  { id: "unknown", label: "Unscreened", cls: "bg-white/10 text-zinc-300" },
];

/**
 * Private client log + screening pack (Phase 2). Everything lives ONLY in
 * this device's database — never synced, never uploaded. Screening hints
 * (VoIP, disposable email) are computed on-device and worded as hints.
 */
export default function ClientsScreen(props: { onBack: () => void }) {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "regulars" | "avoid">("all");
  const [editing, setEditing] = useState<ClientRow | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    const rows = await db.clients.orderBy("updatedAt").reverse().toArray();
    setClients(rows);
  };
  useEffect(() => { void reload(); }, []);

  const filtered = clients.filter((c) => {
    if (filter === "regulars" && !c.regular) return false;
    if (filter === "avoid" && c.verdict !== "avoid") return false;
    const needle = q.replace(/\D/g, "");
    return (
      c.name.toLowerCase().includes(q.toLowerCase()) ||
      c.handle.toLowerCase().includes(q.toLowerCase()) ||
      (needle.length >= 3 && c.phone.replace(/\D/g, "").includes(needle)) ||
      c.email.toLowerCase().includes(q.toLowerCase())
    );
  });

  const newClient = () => setEditing({
    name: "", phone: "", phoneE164: "", email: "", handle: "",
    verdict: "unknown", flags: [], checks: {}, notes: "",
    createdAt: Date.now(), updatedAt: Date.now(), lastSeenAt: null,
  });

  /** OCR a screenshot on demand (tesseract.js lazy-loaded from CDN; the image never uploads). */
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
      const ids = extractIdentifiers(res.data.text);
      if (!ids.phones.length && !ids.emails.length) {
        setScanMsg("No phone number or email found in that screenshot.");
        return;
      }
      const base = editing ?? {
        name: "", phone: "", phoneE164: "", email: "", handle: "",
        verdict: "unknown" as ClientVerdict, flags: [], checks: {}, notes: "",
        createdAt: Date.now(), updatedAt: Date.now(), lastSeenAt: null,
      };
      setEditing({
        ...base,
        phone: base.phone || ids.phones[0] || "",
        email: base.email || ids.emails[0] || "",
      });
      setScanMsg(`Found ${ids.phones.length} number(s), ${ids.emails.length} email(s) — filled in below. Check them before saving.`);
    } catch (e) {
      setScanMsg(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  if (editing) {
    return <ClientEditor row={editing} scanning={scanning} scanMsg={scanMsg}
      onScan={(f) => void scanScreenshot(f)}
      onClose={() => { setEditing(null); setScanMsg(""); void reload(); }} />;
  }

  return (
    <div className="min-h-dvh pb-10">
      <TopBar title="Client log" onBack={props.onBack} />
      <div className="mx-auto max-w-lg space-y-4 px-4 py-4">
        <Card>
          <p className="mb-2 text-sm text-zinc-300">Your private screening log. It lives <strong>only on this phone</strong> — never uploaded, never synced, never shared. Checks you run here are not logged anywhere.</p>
          <div className="mb-2 grid grid-cols-3 gap-2">
            {(["all", "regulars", "avoid"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`rounded-xl px-2 py-1.5 text-xs font-semibold ${filter === f ? "bg-emerald-500/20 text-emerald-300" : "bg-white/5 text-zinc-400"}`}>{f === "all" ? "All" : f === "regulars" ? "⭐ Regulars" : "🚫 Avoid"}</button>
            ))}
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, handle, email, or number…"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Btn variant="primary" onClick={newClient}>+ Add client</Btn>
            <Btn onClick={() => fileRef.current?.click()} disabled={scanning}>{scanning ? "Scanning…" : "📷 Scan a screenshot"}</Btn>
          </div>
          {scanMsg && <p className="mt-2 text-xs text-amber-300">{scanMsg}</p>}
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void scanScreenshot(f); e.target.value = ""; }} />
        </Card>

        {filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-zinc-600">{clients.length ? "No matches." : "No clients logged yet. Add one before a date and run the checklist — future you says thanks."}</p>
        )}
        {filtered.map((c) => {
          const v = VERDICTS.find((x) => x.id === c.verdict) ?? VERDICTS[3];
          const doneChecks = SCREENING_CHECKS.filter((k) => c.checks[k.id]).length;
          return (
            <button key={c.id} onClick={() => setEditing(c)} className="w-full text-left">
              <Card className="transition hover:border-white/25">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-zinc-100">{c.regular ? "⭐ " : ""}{c.name || c.handle || c.phone || "Unnamed"}</p>
                    <p className="truncate text-xs text-zinc-500">{[c.phone, c.handle && `@${c.handle}`, c.email].filter(Boolean).join(" · ")}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${v.cls}`}>{v.label}</span>
                </div>
                <p className="mt-1.5 text-xs text-zinc-600">Screening {doneChecks}/{SCREENING_CHECKS.length}{c.flags.length ? ` · ⚑ ${c.flags.length} hint${c.flags.length === 1 ? "" : "s"}` : ""}{c.lastSeenAt ? ` · last seen ${new Date(c.lastSeenAt).toLocaleDateString()}` : ""}{(c.noShows ?? 0) > 0 ? ` · ${c.noShows} no-show${(c.noShows ?? 0) > 1 ? "s" : ""}` : ""}</p>
              </Card>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ClientEditor(props: {
  row: ClientRow;
  scanning: boolean;
  scanMsg: string;
  onScan: (f: File) => void;
  onClose: () => void;
}) {
  const [row, setRow] = useState<ClientRow>(props.row);
  const [saved, setSaved] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const phone = phoneIntel(row.phone);
  const email = emailIntel(row.email);
  const set = (patch: Partial<ClientRow>) => setRow((r) => ({ ...r, ...patch }));

  const save = async () => {
    const flags = Array.from(new Set([...phone.flags, ...email.flags]));
    const out: ClientRow = { ...row, phoneE164: phone.e164, flags, updatedAt: Date.now() };
    if (out.id) await db.clients.put(out);
    else out.id = await db.clients.add(out);
    setRow(out);
    setSaved("Saved — on this device only.");
    setTimeout(() => setSaved(""), 2500);
  };

  const remove = async () => {
    if (row.id && window.confirm("Delete this client record from this device? This cannot be undone.")) {
      await db.clients.delete(row.id);
      props.onClose();
    }
  };

  const input = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600";
  const label = "mb-1 block text-xs uppercase tracking-widest text-zinc-500";

  return (
    <div className="min-h-dvh pb-10">
      <TopBar title={row.id ? "Client record" : "New client"} onBack={props.onClose} />
      <div className="mx-auto max-w-lg space-y-4 px-4 py-4">
        <Card>
          <div className="space-y-3">
            <div><label className={label}>Name</label>
              <input className={input} value={row.name} onChange={(e) => set({ name: e.target.value })} placeholder="Real name (from screening)" /></div>
            <div><label className={label}>Phone</label>
              <input className={input} value={row.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+1 555 123 4567" inputMode="tel" />
              {row.phone && (
                <p className="mt-1 text-xs text-zinc-500">
                  {phone.valid ? `${phone.e164} · ${phone.country} · ${phone.typeLabel}` : "Not a recognized number yet"}
                </p>
              )}
              {phone.flags.map((f) => <p key={f} className="mt-1 text-xs text-amber-300">⚑ {f}</p>)}
            </div>
            <div><label className={label}>Email</label>
              <input className={input} value={row.email} onChange={(e) => set({ email: e.target.value })} placeholder="name@example.com" inputMode="email" />
              {email.flags.map((f) => <p key={f} className="mt-1 text-xs text-amber-300">⚑ {f}</p>)}
            </div>
            <div><label className={label}>Booking handle / username</label>
              <input className={input} value={row.handle} onChange={(e) => set({ handle: e.target.value })} placeholder="Where they booked from" /></div>
            <div><label className={label}>Verdict</label>
              <div className="grid grid-cols-4 gap-2">
                {VERDICTS.map((v) => (
                  <button key={v.id} onClick={() => set({ verdict: v.id })}
                    className={`rounded-xl px-2 py-2 text-xs font-bold ${row.verdict === v.id ? v.cls + " ring-2 ring-white/40" : "bg-white/5 text-zinc-400"}`}>{v.label}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Btn className="!w-auto !px-4" onClick={() => fileRef.current?.click()} disabled={props.scanning}>
              {props.scanning ? "Scanning…" : "📷 Fill from screenshot"}
            </Btn>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) props.onScan(f); e.target.value = ""; }} />
          </div>
          {props.scanMsg && <p className="mt-2 text-xs text-amber-300">{props.scanMsg}</p>}
        </Card>

        <Card>
          <p className="mb-2 text-xs uppercase tracking-widest text-zinc-500">Screening checklist</p>
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
        </Card>

        <Card>
          <p className="mb-2 text-xs uppercase tracking-widest text-zinc-500">Regulars book</p>
          <label className="flex cursor-pointer items-center gap-3 text-sm text-zinc-300">
            <input type="checkbox" checked={!!row.regular} onChange={(e) => set({ regular: e.target.checked })} className="h-5 w-5 accent-emerald-500" />
            ⭐ This is a regular
          </label>
          <p className="mb-1 mt-3 text-xs text-zinc-500">Permission to re-contact them?</p>
          <div className="grid grid-cols-3 gap-2">
            {(["unknown", "yes", "no"] as const).map((v) => (
              <button key={v} onClick={() => set({ rebook: v })} className={`rounded-xl px-2 py-2 text-xs font-bold ${(row.rebook ?? "unknown") === v ? "bg-emerald-500/20 text-emerald-300 ring-2 ring-emerald-400/40" : "bg-white/5 text-zinc-400"}`}>{v === "unknown" ? "Not asked" : v === "yes" ? "Yes — ask me" : "Never"}</button>
            ))}
          </div>
          <p className="mb-1 mt-3 text-xs text-zinc-500">Follow-up flow — deniable, permission-based. Tap to copy, send it yourself, and stamp it done.</p>
          <div className="space-y-2">
            {([
              ["thanks", "1 · Thank-you", `Hi ${row.name || "there"} — thank you for a lovely time. I really enjoyed meeting you. 💋`],
              ["review", "2 · Review ask", "If you had a good time, a kind word where you found me helps me more than you know. No pressure at all."],
              ["recontact", "3 · Re-invite", "I'll be around this week if you'd like to do that again sometime. No worries either way."],
            ] as const).map(([k, label2, text]) => (
              <div key={k} className="flex items-center justify-between gap-2">
                <span className="text-sm text-zinc-300">{label2}{row.followUps?.[k] ? <span className="ml-2 text-xs text-emerald-300">✓ {new Date(row.followUps[k]!).toLocaleDateString()}</span> : ""}</span>
                <button onClick={async () => { try { await navigator.clipboard.writeText(text); } catch { /* noop */ } set({ followUps: { ...(row.followUps ?? {}), [k]: Date.now() } }); }} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-100">Copy + stamp</button>
              </div>
            ))}
          </div>
          {(row.noShows ?? 0) > 0 && <p className="mt-3 text-xs text-amber-300">⚑ {row.noShows} no-show(s) on record.</p>}
        </Card>

        <Card>
          <label className={label}>Private notes</label>
          <textarea className={input + " min-h-24"} value={row.notes} onChange={(e) => set({ notes: e.target.value })}
            placeholder="Preferences, boundaries, how the date went, anything future-you needs. Never leaves this phone." />
          <div className="mt-3 flex flex-wrap gap-2">
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
