# Guardian v2 — Open-Source Powered Enhancement Blueprint

*Researched 2026-11-01. Every star count, push date and license below was
pulled live from the GitHub API that day. Rule of the build: repurpose
battle-tested open source; never reinvent. Guardian stays a $0, no-backend-
of-ours, privacy-first PWA — every pick below fits that or is flagged.*

## Where Guardian stands today (honest audit)

- **GPS:** `watchPosition` high-accuracy, position published every 10 s,
  one radius geofence. NO fix smoothing, NO bad-fix rejection, NO offline
  queue, NO adaptive rate (panic = same 10 s), NO speed/bearing, NO trail,
  NO client ETA (radius ping only).
- **Transport:** MQTT over WSS to a **public** EMQX broker; anonymous
  topics; payloads AES-256-GCM with a per-session key carried in URL
  fragments. Broker software (EMQX ≥ 5.9) is now **BSL, not open source**.
- **Crypto:** one shared symmetric key per session — no identity keys, no
  forward secrecy, no revocation. PINs are SHA-256 (fast hash = brute-
  forceable if storage is ever extracted).
- **A/V:** hand-rolled WebRTC signaled over MQTT, Google STUN only — the
  most fragile part of the app.
- **Trust UX:** no delivery receipts, no "watcher is watching" presence,
  no acknowledgement button, no persistent "she's safe" status, no
  incident journal, no address reverse-geocoding in alerts (raw links).

## Lane 1 — GPS: the tracking core (Rob's priority)

| Repo | ★ | License | Last push | Role in v2 |
|---|---|---|---|---|
| traccar/traccar + traccar-web | 8,015 / 1,199 | Apache-2.0 | today | **Pattern + feature goldmine.** Its decade of production lessons become our spec: position filtering (accuracy/distance filters), geofence event engine (enter/exit/dwell), motion detection, overspeed, track replay, per-device report types. We lift the *algorithms and event model* into the browser — not the Java server. |
| bilde2910/Hauk | 944 | Apache-2.0 | 2026-10-21 | **The sharing model.** Timed, self-expiring live-location shares with a share password and no accounts — validates and sharpens our watch-link design (expiry, revocable, multiple concurrent shares). |
| Turfjs/turf | 10,527 | MIT | 2026-10-26 | **Geo math engine.** Bearing, destination, polygon geofences, point-in-polygon, along-route distance — replaces hand-rolled haversine-only math. |
| manuelbieh/geolib | 4,279 | MIT | 2026-10-30 | Lightweight distance/ETA/bearing helpers where Turf is overkill. |
| wouterbulten/kalmanjs | 453 | MIT | 2023-08 (stable) | **Vendor the ~80-line Kalman filter** (don't depend, copy with attribution — it's finished software). Smooths GPS jitter into a believable track. |
| Freika/dawarich | 10,800 | **AGPL-3.0** | today | **Patterns only — copyleft trap.** Timeline/visits/trip-detection UX ideas (automatic trip segmentation, "places you frequent") inform our session journal. No code. |
| owntracks/android | 1,776 | EPL-1.0 | today | Pattern source: significant-change vs interval publish modes, region events. Weak-copyleft — ideas, not code. |

### The GPS engine we build from these (client-side, `src/lib/tracking.ts`)

1. **Fix pipeline (Traccar-style filtering):** reject fixes with
   accuracy > 50 m (configurable), reject teleport outliers
   (implied speed > 200 km/h), Kalman-smooth the accepted stream.
2. **Adaptive publish rates:** idle/session 10 s → client-approaching 5 s
   → **panic/missed-check-out 2 s**; significant-change mode (publish on
   ≥ 25 m movement) to save battery, à la OwnTracks modes.
3. **Offline outbox (Dexie):** every fix + alert queued locally first,
   flushed on reconnect — dead zones stop eating alerts.
