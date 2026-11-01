// SMS alerts via the Cloudflare Worker relay (see worker/sms-relay.js).
// Twilio has no browser CORS support, so the app never talks to Twilio
// directly. Without a relay URL configured, alerts run in demo mode
// (logged on-screen) — the rest of the app works fully.

import type { Settings } from "./store";

export interface SmsResult {
  ok: boolean;
  demo: boolean;
  detail: string;
}

export async function sendSms(s: Settings, to: string, body: string): Promise<SmsResult> {
  if (!s.twilioWorkerUrl) {
    console.log(`[Guardian SMS demo] to ${to}: ${body}`);
    return { ok: true, demo: true, detail: "Demo mode — configure the SMS relay in Settings to send real texts." };
  }
  const res = await fetch(s.twilioWorkerUrl.replace(/\/$/, ""), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, body }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`SMS relay failed (${res.status}): ${t.slice(0, 120)}`);
  }
  return { ok: true, demo: false, detail: "Sent." };
}

/** Alert every circle member. Returns per-member results; never throws. */
export async function alertCircle(
  s: Settings,
  members: { name: string; phone: string }[],
  body: string
): Promise<{ name: string; phone: string; result: SmsResult | { ok: false; demo: false; detail: string } }[]> {
  const out: { name: string; phone: string; result: SmsResult | { ok: false; demo: false; detail: string } }[] = [];
  for (const m of members) {
    if (!m.phone?.trim()) {
      out.push({ name: m.name, phone: m.phone, result: { ok: true, demo: true, detail: "No phone on file — reached via push / shared watch link instead." } });
      continue;
    }
    try {
      const result = await sendSms(s, m.phone, body);
      out.push({ name: m.name, phone: m.phone, result });
    } catch (e) {
      out.push({ name: m.name, phone: m.phone, result: { ok: false, demo: false, detail: e instanceof Error ? e.message : String(e) } });
    }
  }
  return out;
}
