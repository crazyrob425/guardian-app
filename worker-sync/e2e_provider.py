#!/usr/bin/env python3
"""Phase 3 E2E harness: a protocol-faithful simulated Guardian provider.

Connects to the Guardian Cloud room as the provider, publishes an encrypted
active state + position (exactly the app's AES-256-GCM base64url format),
then listens: every frame the real app sends back (presence, acks) is
decrypted and logged. Sending the word PANIC on stdin escalates the state
and fires a panic alert so the real watch page can ack it.

Usage: python3 e2e_provider.py [minutes]
Writes: /tmp/guardian_e2e.json  (session descriptor incl. watch URL)
Logs:   /tmp/guardian_e2e.log
"""
import asyncio, base64, json, os, sys, time

import websockets
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

LOG = open("/tmp/guardian_e2e.log", "a", buffering=1)


def b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, file=LOG)


async def main() -> None:
    minutes = float(sys.argv[1]) if len(sys.argv) > 1 else 10
    key = AESGCM.generate_key(bit_length=256)
    aes = AESGCM(key)
    sid = b64url(os.urandom(12))
    key_b64 = b64url(key)
    url = f"wss://guardian-sync.blacklisted.studio/room/{sid}"
    watch = f"https://guardian-app.blacklisted.studio/#/watch/{sid}?k={key_b64}"
    with open("/tmp/guardian_e2e.json", "w") as f:
        json.dump({"sessionId": sid, "key": key_b64, "watchUrl": watch}, f)
    log("SESSION", sid, "watch:", watch)

    def enc(obj) -> str:
        iv = os.urandom(12)
        ct = aes.encrypt(iv, json.dumps(obj).encode(), None)
        return b64url(iv + ct)

    def dec(payload: str):
        raw = base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4))
        return json.loads(aes.decrypt(raw[:12], raw[12:], None))

    state = {
        "state": "active",
        "alias": "E2E Sim",
        "startedAt": int(time.time() * 1000),
        "expectedMin": 60,
        "ts": int(time.time() * 1000),
    }
    pos = {
        "from": "provider",
        "ts": int(time.time() * 1000),
        "pos": {"lat": 47.6062, "lng": -122.3321},
        "accuracyM": 12,
        "v": 2,
        "seq": 1,
        "bat": 87,
    }

    async with websockets.connect(url, proxy=True) as ws:
        await ws.send(json.dumps({"kind": "state", "payload": enc(state), "retain": True}))
        await ws.send(json.dumps({"kind": "pos", "payload": enc(pos), "retain": True}))
        log("PUBLISHED state+pos (retained)")

        async def stdin_panic():
            # File-triggered panic: create /tmp/guardian_e2e_panic to escalate.
            while True:
                await asyncio.sleep(1)
                if os.path.exists("/tmp/guardian_e2e_panic"):
                    os.unlink("/tmp/guardian_e2e_panic")
                    st = dict(state, state="panic", ts=int(time.time() * 1000))
                    await ws.send(json.dumps({"kind": "state", "payload": enc(st), "retain": True}))
                    await ws.send(json.dumps({
                        "kind": "alert",
                        "payload": enc({"type": "panic", "ts": int(time.time() * 1000), "pos": pos["pos"], "addr": "near Pike Place, Seattle, WA"}),
                    }))
                    log("PANIC SENT")

        async def heartbeat():
            while True:
                await asyncio.sleep(20)
                try:
                    await ws.send(json.dumps({"kind": "ping"}))
                except Exception:
                    return

        async def listener():
            async for raw in ws:
                try:
                    frame = json.loads(raw)
                    if frame.get("kind") == "pong":
                        continue
                    msg = dec(frame["payload"])
                    log("RECV", frame.get("kind"), json.dumps(msg))
                except Exception as e:  # noqa: BLE001
                    log("RECV-UNDECRYPTABLE", str(e)[:80])

        tasks = [asyncio.create_task(x) for x in (stdin_panic(), heartbeat(), listener())]
        try:
            await asyncio.wait_for(asyncio.gather(*tasks), timeout=minutes * 60)
        except asyncio.TimeoutError:
            log("TIMEOUT — harness window ended")
        log("DONE")


if __name__ == "__main__":
    asyncio.run(main())
