// Emergency live A/V monitoring: WebRTC between the provider's phone and a
// circle member's browser, with signaling carried over the encrypted MQTT
// session channel. No media server involved (pure P2P). Public STUN only —
// add your own TURN server in Settings for stubborn NATs.

import type { SyncHandle, SignalMsg } from "./sync";

const ICE = (turnUrl: string, turnUser: string, turnPass: string): RTCConfiguration => {
  const iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
  if (turnUrl) {
    iceServers.push({
      urls: turnUrl,
      username: turnUser || undefined,
      credential: turnPass || undefined,
    });
  }
  return { iceServers };
};

export interface BroadcastHandle {
  stop: () => void;
  onViewerCount: (cb: (n: number) => void) => void;
}

/** Provider side: capture camera+mic and broadcast to whoever answers. */
export async function startBroadcast(
  sync: SyncHandle,
  opts: { turnUrl?: string; turnUser?: string; turnPass?: string } = {}
): Promise<BroadcastHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: true });
  const viewers = new Map<string, RTCPeerConnection>();
  const viewerCbs = new Set<(n: number) => void>();
  const emit = () => viewerCbs.forEach((cb) => cb(viewers.size));

  const off = sync.onSignal(async (m: SignalMsg) => {
    if (m.kind === "answer" || m.kind === "ice") {
      const pc = viewers.get(m.from);
      if (!pc) return;
      if (m.kind === "answer") await pc.setRemoteDescription(new RTCSessionDescription(m.data));
      else if (m.data?.candidate) pc.addIceCandidate(new RTCIceCandidate(m.data)).catch(() => {});
    }
  });

  // Announce availability; viewers respond with "watch" requests handled below.
  const offWatch = sync.onSignal(async (m: SignalMsg) => {
    if (m.kind !== "offer" || (m.data as any)?.watch !== true) return;
    const viewerId = m.from;
    if (viewers.has(viewerId)) return;
    const pc = new RTCPeerConnection(ICE(opts.turnUrl || "", opts.turnUser || "", opts.turnPass || ""));
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.onicecandidate = (e) => {
      if (e.candidate) sync.publish("signal", { kind: "ice", from: sync.peerId, to: viewerId, data: e.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed" || pc.connectionState === "disconnected") {
        viewers.delete(viewerId);
        try { pc.close(); } catch { /* noop */ }
        emit();
      }
    };
    viewers.set(viewerId, pc);
    emit();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sync.publish("signal", { kind: "offer", from: sync.peerId, to: viewerId, data: { sdp: offer.sdp, type: offer.type } });
  });

  // Proactively publish an offer so late-joining viewers can answer immediately.
  const pc0 = new RTCPeerConnection(ICE(opts.turnUrl || "", opts.turnUser || "", opts.turnPass || ""));
  stream.getTracks().forEach((t) => pc0.addTrack(t, stream));
  const offer0 = await pc0.createOffer();
  await pc0.setLocalDescription(offer0);
  // keep pc0 alive as the "lobby" — viewers answer it directly
  const lobbyId = sync.peerId;
  viewers.set(`lobby:${lobbyId}`, pc0);
  pc0.onicecandidate = (e) => {
    if (e.candidate) sync.publish("signal", { kind: "ice", from: sync.peerId, data: e.candidate.toJSON() });
  };
  await sync.publish("signal", { kind: "offer", from: sync.peerId, data: { sdp: offer0.sdp, type: offer0.type, lobby: true } });

  return {
    stop() {
      off(); offWatch();
      viewers.forEach((pc) => { try { pc.close(); } catch { /* noop */ } });
      viewers.clear();
      stream.getTracks().forEach((t) => t.stop());
    },
    onViewerCount(cb) { viewerCbs.add(cb); cb(viewers.size); },
  };
}

/** Watcher side: join an in-progress broadcast. Resolves with the media stream. */
export async function joinBroadcast(
  sync: SyncHandle,
  onStream: (s: MediaStream) => void,
  opts: { turnUrl?: string; turnUser?: string; turnPass?: string } = {}
): Promise<() => void> {
  let pc: RTCPeerConnection | null = null;
  const stream = new MediaStream();
  onStream(stream);

  const cleanup = () => {
    if (pc) { try { pc.close(); } catch { /* noop */ } pc = null; }
  };

  const off = sync.onSignal(async (m: SignalMsg) => {
    try {
      if (m.kind === "offer" && !pc) {
        pc = new RTCPeerConnection(ICE(opts.turnUrl || "", opts.turnUser || "", opts.turnPass || ""));
        pc.ontrack = (e) => e.streams[0]?.getTracks().forEach((t) => stream.addTrack(t));
        pc.onicecandidate = (e) => {
          if (e.candidate) sync.publish("signal", { kind: "ice", from: sync.peerId, data: e.candidate.toJSON() });
        };
        await pc.setRemoteDescription(new RTCSessionDescription(m.data));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sync.publish("signal", { kind: "answer", from: sync.peerId, data: answer });
      } else if (pc && m.kind === "answer") {
        await pc.setRemoteDescription(new RTCSessionDescription(m.data));
      } else if (pc && m.kind === "ice" && m.data?.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(m.data));
      }
    } catch { /* noop */ }
  });

  // Ask the provider to (re)publish an offer
  await sync.publish("signal", { kind: "offer", from: sync.peerId, data: { watch: true } });

  return () => { off(); cleanup(); };
}