4. **Richer PosMsg:** speed, heading, accuracy, battery level, and a
   monotonic sequence number (gap detection on the watch page: "signal
   lost 40 s ago" instead of a silently frozen dot).
5. **Client insight:** live ETA + bearing to the incall point (Turf),
   approach states (en route → close → arrived) instead of one radius.
6. **Trail:** session breadcrumb polyline (encrypted like everything
   else) + post-session replay in the journal.
7. **Multi-use of the same stream (Rob's requirement):** safety
   (geofence enter/exit/dwell events), income (trip/mileage log for
   outcalls, arrival proof timestamps), protection (last-known-position
   with accuracy + timestamp on every alert), privacy (data never leaves
   the encrypted channel; tiles stop leaking viewport — see Lane 4).

## Lane 2 — Protocol & backend redesign

| Piece | Pick | ★ / License | Why |
|---|---|---|---|
| Transport | **PartyServer (cloudflare/partykit)** | 1,304 · ISC · active | One Durable Object per session = a private room on *our own* Cloudflare account, WebSocket + hibernation, auth checked at the door (join tokens), DO storage for room state. Kills the public-broker hole, stays $0, TS end-to-end. (Trap avoided: PartyKit the *hosted platform* shut down Oct 2026 — we self-deploy the library.) |
| A/V | **LiveKit** (cloud free tier; self-hostable later) | 21,977 · Apache-2.0 | Real WebRTC SFU with built-in track E2EE replaces hand-rolled MQTT-signaled WebRTC + STUN-only NAT gamble. |
| Crypto | **libsodium-wrappers** (audited libsodium core) | ISC | X25519 identity keys per circle member; session keys *sealed* to each member (fragment links demoted to guest fallback); secretstream for the location feed (ordering/replay protection); Signal-style **safety-number fingerprints** as the trust UX. |
| Group crypto (phase 2) | **ts-mls** (RFC 9420, pure TS) | 111 · MIT · unaudited — flagged | Forward secrecy + member revocation for the persistent circle. Phase 2 only, eyes open. (Trap avoided: no viable browser libsignal — Signal's JS lib is GPL and archived; the Rust one is AGPL with no browser target.) |
| Auth | **Argon2id PIN** via libsodium `crypto_pwhash` + **SimpleWebAuthn passkeys** | 2,382 · MIT | PIN stops being a fast-hash joke *with zero new deps*; passkeys in the PartyServer Worker add fingerprint unlock — a trust feature users repeat to friends. |
| Local data | **Dexie.js** | 14,673 · Apache-2.0 | Replaces the hand-rolled IndexedDB wrapper; powers the offline outbox + session journal + diagnostics log (no phoning telemetry home — privacy story intact; self-hosted Sentry/GlitchTip break the $0 rule). |
| Fallbacks noted | Centrifugo (10,941, Apache) / NATS (20,980, Apache) / own Mosquitto (11,320) | — | Only if we ever leave Cloudflare; all need a VPS, so not primary. **EMQX is out** (BSL since 5.9). Soketi is stalled + AGPL. PeerJS is slowing (last push Feb 2026). |

## Lane 3 — Safety features that manufacture trust & word of mouth

*Category honesty: there is no fan-favorite safety app repo. The best
patterns come from Guardian Project work, a few small active repos, and
dead apps mined for UX only. GPL repos = features/UX, never pasted code.*

Ranked lift list (source in brackets):

1. **Alert delivery receipts + "I'm on my way" ack** [SafeTap pattern —
   no license, patterns only]. Watch page gets an ack button; the
   provider sees "Maria got it · 2 min ago · On my way." Trust made
   visible. **The single biggest word-of-mouth feature available.**
2. **Persistent "She's Safe ✅" status** on the watch page after stand-
   down/check-out [ResQLink, MPL-2.0 — its Mark-as-Safe/Family Inquiry].
3. **Fake rescue call** [bSafe pattern; sakhi-shield] — scheduled fake
   incoming call with a plausible name + script to exit a bad date
   *before* it's an emergency. The daily-use feature that drives
   retention + referrals.
4. **Encrypted session journal + silent evidence capture** [Haven
   (Guardian Project), GPL — patterns; SOS-alerter, GPL — patterns]:
   timestamped on-device log of check-ins, arrivals, alerts; optional
   audio snippets during panic. Exportable, user-owned.
5. **Icon/coded one-tap messages** [OpenCircle/Circle of 6, GPL —
   patterns]: innocent-worded quick texts ("call me, need an
   interruption") that don't out the app on screen.
6. **Human-readable address in every alert** [Here I Am, MIT]: reverse-
   geocode over the encrypted channel so alerts say "Motel 6, Aurora Ave"
   + link, not bare coordinates.
7. **Private bad-client log** [JustNUM/NUM workflow, privacy-scoped]:
   on-device number + notes + "do not see" tags, pre-date check against
   *her own* log, optional warning to *her circle only*. NO central
   database (legal + safety reasons are documented in that scene).
8. **Decoy mode** [SoS calculator pattern]: app disguises as a
   calculator/notes app until a gesture/PIN. Screenshots market
   themselves.
9. **Post-date dead-man's switch** [circa10a/dead-mans-switch, MIT,
   pushed today]: "if I don't check in by 9 AM, send my date details to
   my buddy." Habit-forming pre-date ritual = growth.
10. **Nearest safe places** [SafePathAI, MIT]: one-tap police/hospital/
    pharmacy near the session location. (The *directory* half only —
    crowdsourced danger maps are a moderation/legal liability.)

Also from the GPS lane: **multi-trigger SOS** (shake, volume clicks,
voice phrase) is PWA-limited — browsers can't hear global shake/volume
events reliably; we get shake-in-app (devicemotion) only, and we say so
honestly rather than shipping a fake promise.

## Lane 4 — Maps & UI polish

- **Engine: MapLibre GL JS (11,994★, BSD-3) via react-map-gl (8,515★,
  MIT).** GPU vector maps, smooth marker glide, runtime restyle (panic
  mode turns the map red for free), native heatmap/accuracy layers.
- **Tiles: OpenFreeMap now** (free, no key, dark styles, commercial OK —
  hyperknot/openfreemap 6,333★) → **Protomaps PMTiles extract on
  Cloudflare R2 as the end-state** (3,099★, BSD-3): the whole basemap as
  one static file — no third party ever sees a tile request, works
  offline in the PWA. Retire OSM raster tiles (their policy excludes
  real app traffic) and avoid CARTO (2026 watermark/API-key rug-pull).
- **UI: shadcn/ui (127,125★, MIT) + Radix + Vaul drawers (8,673★) +
  Sonner toasts (13,118★) + Motion surgically (34,780★)** — all MIT/TS/
  Tailwind-native, copy-in components we own. Skip Ionic/Framework7
  re-platforms. Stale-plugin warning: every Leaflet animation plugin
  (realtime/MovingMarker/motion) is 2022–23 abandonware — another
  reason the engine moves to MapLibre.

## Build phases

- **Phase 1 — GPS Reliability Pack** (client-only, zero protocol risk):
  tracking.ts (filter + Kalman + adaptive rates + gap detection),
  Dexie outbox + journal storage, richer PosMsg, client ETA/approach
  states, trail polyline, last-known-position on alerts.
- **Phase 2 — Trust Pack** (still on MQTT): delivery receipts + ack
  button, "She's Safe" status, watcher presence ("Maria is watching
  now"), address-in-alerts, fake rescue call, coded quick messages.
- **Phase 3 — Protocol v2**: PartyServer rooms replace public MQTT;
  libsodium identity keys + sealed session keys + safety numbers;
  Argon2id PINs; LiveKit emergency A/V.
- **Phase 4 — Face-lift**: MapLibre + OpenFreeMap → PMTiles/R2;
  shadcn/Vaul/Sonner polish; panic-mode map restyle.
- **Phase 5 — Moat features**: bad-client log, decoy mode, post-date
  dead-man's switch, safe-places button, session replay; ts-mls circle
  crypto evaluation.

*Licensing discipline: Apache/MIT/BSD/ISC code may be reused with
attribution; GPL/AGPL/EPL repos are pattern-mines only; unlicensed repos
are all-rights-reserved (patterns only). This keeps Guardian shippable
in any direction Rob takes it.*
