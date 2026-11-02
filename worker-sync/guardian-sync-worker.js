// Guardian Sync — Protocol v2 realtime rooms (Phase 3).
//
// One Durable Object per session room. The server is a dumb relay for
// AES-GCM ciphertext frames: it never sees a session key (keys travel only
// in URL fragments between devices), never logs payloads, and stores only
// the last retained state/pos frame per room so a watcher who joins late
// sees the current picture immediately. Rooms are addressed by the random
// session id — the same capability model as the classic MQTT topics, but on
// infrastructure we control instead of a public broker.

const MAX_CONNECTIONS = 8;
const MAX_FRAME_BYTES = 64 * 1024;

export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const sessions = this.state.getWebSockets();
    if (sessions.length >= MAX_CONNECTIONS) {
      return new Response("room full", { status: 503 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);

    // Replay retained frames so a late joiner is instantly current.
    // NOTE: storage.get([...]) returns a Map, not a plain object.
    const retained = await this.state.storage.get(["last_state", "last_pos"]);
    for (const key of ["last_state", "last_pos"]) {
      const frame = retained ? retained.get(key) : undefined;
      if (frame) {
        try { server.send(frame); } catch { /* noop */ }
      }
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    try {
      if (typeof message !== "string" || message.length > MAX_FRAME_BYTES) return;
      const frame = JSON.parse(message);
      if (frame.kind === "ping") {
        try { ws.send(JSON.stringify({ kind: "pong", ts: Date.now() })); } catch { /* noop */ }
        return;
      }
      if (!frame.kind || typeof frame.payload !== "string") return;
      // Retain the latest state / position for late joiners.
      if (frame.retain && (frame.kind === "state" || frame.kind === "pos")) {
        await this.state.storage.put(`last_${frame.kind}`, message);
      }
      // Relay to everyone else in the room.
      for (const other of this.state.getWebSockets()) {
        if (other !== ws) {
          try { other.send(message); } catch { /* noop */ }
        }
      }
    } catch {
      /* malformed frame — drop it, keep the room alive */
    }
  }

  async webSocketClose(ws) {
    try { ws.close(); } catch { /* noop */ }
  }

  async webSocketError(ws) {
    try { ws.close(); } catch { /* noop */ }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, service: "guardian-sync", v: 2 }), {
        headers: { "content-type": "application/json" },
      });
    }
    const m = url.pathname.match(/^\/room\/([A-Za-z0-9_-]{6,64})$/);
    if (!m) return new Response("not found", { status: 404 });
    const id = env.ROOMS.idFromName(m[1]);
    const room = env.ROOMS.get(id);
    return room.fetch(request);
  },
};
