// One-shot emergency alert: connect, publish encrypted alert + state, SMS the
// circle, disconnect. Used for duress unlocks and anywhere a full session
// screen isn't open.

import { importKey } from "./crypto";
import { connectSession, watchLink, type AlertType } from "./sync";
import { alertCircle } from "./sms";
import { mapsLink, type LatLng } from "./geo";
import type { Settings, CircleMember } from "./store";

export async function sendEmergencyAlert(opts: {
  settings: Settings;
  circle: CircleMember[];
  type: AlertType;
  sessionId: string;
  keyB64: string;
  pos: LatLng | null;
  alias: string;
}): Promise<string> {
  const { settings, circle, type, sessionId, keyB64, pos, alias } = opts;
  const key = await importKey(keyB64);
  const link = watchLink(window.location.origin, sessionId, keyB64);
  const label = type === "duress" ? "silent duress signal" : type === "missed-checkout" ? "missed check-in" : "PANIC BUTTON";
  const who = settings.displayName || "Someone you protect";

  let sync: Awaited<ReturnType<typeof connectSession>> | null = null;
  try {
    sync = await connectSession({ broker: settings.mqttBroker, sessionId, key });
    await sync.publish("state", { state: "panic", alias, startedAt: Date.now(), expectedMin: 0, ts: Date.now() }, true);
    await sync.publish("alert", { type, ts: Date.now(), pos: pos ?? undefined, note: label });
  } catch (e) {
    console.warn("Emergency sync failed:", e);
  } finally {
    sync?.close();
  }

  const body =
    `Guardian ALERT (${label}): ${who} may need help.` +
    (pos ? ` Last location: ${mapsLink(pos)}` : "") +
    ` Live view: ${link}`;
  await alertCircle(settings, circle, body).catch(() => {});
  return link;
}
