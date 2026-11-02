import { useEffect, useRef, useState } from "react";
import { TopBar, Card, Btn } from "../components/ui";
import { db, type VaultRow } from "../lib/db";

/**
 * Evidence vault (Phase 5): screenshots, booking confirmations, anything
 * she may need later — stored as blobs in this device's database only.
 * Nothing uploads, ever. Includes a session-journal export (her own
 * on-device trail + diagnostics as a JSON file she controls).
 */
export default function VaultScreen(props: { onBack: () => void }) {
  const [rows, setRows] = useState<VaultRow[]>([]);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = async () => setRows(await db.vault.orderBy("ts").reverse().toArray());
  useEffect(() => { void reload(); }, []);

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      await db.vault.add({ ts: Date.now(), name: f.name || "evidence", kind: f.type || "application/octet-stream", size: f.size, blob: f });
    }
    setMsg(`${files.length} file(s) stored — on this device only.`);
    setTimeout(() => setMsg(""), 3000);
    void reload();
  };

  const open = (r: VaultRow) => {
    const url = URL.createObjectURL(r.blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const exportJournal = async () => {
    const [trail, diagnostics] = await Promise.all([db.trail.toArray(), db.diagnostics.toArray()]);
    const data = JSON.stringify({ exportedAt: new Date().toISOString(), trail, diagnostics }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `guardian-journal-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const totalKb = rows.reduce((a, r) => a + r.size, 0) / 1024;

  return (
    <div className="min-h-dvh pb-10">
      <TopBar title="Evidence vault" onBack={props.onBack} />
      <div className="mx-auto max-w-lg space-y-4 px-4 py-4">
        <Card>
          <p className="mb-3 text-sm text-zinc-300">Booking screenshots, messages, receipts — kept <strong>only on this phone</strong>, ready if you ever need them. Nothing here uploads anywhere.</p>
          <Btn variant="primary" onClick={() => fileRef.current?.click()}>+ Add files</Btn>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
          {msg && <p className="mt-2 text-sm text-emerald-300">{msg}</p>}
          <p className="mt-2 text-xs text-zinc-600">{rows.length} file(s) · {totalKb < 1024 ? `${totalKb.toFixed(0)} KB` : `${(totalKb / 1024).toFixed(1)} MB`} on device</p>
        </Card>

        <Btn onClick={() => void exportJournal()}>⬇ Export session journal (JSON)</Btn>

        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.id} className="!p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-200">{r.kind.startsWith("image/") ? "🖼 " : "📄 "}{r.name}</p>
                  <p className="text-xs text-zinc-600">{new Date(r.ts).toLocaleString()} · {(r.size / 1024).toFixed(0)} KB</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Btn className="!w-auto !px-4" onClick={() => open(r)}>Open</Btn>
                  <Btn className="!w-auto !px-4" variant="danger" onClick={async () => { if (r.id && window.confirm("Delete this file from the vault?")) { await db.vault.delete(r.id); void reload(); } }}>Delete</Btn>
                </div>
              </div>
            </Card>
          ))}
          {rows.length === 0 && <p className="py-4 text-center text-sm text-zinc-600">Vault is empty. The screenshot of that booking chat? It belongs here, not in a cloud photo roll.</p>}
        </div>
      </div>
    </div>
  );
}
