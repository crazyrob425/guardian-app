// Phone share menu (Web Share API) + explicit share targets.
//
// The phone's native share sheet is the free "notification system" nobody
// has to sign up for: the provider's own SMS app, Messenger, WhatsApp,
// email — whatever SHE already uses — carries the watch/client link.
// navigator.share() opens that sheet on Android Chrome + iOS Safari.
// Where it's unavailable (desktop, some browsers), the ShareSheet
// component offers the same destinations as direct links.

export interface SharePayload {
  title: string;
  text: string;
  url: string;
}

export type ShareOutcome = "shared" | "cancelled" | "fallback";

export async function shareLink(p: SharePayload): Promise<ShareOutcome> {
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (typeof nav.share === "function") {
    try {
      await nav.share({ title: p.title, text: p.text, url: p.url });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      return "fallback";
    }
  }
  return "fallback";
}

export interface ShareTarget {
  id: string;
  label: string;
  icon: string;
  href?: string; // direct link target
  action?: "copy" | "messenger"; // special handling in the sheet
}

export function shareTargets(p: SharePayload): ShareTarget[] {
  const full = `${p.text} ${p.url}`;
  const enc = encodeURIComponent;
  return [
    { id: "sms", label: "Text message (SMS)", icon: "💬", href: `sms:?&body=${enc(full)}` },
    { id: "whatsapp", label: "WhatsApp", icon: "🟢", href: `https://wa.me/?text=${enc(full)}` },
    { id: "telegram", label: "Telegram", icon: "✈️", href: `https://t.me/share/url?url=${enc(p.url)}&text=${enc(p.text)}` },
    { id: "email", label: "Email", icon: "✉️", href: `mailto:?subject=${enc(p.title)}&body=${enc(full)}` },
    { id: "messenger", label: "Messenger (copy + open)", icon: "🔵", action: "messenger" },
    { id: "copy", label: "Copy link", icon: "📋", action: "copy" },
  ];
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      window.prompt("Copy this link:", text);
      return true;
    } catch {
      return false;
    }
  }
}
