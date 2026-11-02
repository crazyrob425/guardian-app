# Guardian — discreet personal safety app

## Live (2026-11-01)

- **Sales / download site:** https://guardian.blacklisted.studio/
- **The app (install from here):** https://guardian-app.blacklisted.studio/
- Hosting: Cloudflare Pages projects `guardian-blacklisted` (site, source in
  `~/workspace/guardian-site/`) and `guardian-app` (this app's `dist/`), each
  fronted by a fetch-proxy Worker (`guardian-proxy` / `guardian-app-proxy`)
  attached via Workers Domains — the same pattern as read.blacklisted.studio,
  because the API token has no DNS-edit scope. Note: the app must live on a
  first-level subdomain — `app.guardian.blacklisted.studio` failed (Cloudflare
  Universal SSL doesn't cover second-level subdomains; empty replies), so the
  app uses `guardian-app.blacklisted.studio`.


A mobile-first **PWA** (installable on iOS + Android, no app store needed) built for
in-person providers who need a bodyguard in their pocket.

> A PWA was chosen deliberately: app stores routinely reject adult-industry apps.
> This installs from the browser to the home screen and updates instantly.

## What it does

- **Panic button** (press-and-hold) — siren, encrypted alert + live GPS to your
  safety circle, SMS via Twilio relay, optional live camera/mic broadcast
- **Mandatory check-in / check-out** — start a date timer; miss check-out and your
  circle is alerted automatically after a grace period you set
- **Live GPS tracking** — dark map, your position published every ~10s while a date is live
- **Client GPS + arrival alerts** — send the client a discreet link; they share
  location from their browser, you get "approaching" / "arrived" pings (geofenced)
- **Emergency video/audio monitoring** — on panic, your circle can watch a live
  WebRTC stream from your phone (P2P, signaled over the encrypted session channel)
- **Panic PIN lock** — the instant panic fires (button, missed check-out, or
  home SOS), the alarm locks to the App PIN set in Settings: every stop path
  (stand down, check out, SOS dismiss) routes through a PIN pad, and the
  audio engine itself refuses to stop while locked. An attacker holding the
  phone can't silence it. The duress PIN also silences it — but fires a
  silent coercion alert to the circle. No App PIN set = no lock (Settings
  warns about this in the Lock screen card).
- **Selectable alarm sounds** — Settings picks what panic / missed check-out / SOS
  blast on loop: (1) Police Siren (synthesized wail+yelp), (2) Piercing Shriek
  (non-stop 2.85 kHz personal alarm), (3) BNE Security Voice Warning (TTS
  announcement: live recording + tracked crime scene + armed officers en route,
  after a two-tone chime; the file alternates a woman's voice pass with a man's),
  (4) Help — Being Attacked! (realistic female distress cry, rebuilt v0.4.2 on
  the research: Arnal et al. 2015 scream "roughness" — 30–150 Hz loudness
  flicker that recruits the amygdala — via strained delivery + light 70 Hz AM
  + presence EQ, NO pitch shift; content follows Latané & Darley bystander
  findings — unambiguous emergency, stranger-attack framing "I don't know
  him!", and a direct singular command "YOU! Call 911! NOW!"; siren bursts
  bookend the cry), (5) Air Raid Siren, (6) Security Klaxon (two-tone) —
  all in `public/sounds/`, precached by the PWA — or **your own audio file**
  picked from the phone, stored on-device in IndexedDB, never uploaded.
  Playback falls back to the Web Audio synth siren if a file can't play.
- **Duress PIN** — unlocks normally but *silently* alerts your circle
- **Discreet mode** — neutral wording everywhere ("appointment", "guest"); nothing
  on screen outs what you do
- **Crypto + card payments** — BTCPay Server invoices (self-hosted, no KYC) and/or
  a Stripe payment link, right from the date screen
- **Phone share menu** — watch/client links and the circle invite go out through the
  phone's native share sheet (Web Share API): her own SMS app, Messenger, WhatsApp,
  Telegram, email. Fallback sheet with the same targets where share isn't supported.
  Nobody signs up for anything; her apps carry the links.
- **Free push alerts (ntfy)** — panic / duress / missed check-out also POST a
  content-free ping to her random private ntfy topic; her circle subscribes once in
  the free ntfy app (no account, no cost) and gets buzzed even with the watch page
  closed. Free public tier: ~250 messages/day anonymous — orders of magnitude more
  than emergency use. Location/links never touch ntfy.
- **Watch-page escalation** — an open watch page self-escalates on emergency alerts:
  repeating chime, vibration, system Notification, screen wake lock.
- **End-to-end encrypted sync** — every location/alert/signal payload is AES-GCM
  encrypted with a per-session key that only ever travels inside URL fragments
  (`#…`), which browsers never send to any server

## How the sync works (no backend of ours)

1. Provider taps **Start date** → app generates a random session ID + 256-bit key.
2. Positions/alerts are AES-GCM encrypted and published to a public MQTT broker
   (`wss://broker.emqx.io:8084/mqtt`, configurable) on `guardian/v1/<sessionId>/*`.
3. The client link (`#/client/<id>?k=<key>`) and circle watch link
   (`#/watch/<id>?k=<key>`) carry the key **in the URL fragment** — the broker
   only ever sees ciphertext on random topics.
4. SMS alerts (optional fourth layer) go through your own Twilio account via the
   included Cloudflare Worker relay (`worker/sms-relay.js`) — the app never
   touches Twilio directly (Twilio has no browser CORS support). The primary
   alert paths are the share menu (her own apps) and free ntfy push.

**Threat-model notes (read these):**
- The public broker sees *that* random topics have traffic, not *what* it is.
  For stronger metadata privacy, run your own MQTT broker (Mosquitto: 5-minute
  setup) and point the app at it in Settings.
- WebRTC uses public Google STUN; add your own TURN server in the code
  (`src/lib/webrtc.ts`) for symmetric-NAT networks.
- PINs are SHA-256 hashed in `localStorage` — this stops casual snooping, not
  forensics. Use a device passcode too.

## Quick start

```bash
npm install
npm run dev      # → http://localhost:5174
npm run build    # → dist/
```

Deploy `dist/` to Cloudflare Pages / Netlify / any static host (HTTPS required
for geolocation + camera).

## Wiring up the real services (all optional — the app works in demo mode)

| Feature | Setup |
|---|---|
| Free push alerts | Settings → generate an ntfy topic → share the circle invite. Circle subscribes once in the free ntfy app / at ntfy.sh/<topic>. No account. |
| SMS alerts (optional) | Deploy `worker/sms-relay.js` to Cloudflare, set the 4 secrets (see file header), paste the worker URL in Settings. NOT required — share menu + ntfy push cover alerting for free. |
| Crypto payments | Self-host BTCPay Server (or use a hosted instance), create an API key + store, paste URL/key/store ID in Settings |
| Card payments | Create a **Payment Link** in your Stripe dashboard, paste it in Settings |
| Private sync | Run Mosquitto with websockets enabled, set `wss://your-host:8084/mqtt` in Settings |

## Project layout

```
src/
  lib/        crypto.ts · sync.ts (MQTT) · webrtc.ts · audio.ts (siren)
              geo.ts · sms.ts · payments.ts · emergency.ts · store.ts · labels.ts
  components/ PanicButton.tsx · MapView.tsx (Leaflet, dark tiles) · ui.tsx
  screens/    LockScreen · HomeScreen · CircleScreen · DateSetupScreen
              SessionScreen · ClientScreen · WatchScreen · PaymentsScreen
              SettingsScreen
  App.tsx     hash router + lock gate + SOS wiring
worker/       sms-relay.js — Cloudflare Worker for Twilio
```

## License

Private project. All rights reserved.

## v0.5.0 — Phase 1: GPS Reliability Pack (2026-11-01)
- **Tracking engine** (`src/lib/tracking.ts`): Traccar-style filter chain — accuracy gate
  (>65 m rejected, coarse accepted only when stale), teleport/outlier rejection, Kalman
  smoothing (`src/lib/kalman.ts`) — with pure, unit-tested decision functions (Vitest, 11 tests).
- **Adaptive cadence:** publish every 5 s / 25 m in session, **2 s / 10 m in panic**, 10 s idle;
  significant-change publishes immediately.
- **PosMsg v2:** sequence numbers (gaps = interrupted signal), speed, heading, **battery %** —
  fully backward compatible with v1 senders.
- **Offline outbox (Dexie):** alerts composed while disconnected are encrypted, queued on-device,
  and flushed in order on reconnect — an alert is never silently lost. Session trail recorded
  on-device; diagnostics log for crashes.
- **Watcher upgrades:** last-update age, GPS accuracy, low-battery warning, **"signal
  interrupted" warning after 45 s of silence**, guest distance + ETA at current pace.
- **Crash-proofing:** every screen sits behind an error boundary — a failure in one screen
  shows a calm fallback; the SOS banner and any sounding alarm live outside the boundary.

## v0.6.0 — Phase 2: Trust Pack + Screening + Client Log (2026-11-01)
- **Confirmation ladder:** watchers acknowledge emergencies from the watch page — "I see it",
  "I'm on my way", "Called help" — and she sees each step live in her session feed. An
  emergency with NO acknowledgment inside 3 minutes re-fires push + SMS automatically
  (silence escalates).
- **Presence:** watch pages heartbeat every 20 s; her session shows "👁 Watching now: …".
- **She's Safe ✅:** the watch page persists a big safe status after check-out.
- **Address in alerts:** panic/missed-checkout alerts carry a locality-level street address
  (free keyless reverse geocode, best-effort) in the sync alert, the SMS, and the watch feed.
- **Coded quick messages:** 🍕 I'm OK · 📞 Call me · 🚗 Come get me (escalates the watch
  page) · 💬 Need to talk — one tap from the session screen.
- **Fake rescue call:** schedule from Home (now / 5 / 10 min) — full-screen incoming call,
  looped ringtone, scripted voice on answer; caller name configurable in Settings.
- **Private client log (new screen):** on-device only (Dexie), never synced or uploaded.
  Screening pack: libphonenumber-js number intel (validity, country, line type — VoIP and
  toll-free flagged as hints), disposable-email detection against the full 10,115-domain
  upstream snapshot, the standard 6-point screening checklist, verdicts, notes, search.
  **Screenshot OCR:** tesseract.js lazy-loads from CDN and extracts phone/email from a
  screenshot entirely in the browser (image never uploads), with confirm-before-save.
- Tests: 18/18 (geo, kalman, filters, cadence, phone/email intel, OCR extraction).

## v0.7.0 — Phase 3: Protocol v2 (2026-11-01)
- **Guardian Cloud transport:** realtime sync moved to our own Cloudflare Worker + Durable
  Object rooms (`guardian-sync.blacklisted.studio`, source in `worker-sync/`) — the public
  MQTT broker is now only an automatic fallback (Settings → Sync transport: Auto/Cloud/Broker).
  The relay forwards AES-GCM ciphertext only, replays the last retained state/pos to late
  joiners, caps rooms at 8 connections, and logs nothing. Same SyncHandle contract, heartbeat
  liveness, reconnect backoff, and a Dexie offline outbox for the WS path.
- **Argon2id PINs** (libsodium-sumo `crypto_pwhash_str`): new PINs are memory-hard hashed;
  legacy SHA-256 PINs still verify and migrate when re-set. Verified by unit tests.
- **Device identity:** an X25519 keypair generated on-device (never uploaded) with a
  BLAKE2b fingerprint in Settings — the foundation for sealed-box session-key delivery to
  paired circle devices; `sealTo`/`openSealed` primitives shipped in `src/lib/identity.ts`.
- **Passkeys as a local unlock factor:** register in Settings; unlock (and silence a locked
  panic alarm) with fingerprint/Face ID. Assertions are verified entirely on-device with
  WebCrypto — Guardian still has no accounts and no server. The PIN always remains available.
  (Hand-rolled CBOR attestation parsing + DER→raw signature conversion, unit-tested.)
- **LiveKit — deliberately deferred:** hosted LiveKit needs a third-party account + server-side
  token minting, and self-hosting breaks the $0 rule; meanwhile the WebRTC emergency A/V
  signaling now rides our own rooms instead of the public broker, which was the actual
  privacy/stability goal. Revisit if a LiveKit Cloud account is ever provisioned.
- Tests: 23/23.
