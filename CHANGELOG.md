# Guardian — Changelog

The full engineering log: every version, what shipped, what broke, what we
learned. The polished story lives in [README.md](README.md); this is the
grease under the fingernails.

## v0.11.2 — Honest Texting (2026-11-02)
- **Bug found by Rob on a real phone test:** the session screen's "Text circle"
  button reported *"Watch link texted to 2 people"* while running in demo mode
  (no SMS relay configured) — no texts existed. A safety app does not get to
  round "demo" up to "sent." Fixed at the root:
  - With a relay configured, the feed reports the real sent/failed counts.
  - With **no relay**, the button now opens the user's own Messages app with
    the watch-link text prefilled to the whole circle (`sms:` composer) —
    free, from her own number, one tap on Send. Feed says exactly that.
  - No phone numbers in the circle → falls back to the share sheet, and the
    feed says so.
- Field note: the same test surfaced a phone still running a pre-v0.8.2 cached
  build (old CARTO tile watermark — production has shipped OSM tiles since
  v0.7.1/v0.8.2, verified in the live bundle). Closing the tab fully and
  reopening pulls the current build via the service-worker update check.

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

## v0.8.0 — Phase 4: Face-lift (2026-11-01)
- **Maps:** a MapLibre/OpenFreeMap vector build was tried and REVERTED the same night —
  OpenFreeMap's style endpoints return 404 through too many networks (including our test
  browser), and a safety app never ships a blank map. Leaflet + OSM raster (restored in
  v0.8.1) stays until Phase 5's self-hosted Protomaps PMTiles on R2, when MapLibre returns
  with zero external style dependency. CARTO remains retired (watermarking, v0.7.1).
- **Update toast:** a waiting service-worker update now surfaces as a one-tap "Update now"
  banner instead of silently running yesterday's build.
- **First-run safety tour** (driver.js): five stops on Home — panic/duress, check-in/out
  escalation, circle, screening log, fake rescue call. Runs once, replayable from Settings,
  never during a live session.
- **i18n (EN/ES):** i18next wired into the safety-critical surfaces — lock screen, panic PIN
  gate, watcher emergency/ack/She's Safe strings, session quick signals. Owner picks a
  language in Settings; guest watchers automatically get their own phone's language.
- **Payment QR codes:** BTCPay checkout links render as a scannable QR on the invoice card.
- Marketing site refreshed for Phases 2–4 (16 feature cards, 15 FAQs, JSON-LD in sync).

## v0.9.0 — Phase 5: Moat (2026-11-01)
- **Regulars book:** the client log grows ⭐ regulars, re-contact permission (not asked /
  yes / never), a deniable 3-step follow-up flow (thank-you → review ask → re-invite) with
  copy-and-stamp, no-show counters (fed automatically by the booking board), and
  All/Regulars/Avoid filters.
- **Booking board:** upcoming bookings with deposits; Start hands alias + duration to
  date-setup as a one-shot prefill; Done / No-show / Cancel outcomes tracked.
- **Earnings ledger:** income / expenses / mileage on-device, monthly summary, CSV export
  for taxes. Non-outing by construction — it never leaves the phone.
- **Evidence vault:** files (screenshots, confirmations) stored as blobs in the on-device
  DB only, plus a session-journal export (trail + diagnostics JSON).
- **Safe places:** named trusted spots saved from live GPS; the session screen shows the
  nearest safe place and its distance while a date runs.
- **Decoy mode:** a third PIN opens a boring fake Notes app (triple-tap the title to get
  back to the real lock). No Guardian, no alerts — for coerced "just unlock it" moments.
- **Dead-man's switch:** optional proof-of-life timer (2–24 h). Unlocking and checking in
  count as proof of life; when it lapses, an "Are you OK?" interstitial counts down 60 s
  and then fires the full SOS.
- Deferred honestly: self-hosted Protomaps PMTiles + MapLibre return (needs a tile
  pipeline build, and Phase 4 proved external style hosts unreliable), and on-device
  transcription (model download size is a product decision, not a code gap).
- Tests: 26/26.

## v0.10.0 — Fake Call v2: phone-matched themes + free live AI caller (2026-11-01)
- **Call-screen themes:** the fake incoming call can now wear the skin of her actual
  phone — iPhone (iOS), Samsung (One UI), Google Pixel / stock Android, or Classic —
  with Auto-detect from the device user-agent. Different chrome per theme: iOS
  Remind Me / Message row + Accept label, One UI Message/Remind/Block row + teal
  wash, Pixel Material pill buttons + initial avatar.
- **Live AI caller (free, on-device):** the caller now talks back. speechSynthesis
  voices the persona; SpeechRecognition (Chrome / Safari) listens to her replies;
  a branching script routes her answers by intent (agree / stall / question /
  distress / goodbye). No server, no API key, no per-minute cost — it is the
  phone's own speech stack. Mic denied or unsupported → tap-to-reply chips keep
  the conversation alive. Recorded Mom script remains when live mode is off.
- **Five default personas:** Mom (burst pipe), Jess the bestie/roommate (sick dog +
  locked out), Sis (stranded car), Dana the manager (work emergency), Mrs. Alvarez
  the neighbor (leak through her ceiling). Each has its own voice profile, pretext,
  and reply scripts. Picking a persona in Settings also sets the caller name.
- Tests: 31/31 (persona scripts completeness + intent classifier).

## v0.11.x — Phase 6: Setup wizard (Sis) + free accounts (2026-11-02)
- **First-run wizard:** eight steps guided by "Sis" — a friendly, sassy big-sister
  persona: welcome + privacy deal, free account, profile, PINs (main/duress/decoy),
  circle (≥1 required), permissions, alarm sound + fake-call persona, test alert +
  graduation into the Home tour. Progress persists per step (resumes mid-wizard);
  first-run owners are routed to it automatically; Home shows a "Sis is waiting"
  banner until setup is complete.
- **Accounts (Supabase project `guardian-accounts`, ref gbvukahdkuxpqkocyput,
  us-west-1):** magic-link sign-in; `profiles` (identity + entitlement ONLY) and
  `beta_claims` tables with RLS own-row policies; auth redirect URLs pinned to
  guardian-app.blacklisted.studio. Entitlement cached on-device with a 30-day
  offline grace; during beta every plan unlocks everything — safety is never
  paywalled. Settings gained an account card (plan, beta-grant status, sign out).
- v0.11.1 fixed the Supabase URL/anon key to the values read from the live project
  (verified: auth health 200, profiles REST reachable, RLS returns no rows to anon).
