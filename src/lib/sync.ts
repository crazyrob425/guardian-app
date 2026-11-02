// Encrypted real-time sync over MQTT (WebSocket).
// Every payload is AES-GCM encrypted with the session key, which only ever
// travels inside URL fragments (#...) — never to the broker, never in logs.
// Topics: guardian/v1/<sessionId>/{pos,alert,signal,state}

import mqtt, { MqttClient } from "mqtt";
import { encrypt, decrypt } from "./crypto";
import { db } from "./db";
import type { LatLng } from "./geo";

export type AlertType =
  | "panic" | "duress" | "missed-checkout" | "checkin" | "checkout" | "arriving" | "arrived"
  // Phase 2 (Trust Pack)
  | "ack" // a watcher acknowledging an alert; note = "seen" | "onmyway" | "called-help", addr/name in `by`
  | "coded"; // discreet coded quick message; note = code id (pizza/call/pickup/talk)

export interface AlertMsg {
  type: AlertType;
  ts: number;
  pos?: LatLng;
  note?: string;
  by?: string; // who sent it (watcher display name, for acks)
  addr?: string; // human-readable street address of `pos`, when known
}

/** A watcher's heartbeat: someone is actively watching this session. */
export interface PresenceMsg {
  name: string;
  ts: number;
}

export interface PosMsg {
  from: "provider" | "client";
  ts: number;
  pos: LatLng;
  accuracyM?: number;
  // v2 fields (Phase 1) — all optional; v1 senders simply omit them.
  v?: 2;
  seq?: number; // per-sender sequence — gaps reveal an interrupted signal
  spd?: number | null; // m/s
  hdg?: number | null; // degrees
  bat?: number | null; // battery %, null when the API is unavailable
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

export type TopicKind = "pos" | "alert" | "signal" | "state" | "presence";

export interface SyncHandle {
  sessionId: string;
  peerId: string;
  publish: (kind: TopicKind, msg: unknown, retain?: boolean) => Promise<void>;
  onAlert: (cb: (m: AlertMsg) => void) => () => void;
  onPos: (cb: (m: PosMsg) => void) => () => void;
  onState: (cb: (m: StateMsg) => void) => () => void;
  onSignal: (cb: (m: SignalMsg) => void) => () => void;
  onPresence: (cb: (m: PresenceMsg) => void) => () => void;
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
  const topics = opts.subscribe ?? ["pos", "alert", "signal", "state", "presence"];
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
  const presenceCbs = new Set<(m: PresenceMsg) => void>();

  /** Flush anything queued in the offline outbox for this session, in order. */
  const flushOutbox = async () => {
    try {
      const rows = await db.outbox.where("sessionId").equals(sessionId).sortBy("ts");
      for (const row of rows) {
        if (!client.connected) break;
        await new Promise<void>((res) => {
          client.publish(row.topic, row.payload, { qos: 1 }, () => res());
        });
        if (row.id != null) await db.outbox.delete(row.id);
      }
    } catch {
      /* outbox flush is best-effort; rows stay queued for the next reconnect */
    }
  };

  await new Promise<void>((resolve, reject) => {
    const to = setTimeout(() => reject(new Error("Could not reach sync server. Check your connection.")), 10000);
    client.on("connect", () => {
      clearTimeout(to);
      topics.forEach((t) => client.subscribe(`${base}/${t}`, { qos: 1 }));
      void flushOutbox();
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
      else if (kind === "presence") presenceCbs.forEach((cb) => cb(msg));
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
      const topic = `${base}/${kind}`;
      if (client.connected) {
        client.publish(topic, enc, { qos: 1, retain });
      } else {
        // Offline: never lose a message — queue the encrypted payload on
        // this device; it flushes in order on the next reconnect. Retained
        // messages (state/pos) are superseded by their next update, so only
        // one-shot messages (alerts) need the queue.
        if (!retain) {
          try {
            await db.outbox.add({ sessionId, topic, payload: enc, ts: Date.now() });
          } catch { /* storage full/blocked — nothing more we can do */ }
        }
      }
    },
    onAlert: (cb) => { alertCbs.add(cb); return () => { alertCbs.delete(cb); }; },
    onPos: (cb) => { posCbs.add(cb); return () => { posCbs.delete(cb); }; },
    onState: (cb) => { stateCbs.add(cb); return () => { stateCbs.delete(cb); }; },
    onSignal: (cb) => { signalCbs.add(cb); return () => { signalCbs.delete(cb); }; },
    onPresence: (cb) => { presenceCbs.add(cb); return () => { presenceCbs.delete(cb); }; },
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
