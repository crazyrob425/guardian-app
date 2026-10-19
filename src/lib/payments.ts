// Payments: crypto via BTCPay Server (self-hosted, no middleman), cards via a
// Stripe payment link created in the Stripe dashboard. Demo mode otherwise.

import type { Settings } from "./store";

export interface Invoice {
  id: string;
  checkoutLink: string;
  address?: string;
  amount: string;
  currency: string;
  demo: boolean;
}

/** Create a BTCPay Server invoice. Throws with a clear message on failure. */
export async function createBtcPayInvoice(
  s: Settings,
  amount: number,
  currency: string,
  label: string
): Promise<Invoice> {
  if (!s.btcpayUrl || !s.btcpayApiKey || !s.btcpayStoreId) {
    throw new Error("NOT_CONFIGURED");
  }
  const res = await fetch(
    `${s.btcpayUrl.replace(/\/$/, "")}/api/v1/stores/${encodeURIComponent(s.btcpayStoreId)}/invoices`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `token ${s.btcpayApiKey}`,
      },
      body: JSON.stringify({
        amount: amount.toFixed(2),
        currency,
        metadata: { orderId: `guardian-${Date.now()}`, itemDesc: label },
        checkout: { redirectURL: "" },
      }),
    }
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`BTCPay error ${res.status}: ${t.slice(0, 160)}`);
  }
  const j = await res.json();
  return {
    id: j.id,
    checkoutLink: j.checkoutLink,
    amount: String(j.amount ?? amount),
    currency: j.currency ?? currency,
    demo: false,
  };
}

/** Card payments: open the provider's pre-made Stripe payment link. */
export function stripeLink(s: Settings): string | null {
  return s.stripePaymentLink.trim() || null;
}

export function demoInvoice(amount: number, currency: string, label: string): Invoice {
  return {
    id: `demo-${Date.now()}`,
    checkoutLink: "",
    amount: amount.toFixed(2),
    currency,
    demo: true,
  };
}

export function money(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}
