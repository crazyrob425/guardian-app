import { useState } from "react";
import { shareTargets, copyText, type SharePayload } from "../lib/share";

/**
 * Fallback share sheet — shown where navigator.share() doesn't exist.
 * Same destinations the phone's share menu would offer: SMS, WhatsApp,
 * Telegram, email, Messenger (copy + open), and plain copy.
 */
export default function ShareSheet(props: { payload: SharePayload; onClose: () => void }) {
  const [done, setDone] = useState("");
  const targets = shareTargets(props.payload);

  const act = async (t: (typeof targets)[number]) => {
    if (t.action === "copy") {
      await copyText(props.payload.url);
      setDone("Link copied.");
      setTimeout(props.onClose, 900);
      return;
    }
    if (t.action === "messenger") {
      // Messenger has no reliable web share intent — copy, then open it.
      await copyText(`${props.payload.text} ${props.payload.url}`);
      window.open("https://www.messenger.com/", "_blank");
      setDone("Link copied — paste it into your Messenger chat.");
      setTimeout(props.onClose, 1400);
      return;
    }
    if (t.href) window.location.href = t.href;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={props.onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#101018] p-5" onClick={(e) => e.stopPropagation()}>
        <p className="mb-1 text-base font-bold text-zinc-100">Share via…</p>
        <p className="mb-4 break-all text-xs text-zinc-500">{props.payload.url}</p>
        <div className="space-y-2">
          {targets.map((t) => (
            <button
              key={t.id}
              onClick={() => act(t)}
              className="flex w-full items-center gap-3 rounded-xl bg-white/5 px-4 py-3 text-left text-base text-zinc-100 transition hover:bg-white/10 active:scale-[0.99]"
            >
              <span className="text-xl">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        {done && <p className="mt-3 text-center text-sm text-emerald-300">{done}</p>}
        <button onClick={props.onClose} className="mt-4 w-full rounded-xl px-4 py-3 text-sm text-zinc-400 hover:bg-white/5">
          Cancel
        </button>
      </div>
    </div>
  );
}
