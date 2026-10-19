import { useState } from "react";
import { TopBar, Card, Btn, Field, inputCls } from "../components/ui";
import { store, DEFAULT_SETTINGS, type Settings } from "../lib/store";
import { sha256Hex } from "../lib/crypto";
import { sendSms } from "../lib/sms";

export default function SettingsScreen(props: { onBack: () => void; onChanged: () => void }) {
  const [s, setS] = useState<Settings>(store.getSettings());
  const [pin, setPin] = useState("");
  const [duress, setDuress] = useState("");
  const [saved, setSaved] = useState("");
  const [smsTest, setSmsTest] = useState("");

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

        <Card className="space-y-4">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Sync server</p>
          <Field label="MQTT broker (WebSocket)" hint="Default is a free public broker. Run your own for maximum privacy.">
            <input className={inputCls} value={s.mqttBroker} onChange={(e) => set("mqttBroker", e.target.value)} placeholder="wss://broker.emqx.io:8084/mqtt" />
          </Field>
        </Card>

        <Card className="space-y-4">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">SMS alerts (Twilio via worker)</p>
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
      </div>
    </div>
  );
}
