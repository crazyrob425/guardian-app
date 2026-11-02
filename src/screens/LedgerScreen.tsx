import { useEffect, useMemo, useState } from "react";
import { TopBar, Card, Btn, Field, inputCls } from "../components/ui";
import { db, type LedgerRow } from "../lib/db";
import { money } from "../lib/payments";
import { store } from "../lib/store";

const CUR = () => store.getSettings().defaultCurrency;

const CATS = {
  income: ["Session", "Deposit", "Tip", "Touring", "Other income"],
  expense: ["Hotel / incall", "Travel", "Ads", "Supplies", "Outfit", "Food", "Other expense"],
  mileage: ["To booking", "Touring", "Errands", "Other drive"],
};

/**
 * On-device earnings ledger (Phase 5). Income, expenses and mileage that
 * never leave the phone — with a CSV export for tax time. No account, no
 * cloud bookkeeping that could out her or be subpoenaed from a server.
 */
export default function LedgerScreen(props: { onBack: () => void }) {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [kind, setKind] = useState<LedgerRow["kind"]>("income");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(CATS.income[0]);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");

  const reload = async () => setRows(await db.ledger.orderBy("ts").reverse().toArray());
  useEffect(() => { void reload(); }, []);

  const month = useMemo(() => {
    const now = new Date();
    const mine = rows.filter((r) => {
      const d = new Date(r.ts);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    return {
      income: mine.filter((r) => r.kind === "income").reduce((a, r) => a + r.amount, 0),
      expenses: mine.filter((r) => r.kind === "expense").reduce((a, r) => a + r.amount, 0),
      miles: mine.filter((r) => r.kind === "mileage").reduce((a, r) => a + r.amount, 0),
    };
  }, [rows]);

  const add = async () => {
    const n = parseFloat(amount);
    if (!n || n <= 0) { setMsg("Enter an amount."); return; }
    await db.ledger.add({ ts: Date.now(), kind, amount: n, category, note: note.trim() });
    setAmount(""); setNote(""); setMsg("Logged — on this device only.");
    setTimeout(() => setMsg(""), 2500);
    void reload();
  };

  const exportCsv = () => {
    const head = "date,type,amount,category,note\n";
    const body = rows.slice().reverse().map((r) =>
      [new Date(r.ts).toISOString(), r.kind, r.amount.toFixed(2), `"${r.category.replace(/"/g, '""')}"`, `"${r.note.replace(/"/g, '""')}"`].join(",")
    ).join("\n");
    const url = URL.createObjectURL(new Blob([head + body], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `guardian-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  return (
    <div className="min-h-dvh pb-10">
      <TopBar title="Earnings log" onBack={props.onBack} />
      <div className="mx-auto max-w-lg space-y-4 px-4 py-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Card className="!p-3"><p className="text-xs uppercase tracking-widest text-zinc-500">Income (mo)</p><p className="mt-1 text-lg font-bold text-emerald-300">{money(month.income, CUR())}</p></Card>
          <Card className="!p-3"><p className="text-xs uppercase tracking-widest text-zinc-500">Expenses</p><p className="mt-1 text-lg font-bold text-red-300">{money(month.expenses, CUR())}</p></Card>
          <Card className="!p-3"><p className="text-xs uppercase tracking-widest text-zinc-500">Net</p><p className="mt-1 text-lg font-bold text-zinc-100">{money(month.income - month.expenses, CUR())}</p></Card>
        </div>
        <p className="text-center text-xs text-zinc-600">{month.miles.toFixed(1)} miles logged this month · everything stays on this phone</p>

        <Card className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {(["income", "expense", "mileage"] as const).map((k) => (
              <button key={k} onClick={() => { setKind(k); setCategory(CATS[k][0]); }}
                className={`rounded-xl px-2 py-2 text-sm font-semibold capitalize ${kind === k ? "bg-emerald-500/20 text-emerald-300 ring-2 ring-emerald-400/40" : "bg-white/5 text-zinc-400"}`}>{k}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <Field label={kind === "mileage" ? "Miles" : "Amount"}>
                <input className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder={kind === "mileage" ? "12.5" : "200"} />
              </Field>
            </div>
            <div className="flex-1">
              <Field label="Category">
                <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATS[kind].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </div>
          </div>
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional — e.g. regular, downtown)" />
          <Btn variant="primary" onClick={() => void add()}>Add entry</Btn>
          {msg && <p className="text-sm text-emerald-300">{msg}</p>}
        </Card>

        <Btn onClick={exportCsv}>⬇ Export CSV (for taxes)</Btn>

        <div className="space-y-2">
          {rows.slice(0, 40).map((r) => (
            <Card key={r.id} className="!p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-200">{r.category}{r.note ? ` — ${r.note}` : ""}</p>
                  <p className="text-xs text-zinc-600">{new Date(r.ts).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`font-bold ${r.kind === "income" ? "text-emerald-300" : r.kind === "expense" ? "text-red-300" : "text-sky-300"}`}>
                    {r.kind === "mileage" ? `${r.amount} mi` : money(r.amount, CUR())}
                  </span>
                  <button onClick={async () => { if (r.id) { await db.ledger.delete(r.id); void reload(); } }} className="text-zinc-600 hover:text-red-300" aria-label="Delete entry">✕</button>
                </div>
              </div>
            </Card>
          ))}
          {rows.length === 0 && <p className="py-4 text-center text-sm text-zinc-600">No entries yet. Log the deposit when it lands — future tax-you says thanks.</p>}
        </div>
      </div>
    </div>
  );
}
