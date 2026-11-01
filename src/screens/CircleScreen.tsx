import { useState } from "react";
import { TopBar, Card, Btn, Field, inputCls } from "../components/ui";
import { store, type CircleMember } from "../lib/store";
import { randomId } from "../lib/crypto";
import { circleInviteText, ntfyConfigured } from "../lib/notify";
import { shareLink, type SharePayload } from "../lib/share";
import ShareSheet from "../components/ShareSheet";

export default function CircleScreen(props: { onBack: () => void }) {
  const [circle, setCircle] = useState<CircleMember[]>(store.getCircle());
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState("");
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);
  const settings = store.getSettings();

  const shareInvite = async () => {
    const p: SharePayload = {
      title: "Join my Guardian safety circle",
      text: circleInviteText(settings),
      url: (settings.ntfyServer || "https://ntfy.sh").replace(/\/$/, "") + "/" + settings.ntfyTopic.trim(),
    };
    const r = await shareLink(p);
    if (r === "fallback") setSharePayload(p);
  };

  const save = (c: CircleMember[]) => {
    setCircle(c);
    store.saveCircle(c);
  };

  const add = () => {
    if (!name.trim()) { setErr("Name is required (phone is optional)."); return; }
    if (phone.trim()) {
      const digits = phone.replace(/\D/g, "");
      if (digits.length < 7) { setErr("That phone number looks incomplete."); return; }
    }
    save([...circle, { id: randomId(8), name: name.trim(), phone: phone.trim() }]);
    setName(""); setPhone(""); setErr("");
  };

  const remove = (id: string) => save(circle.filter((m) => m.id !== id));

  return (
    <div className="min-h-dvh">
      <TopBar title="Safety circle" onBack={props.onBack} />
      <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
        <p className="text-sm text-zinc-400">
          The people who watch your back — panic button, missed check-ins, silent duress signals. Three free ways they get alerted:
          the watch link you share when a date starts (your own texts / Messenger / WhatsApp), free ntfy push alerts if you've set up a topic in Settings,
          and optional SMS if you've wired a Twilio relay. Add at least one person you trust with your life.
        </p>
        {ntfyConfigured(settings) ? (
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <p className="mb-2 text-sm font-semibold text-emerald-200">🔔 Free push alerts are ON</p>
            <p className="mb-3 text-sm text-emerald-100/70">Send your circle the one-time subscribe invite — after that, emergencies buzz their phones automatically, no Twilio needed.</p>
            <Btn variant="emerald" onClick={shareInvite}>📤 Share circle invite</Btn>
          </Card>
        ) : (
          <Card className="border-white/10">
            <p className="text-sm text-zinc-400">Tip: turn on <span className="text-zinc-200 font-semibold">free push alerts</span> in Settings (ntfy) so emergencies buzz your circle's phones even when the watch page is closed — no Twilio account needed.</p>
          </Card>
        )}
        {circle.length === 0 && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <p className="text-sm text-amber-200">No one in your circle yet. Alerts have nowhere to go — add someone now.</p>
          </Card>
        )}
        {circle.map((m) => (
          <Card key={m.id} className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-zinc-100">{m.name}</p>
              <p className="text-sm text-zinc-400">{m.phone || "Push / shared link alerts"}</p>
            </div>
            <button onClick={() => remove(m.id)} className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">Remove</button>
          </Card>
        ))}
        <Card>
          <div className="space-y-3">
            <Field label="Name">
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maya" />
            </Field>
            <Field label="Phone (optional SMS alerts)" hint="Include country code, e.g. +1… Only used if you wire the optional Twilio SMS relay.">
              <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+15551234567" inputMode="tel" />
            </Field>
            {err && <p className="text-sm text-red-400">{err}</p>}
            <Btn variant="primary" onClick={add}>Add to circle</Btn>
          </div>
        </Card>
        <p className="text-xs text-zinc-600">
          Alerts are discreet — they say "Guardian alert" with a tracking link, never what you do or who you're with.
        </p>
        {sharePayload && <ShareSheet payload={sharePayload} onClose={() => setSharePayload(null)} />}
      </div>
    </div>
  );
}
