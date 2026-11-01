// Free push alerts via ntfy (https://ntfy.sh) — no account, no cost.
//
// How it works: the provider generates a random, unguessable topic once.
// Her circle subscribes to that topic in the free ntfy app (or in a
// browser at ntfy.sh/<topic>) ONE time. On panic / duress / missed
// check-out, Guardian POSTs a short, content-free ping to the topic:
// no location, no watch link, no names beyond her chosen display alias —
// just "GUARDIAN ALERT — open your saved watch link NOW". The actual
// live location/video stays inside the end-to-end encrypted session.
//
// Publishing uses query params + a plain-text body and mode:"no-cors",
// so the browser never hits a CORS preflight; delivery is fire-and-forget
// by design (the encrypted sync channel + siren are the primary path).
//
// Self-hosters can point Settings at their own ntfy server instead.

import type { Settings } from "./store";
import { randomId } from "./crypto";

export function ntfyConfigured(s: Settings): boolean {
  return !!s.ntfyTopic.trim();
}

export function genTopic(): string {
  return `guardian-${randomId(16).toLowerCase()}`;
}

export function subscribeUrl(s: Settings): string {
  const server = (s.ntfyServer || "https://ntfy.sh").replace(/\/$/, "");
  return `${server}/${s.ntfyTopic.trim()}`;
}

/** The text a provider shares ONCE so her circle can subscribe. */
export function circleInviteText(s: Settings): string {
  const who = s.displayName || "I";
  return (
    `You're in my Guardian safety circle. Set up free emergency alerts (2 min, no account):\n` +
    `1) Install the free "ntfy" app, or open ${subscribeUrl(s)} in a browser\n` +
    `2) Subscribe to this topic: ${s.ntfyTopic.trim()}\n` +
    `3) Leave notifications ON for it.\n` +
    `If ${who} ever hit my panic button or miss a safety check-out, your phone will buzz instantly with an alert. ` +
    `My private live watch link comes separately when an appointment starts — never forward it.`
  );
}

export async function sendPush(
  s: Settings,
  opts: { title: string; body: string; priority?: number; tags?: string }
): Promise<boolean> {
  if (!ntfyConfigured(s)) return false;
  const server = (s.ntfyServer || "https://ntfy.sh").replace(/\/$/, "");
  const topic = s.ntfyTopic.trim();
  const qs = new URLSearchParams({
    title: opts.title,
    priority: String(opts.priority ?? 5),
    tags: opts.tags ?? "rotating_light",
  });
  try {
    await fetch(`${server}/${encodeURIComponent(topic)}?${qs.toString()}`, {
      method: "POST",
      body: opts.body,
      mode: "no-cors",
    });
    return true;
  } catch {
    return false;
  }
}

/** Emergency ping — deliberately content-free (see header). */
export async function sendEmergencyPush(s: Settings, label: string): Promise<boolean> {
  const who = s.displayName || "Someone in your safety circle";
  return sendPush(s, {
    title: "🆘 GUARDIAN ALERT",
    body: `${who} — ${label}. Open your saved Guardian watch link NOW and check on them.`,
    priority: 5,
    tags: "rotating_light,sos",
  });
}
