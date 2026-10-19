// Encrypted real-time sync over MQTT (WebSocket).
// Every payload is AES-GCM encrypted with the session key, which only ever
// travels inside URL fragments (#...) — never to the broker, never in logs.
// Topics: guardian/v1/<sessionId>/{pos,alert,signal,state}

import mqtt, { MqttClient } from "mqtt";
import { encrypt, decrypt } from "./crypto";
import type { LatLng } from "./geo";

export type AlertType = "panic" | "duress" | "missed-checkout" | "checkin" | "checkout" | "arriving" | "arrived";

export interface AlertMsg {
  type: AlertType;
  ts: number;
  pos?: LatLng;
  note?: string;
}

export interface PosMsg {
  from: "provider" | "client";
  ts: number;
  pos: LatLng;
  accuracyM?: number;
}

export interface StateMsg {
  state: "active" | "panic" | "done";
  alias: string;
  startedAt: number;
  expectedMin: number;
  ts: number;
}

export interface SignalMsg {
  kind: "offer" | "answer" | "ice";
  from: string; // unique peer id
  data: any;
}

export type TopicKind = "pos" | "alert" | "signal" | "state";

export interface SyncHandle {
  sessionId: string;
  peerId: string;
  publish: (kind: TopicKind, msg: unknown, retain?: boolean) => Promise<void>;
  onAlert: (cb: (m: AlertMsg) => void) => () => void;
  onPos: (cb: (m: PosMsg) => void) => () => void;
  onState: (cb: (m: StateMsg) => void) => () => void;
  onSignal: (cb: (m: SignalMsg) => void) => () => void;
  close: () => void;
  connected: () => boolean;
}

const PREFIX = "guardian/v1";

export async function connectSession(opts: {
  broker: string;
  sessionId: string;
  key: CryptoKey;
  subscribe?: TopicKind[];
}): Promise<SyncHandle> {
  const { broker, sessionId, key } = opts;
  const topics = opts.subscribe ?? ["pos", "alert", "signal", "state"];
  const base = `${PREFIX}/${sessionId}`;
  const peerId = `p-${Math.random().toString(36).slice(2, 10)}`;

  const client: MqttClient = mqtt.connect(broker, {
    connectTimeout: 8000,
    reconnectPeriod: 3000,
    clientId: peerId,
    clean: true,
  });

  const alertCbs = new Set<(m: AlertMsg) => void>();
  const posCbs = new Set<(m: PosMsg) => void>();
  const stateCbs = new Set<(m: StateMsg) => void>();
  const signalCbs = new Set<(m: SignalMsg) => void>();

  await new Promise<void>((resolve, reject) => {
    const to = setTimeout(() => reject(new Error("Could not reach sync server. Check your connection.")), 10000);
    client.on("connect", () => {
      clearTimeout(to);
      topics.forEach((t) => client.subscribe(`${base}/${t}`, { qos: 1 }));
      resolve();
    });
    client.on("error", (e) => {
      clearTimeout(to);
      reject(e instanceof Error ? e : new Error(String(e)));
    });
  });

  client.on("message", async (topic, payload) => {
    try {
      const kind = topic.slice(base.length + 1) as TopicKind;
      const msg = await decrypt<any>(key, payload.toString());
      if (kind === "alert") alertCbs.forEach((cb) => cb(msg));
      else if (kind === "pos") posCbs.forEach((cb) => cb(msg));
      else if (kind === "state") stateCbs.forEach((cb) => cb(msg));
      else if (kind === "signal") {
        if (msg.from === peerId) return; // ignore own signaling echoes
        signalCbs.forEach((cb) => cb(msg));
      }
    } catch {
      // undecryptable (wrong key / noise) — ignore
    }
  });

  return {
    sessionId,
    peerId,
    async publish(kind, msg, retain = false) {
      const enc = await encrypt(key, msg);
      client.publish(`${base}/${kind}`, enc, { qos: 1, retain });
    },
    onAlert: (cb) => { alertCbs.add(cb); return () => { alertCbs.delete(cb); }; },
    onPos: (cb) => { posCbs.add(cb); return () => { posCbs.delete(cb); }; },
    onState: (cb) => { stateCbs.add(cb); return () => { stateCbs.delete(cb); }; },
    onSignal: (cb) => { signalCbs.add(cb); return () => { signalCbs.delete(cb); }; },
    close() { try { client.end(true); } catch { /* noop */ } },
    connected: () => client.connected,
  };
}

/** Share-link builders. Key stays in the URL fragment (never sent to any server). */
export function clientLink(origin: string, sessionId: string, keyB64: string): string {
  return `${origin}#/client/${sessionId}?k=${keyB64}`;
}
export function watchLink(origin: string, sessionId: string, keyB64: string): string {
  return `${origin}#/watch/${sessionId}?k=${keyB64}`;
}
