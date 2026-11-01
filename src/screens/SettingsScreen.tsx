import { useEffect, useRef, useState } from "react";
import { TopBar, Card, Btn, Field, inputCls } from "../components/ui";
import { store, DEFAULT_SETTINGS, type Settings, type AlarmSoundId } from "../lib/store";
import { ALARM_SOUNDS, alarmFileUrl } from "../lib/audio";
import { saveCustomAlarm, loadCustomAlarm, clearCustomAlarm } from "../lib/alarmdb";
import { sha256Hex } from "../lib/crypto";
import { sendSms } from "../lib/sms";
import { genTopic, sendPush, circleInviteText, ntfyConfigured } from "../lib/notify";
import { shareLink, type SharePayload } from "../lib/share";
import ShareSheet from "../components/ShareSheet";

export default function SettingsScreen(props: { onBack: () => void; onChanged: () => void }) {
  const [s, setS] = useState<Settings>(store.getSettings());
  const [pin, setPin] = useState("");
  const [duress, setDuress] = useState("");
  const [saved, setSaved] = useState("");
  const [smsTest, setSmsTest] = useState("");
  const [pushTest, setPushTest] = useState("");
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);
  const [previewing, setPreviewing] = useState<string>("");
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopPreview = () => {
    if (previewRef.current) { try { previewRef.current.pause(); } catch { /* noop */ } previewRef.current = null; }
    if (previewUrlRef.current) { URL.revokeObjectURL(previewUrlRef.current); previewUrlRef.current = null; }
    setPreviewing("");
  };
  useEffect(() => stopPreview, []);

  const playPreview = async (key: string, src: string) => {
    if (previewing === key) { stopPreview(); return; }
    stopPreview();
    const el = new Audio(src);
    el.onended = () => setPreviewing("");
    previewRef.current = el;
    setPreviewing(key);
    try { await el.play(); } catch { setPreviewing(""); }
  };

  const previewCustom = async () => {
    if (previewing === "custom") { stopPreview(); return; }
    const rec = await loadCustomAlarm();
    if (!rec) return;
    previewUrlRef.current = URL.createObjectURL(rec.blob);
    await playPreview("custom", previewUrlRef.current);
  };

  const selectAlarm = (id: AlarmSoundId) => {
    const next = { ...s, alarmSound: id };
    setS(next);
    store.saveSettings(next);
    props.onChanged();
    setSaved("Alarm sound saved.");
    setTimeout(() => setSaved(""), 2000);
  };

  const pickCustomFile = async (f: File | undefined) => {
    if (!f) return;
    await saveCustomAlarm(f);
    const next = { ...s, alarmSound: "custom" as AlarmSoundId, alarmCustomName: f.name };
    setS(next);
    store.saveSettings(next);
    props.onChanged();
    setSaved(`Custom alarm set: ${f.name}`);
    setTimeout(() => setSaved(""), 2500);
  };

  const removeCustom = async () => {
    stopPreview();
    await clearCustomAlarm();
    const next = { ...s, alarmCustomName: "", alarmSound: s.alarmSound === "custom" ? ("police" as AlarmSoundId) : s.alarmSound };
    setS(next);
    store.saveSettings(next);
    props.onChanged();
  };

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => ({ ...p, [k]: v }));

  const save = () => {
    store.saveSettings(s);
    setSaved("Saved.");
    setTimeout(() => setSaved(""), 2000);
    props.onChanged();
  };

  const setPinHash = async (kind: "pinHash" | "duressPinHash", v: string) => {
    if (!v) { set(kind, ""); return; }
    if (v.length < 4) { setSaved("PIN must be 4+ digits."); setTimeout(() => setSaved(""), 2000); return; }
    set(kind, await sha256Hex(v));
    setSaved(kind === "pinHash" ? "Lock PIN set." : "Duress PIN set.");
    setTimeout(() => setSaved(""), 2000);
  };

  const testSms = async () => {
    setSmsTest("Sending…");
    try {
      const r = await sendSms(s, s.twilioFrom || "", "Guardian test — your SMS relay works.");
      setSmsTest(r.demo ? "Demo mode (no relay URL). Saved anyway." : "Test sent!");
    } catch (e) {
      setSmsTest(e instanceof Error ? e.message : "Failed");
    }
  };

  const testPush = async () => {
    store.saveSettings(s);
    setPushTest("Sending…");
    const ok = await sendPush(s, { title: "Guardian test", body: "Your free push alerts work. This is what an emergency ping looks like (real ones say GUARDIAN ALERT).", priority: 4, tags: "white_check_mark" });
    setPushTest(ok ? "Test ping sent — check the device that's subscribed to your topic." : "Set a topic first.");
    setTimeout(() => setPushTest(""), 5000);
  };

  const shareInvite = async () => {
    store.saveSettings(s);
    const p: SharePayload = {
      title: "Join my Guardian safety circle",
      text: circleInviteText(s),
      url: (s.ntfyServer || "https://ntfy.sh").replace(/\/$/, "") + "/" + s.ntfyTopic.trim(),
    };
    const r = await shareLink(p);
    if (r === "fallback") setSharePayload(p);
  };

  const wipe = () => {
    if (window.confirm("Delete ALL Guardian data on this device? This cannot be undone.")) {
      localStorage.clear();
      window.location.hash = "#/";
      window.location.reload();
    }
  };

  return (
    <div className="min-h-dvh">
      <TopBar title="Settings" onBack={props.onBack} right={saved ? <span className="text-sm text-emerald-400">{saved}</span> : undefined} />
      <div className="mx-auto max-w-lg space-y-4 px-4 py-6">

        <Card className="space-y-4">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Profile</p>
          <Field label="Display name (used in alerts to your circle)">
            <input className={inputCls} value={s.displayName} onChange={(e) => set("displayName", e.target.value)} placeholder="e.g. Alex" />
          </Field>
          <label className="flex items-center justify-between">
            <span className="text-sm text-zinc-200">Discreet mode <span className="text-zinc-500">(neutral wording everywhere)</span></span>
            <button onClick={() => set("discreetMode", !s.discreetMode)} className={`relative h-8 w-14 rounded-full ${s.discreetMode ? "bg-emerald-500" : "bg-white/10"}`}>
              <span className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${s.discreetMode ? "left-7" : "left-1"}`} />
            </button>
          </label>
        </Card>

        <Card className="space-y-4">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Lock screen</p>
          <Field label={s.pinHash ? "Change lock PIN (leave blank to remove)" : "Set lock PIN"}>
            <div className="flex gap-2">
              <input className={inputCls} value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" placeholder="4–8 digits" />
              <button onClick={() => { setPinHash("pinHash", pin); setPin(""); }} className="shrink-0 rounded-xl bg-white/10 px-4 text-sm text-zinc-200">Set</button>
            </div>
          </Field>
          <Field label={s.duressPinHash ? "Change duress PIN" : "Set duress PIN"} hint="Unlocks normally but SILENTLY alerts your circle. For when someone forces you to unlock.">
            <div className="flex gap-2">
              <input className={inputCls} value={duress} onChange={(e) => setDuress(e.target.value)} inputMode="numeric" placeholder="Different from lock PIN" />
              <button onClick={() => { setPinHash("duressPinHash", duress); setDuress(""); }} className="shrink-0 rounded-xl bg-white/10 px-4 text-sm text-zinc-200">Set</button>
            </div>
          </Field>
          <p className="rounded-xl border border-red-500/25 bg-red-500/5 px-3 py-2.5 text-xs leading-relaxed text-red-200/80">
            🔒 <span className="font-semibold text-red-200">Panic lock:</span> the moment the panic button fires (or a check-out is missed), the alarm locks to your lock PIN — it can <span className="font-semibold text-red-200">only</span> be silenced by entering that PIN. Nobody can just tap it off. Silencing with the duress PIN stops the sound but silently alerts your circle that you were coerced. {s.pinHash ? "" : "Set a lock PIN above to arm the panic lock — without one, the alarm can be stopped by anyone holding the phone."}
          </p>
        </Card>

        <Card className="space-y-4">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Safety timers</p>
          <Field label="Check-out grace (minutes)">
            <input className={inputCls} value={String(s.checkOutGraceMin)} onChange={(e) => set("checkOutGraceMin", Math.max(1, parseInt(e.target.value) || 5))} inputMode="numeric" />
          </Field>
          <Field label="Arrival alert radius (meters)" hint="How close your guest must be before you get the 'approaching' ping.">
            <input className={inputCls} value={String(s.arrivalRadiusM)} onChange={(e) => set("arrivalRadiusM", Math.max(25, parseInt(e.target.value) || 150))} inputMode="numeric" />
          </Field>
        </Card>

        <Card className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Alarm sound</p>
          <p className="text-sm text-zinc-400">The sound your panic button, missed check-out and SOS blast on loop until you stand down. Tap ▶ to preview — picking one saves it instantly.</p>
          {ALARM_SOUNDS.map((d) => (
            <div key={d.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${s.alarmSound === d.id ? "border-red-500/50 bg-red-500/10" : "border-white/10 bg-white/[0.02]"}`}>
              <button onClick={() => selectAlarm(d.id)} className="flex flex-1 items-center gap-3 text-left">
                <span className={`grid h-5 w-5 flex-none place-items-center rounded-full border ${s.alarmSound === d.id ? "border-red-400" : "border-zinc-600"}`}>
                  {s.alarmSound === d.id && <span className="h-2.5 w-2.5 rounded-full bg-red-400" />}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-zinc-100">{d.name}</span>
                  <span className="block text-xs text-zinc-500">{d.desc}</span>
                </span>
              </button>
              <button onClick={() => playPreview(d.id, alarmFileUrl(d.id))} className="flex-none rounded-lg bg-white/10 px-3 py-2 text-sm text-zinc-100" aria-label={`Preview ${d.name}`}>
                {previewing === d.id ? "⏹ Stop" : "▶ Play"}
              </button>
            </div>
          ))}
          <div className={`rounded-xl border px-3 py-2.5 ${s.alarmSound === "custom" ? "border-red-500/50 bg-red-500/10" : "border-white/10 bg-white/[0.02]"}`}>
            <div className="flex items-center gap-3">
              <button onClick={() => { if (s.alarmCustomName) selectAlarm("custom"); }} className="flex flex-1 items-center gap-3 text-left">
                <span className={`grid h-5 w-5 flex-none place-items-center rounded-full border ${s.alarmSound === "custom" ? "border-red-400" : "border-zinc-600"}`}>
                  {s.alarmSound === "custom" && <span className="h-2.5 w-2.5 rounded-full bg-red-400" />}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-zinc-100">Your Own Sound File</span>
                  <span className="block text-xs text-zinc-500">{s.alarmCustomName ? s.alarmCustomName : "Pick any audio file from this phone — a recording, a song, anything."}</span>
                </span>
              </button>
              {s.alarmCustomName && (
                <button onClick={previewCustom} className="flex-none rounded-lg bg-white/10 px-3 py-2 text-sm text-zinc-100">
                  {previewing === "custom" ? "⏹ Stop" : "▶ Play"}
                </button>
              )}
            </div>
            <div className="mt-2.5 flex gap-2 pl-8">
              <button onClick={() => fileInputRef.current?.click()} className="rounded-lg bg-white/10 px-3 py-2 text-sm text-zinc-100">{s.alarmCustomName ? "Replace file" : "📁 Choose file from phone"}</button>
              {s.alarmCustomName && <button onClick={removeCustom} className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">Remove</button>}
            </div>
            <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={(e) => { pickCustomFile(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
          <p className="text-xs text-zinc-600">Your file stays on this device only (stored in the app, never uploaded). Big files are fine — it just has to live with being loud.</p>
        </Card>

        <Card className="space-y-4">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Sync server</p>
          <Field label="MQTT broker (WebSocket)" hint="Default is a free public broker. Run your own for maximum privacy.">
            <input className={inputCls} value={s.mqttBroker} onChange={(e) => set("mqttBroker", e.target.value)} placeholder="wss://broker.emqx.io:8084/mqtt" />
          </Field>
        </Card>

        <Card className="space-y-4">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Free push alerts (ntfy — no Twilio, no account)</p>
          <p className="text-sm text-zinc-400">
            The free way to buzz your circle's phones even when the watch page is closed. Generate a private topic once,
            share the subscribe invite, and panic / duress / missed check-out events push an instant alert to everyone
            subscribed. The ping itself is content-free — no location, no links — your live details stay in the encrypted watch link.
          </p>
          <Field label="Your private alert topic" hint="Unguessable = private. Anyone who knows the topic can subscribe or post, so treat it like a password.">
            <div className="flex gap-2">
              <input className={inputCls} value={s.ntfyTopic} onChange={(e) => set("ntfyTopic", e.target.value)} placeholder="Tap Generate" />
              <button onClick={() => set("ntfyTopic", genTopic())} className="shrink-0 rounded-xl bg-white/10 px-4 text-sm text-zinc-200">Generate</button>
            </div>
          </Field>
          <Field label="ntfy server" hint="Public free server by default. Self-hosters can use their own.">
            <input className={inputCls} value={s.ntfyServer} onChange={(e) => set("ntfyServer", e.target.value)} placeholder="https://ntfy.sh" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Btn onClick={testPush}>{pushTest || "Send test ping"}</Btn>
            <Btn variant="emerald" onClick={shareInvite} disabled={!ntfyConfigured(s)}>📤 Share circle invite</Btn>
          </div>
          {!ntfyConfigured(s) && <p className="text-xs text-zinc-500">Generate a topic to enable push alerts + the invite.</p>}
        </Card>

        <Card className="space-y-4">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">SMS alerts (optional — Twilio via worker)</p>
          <Field label="Worker relay URL" hint="Deploy worker/sms-relay.js to Cloudflare, paste its URL. Empty = demo mode.">
            <input className={inputCls} value={s.twilioWorkerUrl} onChange={(e) => set("twilioWorkerUrl", e.target.value)} placeholder="https://guardian-sms.you.workers.dev" />
          </Field>
          <Field label="From number (also used for test)">
            <input className={inputCls} value={s.twilioFrom} onChange={(e) => set("twilioFrom", e.target.value)} placeholder="+15551234567" inputMode="tel" />
          </Field>
          <Btn onClick={testSms}>{smsTest || "Send test SMS"}</Btn>
        </Card>

        <Card className="space-y-4">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Payments</p>
          <Field label="BTCPay Server URL" hint="Self-hosted, no KYC, no frozen funds.">
            <input className={inputCls} value={s.btcpayUrl} onChange={(e) => set("btcpayUrl", e.target.value)} placeholder="https://pay.example.com" />
          </Field>
          <Field label="BTCPay API key">
            <input className={inputCls} value={s.btcpayApiKey} onChange={(e) => set("btcpayApiKey", e.target.value)} type="password" placeholder="Paste API key" />
          </Field>
          <Field label="BTCPay store ID">
            <input className={inputCls} value={s.btcpayStoreId} onChange={(e) => set("btcpayStoreId", e.target.value)} placeholder="Store ID" />
          </Field>
          <Field label="Stripe payment link" hint="Create a payment link in your Stripe dashboard and paste it here for card payments.">
            <input className={inputCls} value={s.stripePaymentLink} onChange={(e) => set("stripePaymentLink", e.target.value)} placeholder="https://buy.stripe.com/…" />
          </Field>
          <Field label="Currency">
            <input className={inputCls} value={s.defaultCurrency} onChange={(e) => set("defaultCurrency", e.target.value.toUpperCase())} placeholder="USD" />
          </Field>
        </Card>

        <Btn variant="primary" onClick={save}>Save settings</Btn>
        <Btn variant="ghost" onClick={() => { setS(DEFAULT_SETTINGS); setSaved("Defaults restored — tap Save."); }}>Restore defaults</Btn>
        <button onClick={wipe} className="w-full py-3 text-center text-sm text-red-400/80">Delete all Guardian data on this device</button>
        <div className="h-6" />
        {sharePayload && <ShareSheet payload={sharePayload} onClose={() => setSharePayload(null)} />}
      </div>
    </div>
  );
}
