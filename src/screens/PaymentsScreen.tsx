import { useState } from "react";
import { TopBar, Card, Btn, Field, inputCls } from "../components/ui";
import { store } from "../lib/store";
import { createBtcPayInvoice, stripeLink, demoInvoice, money, type Invoice } from "../lib/payments";
import Qr from "../components/Qr";

const LABELS = ["Deposit", "Tribute", "Full rate", "Custom"];

export default function PaymentsScreen(props: { onBack: () => void }) {
  const settings = store.getSettings();
  const [amount, setAmount] = useState("200");
  const [label, setLabel] = useState("Deposit");
  const [custom, setCustom] = useState("");
  const [method, setMethod] = useState<"crypto" | "card">("crypto");
  const [busy, setBusy] = useState(false);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [err, setErr] = useState("");

  const desc = label === "Custom" ? custom.trim() || "Payment" : label;

  const request = async () => {
    const n = parseFloat(amount);
    if (!n || n <= 0) { setErr("Enter an amount."); return; }
    setErr(""); setBusy(true); setInvoice(null);
    try {
      if (method === "crypto") {
        try {
          const inv = await createBtcPayInvoice(settings, n, settings.defaultCurrency, desc);
          setInvoice(inv);
        } catch (e) {
          if (e instanceof Error && e.message === "NOT_CONFIGURED") {
            setInvoice(demoInvoice(n, settings.defaultCurrency, desc));
            setErr("BTCPay not configured — demo preview. Add your server in Settings to take real crypto.");
          } else throw e;
        }
      } else {
        const link = stripeLink(settings);
        if (!link) { setErr("No Stripe payment link in Settings — paste one to take cards."); }
        else window.open(link, "_blank", "noopener");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (t: string) => {
    try { await navigator.clipboard.writeText(t); } catch { window.prompt("Copy:", t); }
  };

  return (
    <div className="min-h-dvh">
      <TopBar title="Request payment" onBack={props.onBack} />
      <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-1.5">
          {(["crypto", "card"] as const).map((m) => (
            <button key={m} onClick={() => { setMethod(m); setInvoice(null); setErr(""); }}
              className={`rounded-xl py-2.5 text-sm font-semibold ${method === m ? "bg-emerald-500 text-black" : "text-zinc-400"}`}>
              {m === "crypto" ? "Crypto" : "Card"}
            </button>
          ))}
        </div>

        <Card className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <Field label="Amount">
                <input className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
              </Field>
            </div>
            <div className="w-24">
              <Field label="Cur.">
                <input className={inputCls} value={settings.defaultCurrency} disabled />
              </Field>
            </div>
          </div>
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-zinc-400">For</span>
            <div className="flex flex-wrap gap-2">
              {LABELS.map((l) => (
                <button key={l} onClick={() => setLabel(l)}
                  className={`rounded-full px-4 py-2 text-sm ${label === l ? "bg-emerald-500 font-semibold text-black" : "bg-white/5 text-zinc-300"}`}>{l}</button>
              ))}
            </div>
            {label === "Custom" && (
              <input className={`${inputCls} mt-2`} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. Weekend package" />
            )}
          </div>
          {err && <p className="text-sm text-amber-300">{err}</p>}
          <Btn variant="primary" onClick={request} disabled={busy}>
            {busy ? "Working…" : `Request ${money(parseFloat(amount) || 0, settings.defaultCurrency)}${method === "card" ? " by card" : ""}`}
          </Btn>
          <p className="text-xs text-zinc-500">
            {method === "crypto"
              ? "Crypto goes straight to your wallet via your BTCPay Server — no middleman, no frozen funds."
              : "Cards are processed through your Stripe payment link."}
          </p>
        </Card>

        {invoice && (
          <Card className="border-emerald-500/30">
            <p className="mb-1 text-xs uppercase tracking-widest text-zinc-500">{invoice.demo ? "Demo invoice" : "Invoice ready"}</p>
            <p className="mb-3 text-2xl font-bold text-zinc-100">{money(parseFloat(invoice.amount), invoice.currency)}</p>
            {invoice.demo ? (
              <p className="text-sm text-zinc-400">Connect BTCPay Server in Settings to generate a real payment address + QR.</p>
            ) : (
              <div className="space-y-2">
                <Qr value={invoice.checkoutLink} />
                <p className="text-center text-xs text-zinc-500">Point his camera at the code — opens the secure checkout.</p>
                <Btn variant="primary" onClick={() => window.open(invoice.checkoutLink, "_blank", "noopener")}>Open checkout</Btn>
                <Btn onClick={() => copy(invoice.checkoutLink)}>Copy checkout link</Btn>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
