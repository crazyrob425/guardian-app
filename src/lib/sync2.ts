// Protocol v2 transport (Phase 3): WebSocket rooms on Guardian's own
// Cloudflare infrastructure (guardian-sync Worker + Durable Objects),
// replacing the public MQTT broker. Same SyncHandle contract, same AES-GCM
// payloads — the relay only ever sees ciphertext. Adds: retained state/pos
// replay for late joiners (server-side), heartbeat liveness, auto-reconnect
// with backoff, and a Dexie offline outbox (alerts composed offline flush
// in order on reconnect, exactly like the MQTT path).

import { encrypt, decrypt } from "./crypto";
import { db } from "./db";
import type { SyncHandle, TopicKind, AlertMsg, PosMsg, StateMsg, SignalMsg, PresenceMsg } from "./sync";

export async function connectCloudSession(opts: {
  cloudUrl: string; // wss:// base, e.g. wss://guardian-sync.blacklisted.studio
  sessionId: string;
  key: CryptoKey;
  subscribe?: TopicKind[]; // accepted for interface parity; rooms relay all kinds
}): Promise<SyncHandle> {
  const { cloudUrl, sessionId, key } = opts;
  const peerId = `p-${Math.random().toString(36).slice(2, 10)}`;
  const url = `${cloudUrl.replace(/\/$/, "")}/room/${encodeURIComponent(sessionId)}`;

  const alertCbs = new Set<(m: AlertMsg) => void>();
  const posCbs = new Set<(m: PosMsg) => void>();
  const stateCbs = new Set<(m: StateMsg) => void>();
  const signalCbs = new Set<(m: SignalMsg) => void>();
  const presenceCbs = new Set<(m: PresenceMsg) => void>();

  let ws: WebSocket | null = null;
  let closed = false;
  let retryMs = 1000;
  let pingTimer = 0;
  let resolveFirst: (() => void) | null = null;
  let rejectFirst: ((e: Error) => void) | null = null;

  const flushOutbox = async () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      const rows = await db.outbox2.where("sessionId").equals(sessionId).sortBy("ts");
      for (const row of rows) {
        if (!ws || ws.readyState !== WebSocket.OPEN) break;
        ws.send(JSON.stringify({ kind: row.kind, payload: row.payload, retain: row.retain }));
        if (row.id != null) await db.outbox2.delete(row.id);
      }
    } catch { /* best effort; rows stay queued */ }
  };

  const open = () => {
    if (closed) return;
    ws = new WebSocket(url);
    ws.onopen = () => {
      retryMs = 1000;
      window.clearInterval(pingTimer);
      pingTimer = window.setInterval(() => {
        try { ws?.send(JSON.stringify({ kind: "ping" })); } catch { /* noop */ }
      }, 25000);
      void flushOutbox();
      if (resolveFirst) { resolveFirst(); resolveFirst = null; rejectFirst = null; }
    };
    ws.onmessage = async (ev) => {
      try {
        const frame = JSON.parse(String(ev.data)) as { kind: TopicKind | "pong"; payload?: string };
        if (frame.kind === "pong" || !frame.payload) return;
        const msg = await decrypt<any>(key, frame.payload);
        if (frame.kind === "alert") alertCbs.forEach((cb) => cb(msg));
        else if (frame.kind === "pos") posCbs.forEach((cb) => cb(msg));
        else if (frame.kind === "state") stateCbs.forEach((cb) => cb(msg));
        else if (frame.kind === "presence") presenceCbs.forEach((cb) => cb(msg));
        else if (frame.kind === "signal") {
          if ((msg as SignalMsg).from === peerId) return;
          signalCbs.forEach((cb) => cb(msg));
        }
      } catch { /* undecryptable — ignore */ }
    };
    ws.onclose = () => {
      window.clearInterval(pingTimer);
      if (closed) return;
      if (rejectFirst) { rejectFirst(new Error("Could not reach Guardian Cloud. Check your connection.")); rejectFirst = null; resolveFirst = null; return; }
      const wait = retryMs;
      retryMs = Math.min(retryMs * 2, 15000);
      window.setTimeout(open, wait);
    };
    ws.onerror = () => { try { ws?.close(); } catch { /* noop */ } };
  };

  await new Promise<void>((resolve, reject) => {
    resolveFirst = resolve;
    rejectFirst = reject;
    window.setTimeout(() => {
      if (rejectFirst) { rejectFirst(new Error("Could not reach Guardian Cloud. Check your connection.")); rejectFirst = null; resolveFirst = null; }
    }, 8000);
    open();
  });

  return {
    sessionId,
    peerId,
    async publish(kind, msg, retain = false) {
      const enc = await encrypt(key, msg);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ kind, payload: enc, retain }));
      } else if (!retain) {
        // One-shot messages (alerts) queue offline; retained kinds are
        // superseded by their next update, like the MQTT path.
        try {
          await db.outbox2.add({ sessionId, kind, payload: enc, retain, ts: Date.now() });
        } catch { /* storage blocked — nothing more we can do */ }
      }
    },
    onAlert: (cb) => { alertCbs.add(cb); return () => { alertCbs.delete(cb); }; },
    onPos: (cb) => { posCbs.add(cb); return () => { posCbs.delete(cb); }; },
    onState: (cb) => { stateCbs.add(cb); return () => { stateCbs.delete(cb); }; },
    onSignal: (cb) => { signalCbs.add(cb); return () => { signalCbs.delete(cb); }; },
    onPresence: (cb) => { presenceCbs.add(cb); return () => { presenceCbs.delete(cb); }; },
    close() {
      closed = true;
      window.clearInterval(pingTimer);
      try { ws?.close(); } catch { /* noop */ }
    },
    connected: () => !!ws && ws.readyState === WebSocket.OPEN,
  };
}
