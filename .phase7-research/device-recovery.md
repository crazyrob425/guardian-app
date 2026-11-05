# Guardian — Lost/Stolen Device Tracking & Recovery (Phase 7 spec)

Researched 2026-11-02 from primary sources (developer.android.com, source.android.com,
Play Console Help / Policy Center, Google support pages, RCW) plus live precedents
(Prey, Cerberus). Companion research: `play-policy.md` in this folder — its verdicts
(background location, FGS types, stalkerware framing, data-safety definitions) are
assumed and not repeated.

**Scope (Rob, 2026-11-02):** both flavors — Play (generic) and direct APK (full) —
must help when the user's phone is stolen or lost **during an appointment/session**.
This document covers: the verified capability matrix (§2), the three-layer feature
design (§3–§5), wrong-PIN intruder evidence (§6), the decoy-PIN countermeasure
video (§7), the "Intrusion & Evidence" settings panel (§8), retention and the one
decision Rob must make (§9), honest limits (§10), and the exact additions
`NATIVE_AND_AI.md` needs (§11).

**One decision is flagged, not assumed — D1 in §9:** lost-mode recovery is the first
Guardian feature where the *server* may need to hold position data for a device that
never joined a session. The recommendation is end-to-end encryption under a
setup-generated Recovery Code so BNE still cannot read locations; the simpler
server-readable alternative would break the published beta guarantee that BNE never
accesses users' GPS data. Everything else in this spec keeps that guarantee intact.

---

## 1. What already exists (assets this design builds on)

From BLUEPRINT_V2 Phase 1/3 and the shipped web app:

- **Live encrypted position stream** to the safety circle during a session
  (guardian-sync Durable Object rooms at guardian-sync.blacklisted.studio forward
  AES-GCM ciphertext only; Traccar-style fix filtering, Kalman smoothing, adaptive
  cadence 10 s → 5 s → 2 s in panic).
- **Retained room state:** the Durable Object replays the last retained state/pos
  to late joiners — i.e., a **last-known position with accuracy + timestamp already
  survives the phone going silent** for any session that was live.
- **On-device session trail** + Dexie offline outbox (flushes in order on reconnect).
- **Signal-interrupted warning** after >45 s of silence during a session.
- **Alert stack:** last-known position is already included in every alert; free
  path = native share sheet + content-free ntfy pings; SEND_SMS has a named Play
  exception for "physical safety/emergency alerts."
- **Phase 6 accounts:** Supabase magic-link accounts (identity + entitlement only,
  RLS own-row, 30-day offline grace) — the recovery console logs in with this.
- **Native shell (blueprint §3):** `GuardianMonitorService` (location|microphone
  FGS) owns sensors and escalation and survives WebView death; the Capacitor plugin
  is a thin remote control; keys live in Android Keystore; Gradle flavors
  `play`/`direct` from one commit.

The gap this spec fills: everything above assumes a *live session with a circle
watching*. Recovery adds (a) readiness before anything goes wrong, (b) a beacon
that works when no session was running or after a reboot, and (c) a console the
owner can drive from *someone else's device* after the phone is gone.

---

## 2. Verified capability matrix

Verdicts are per flavor. "CAN" = shippable as designed. Platform facts were verified
against the Android developer documentation and Play policy sources listed in §12.

| Capability | Play build | Direct APK | Basis / notes |
|---|---|---|---|
| Circle sees live position during a session | CAN | CAN | Already shipped (PWA); native keeps the same design. |
| Last-known position after phone dies / loses signal | CAN | CAN | Retained room state replays last pos; every alert already carries last-known + accuracy + timestamp. |
| Recovery beacon after reboot (lost mode armed at setup) | CAN | CAN | `BOOT_COMPLETED` may still start a **location-type** FGS. Android 15 prohibits boot-starting dataSync/camera/mediaPlayback/phoneCall/mediaProjection/**microphone** FGS — location is *not* prohibited. The beacon is location-only by design; mic monitoring still never resumes after reboot (blueprint §3.2 rule stands for monitoring; see §11 note on amending its wording). |
| Wake a sleeping phone to act (FCM high-priority push) | CAN | CAN | High-priority FCM is a listed exemption to background FGS-start restrictions. Caveat: de-Googled direct-flavor phones may have no FCM — there the beacon polls on its own schedule instead. |
| Remote ring at max volume | CAN | CAN | Alarm audio stream at max volume from the native service. Bypassing *silent* is reliable; bypassing **DND** is guaranteed only if the user granted notification-policy (DND) access at setup — the readiness wizard asks for it; otherwise best-effort. Google's own Find Hub "Play sound" (rings 5 min even on silent) is offered as a parallel path. |
| Remote lock — Guardian lock/message screen | CAN | CAN | Guardian's own full-screen lock screen with owner message + callback number, drawn by the app. |
| Remote lock — true system lock | CAN (opt-in) | CAN (opt-in) | Via the Recovery Guard device admin (§3): `DevicePolicyManager.lockNow()`. Requires the admin to have been user-enabled at setup with `USES_POLICY_FORCE_LOCK`. |
| Lost message + callback number on the **system** lock screen | CANNOT | CANNOT | That is Find Hub's privileged capability ("Mark as lost" displays a message on the lock screen). No public API lets a normal app write to the system lock screen. Guardian's own lock screen (above) is the substitute; the console deep-links Find Hub for the real thing. |
| Remote wipe | Hand off to Find Hub (default) | CAN (opt-in) | Find Hub Erase is the path of record in both flavors (§5). Guardian-initiated `wipeData()` via Recovery Guard is specified as an advanced, owner-only path — it matters most for de-Googled direct users, who get nothing from Find Hub. Requires the admin enabled at setup. |
| SMS command channel (text the phone "ring" / "locate") | CANNOT | CAN | Play: `RECEIVE_SMS` is restricted to default-SMS-handler apps; Cerberus's own statement confirms its Play build "has no SMS commands… due to Google policies." Direct: a signed command-SMS listener is allowed. Outbound emergency SMS remains fine in both (named Play exception). |
| SIM-change alert | CAN | CAN | Carrier/subscription change is observable on-device; alert goes out over the data channel. Honest limit: the *new* number is usually not readable — the alert says "SIM changed," with the new carrier if available, not a new number. |
| Wrong **App PIN** → front-camera photo | CAN | CAN | Capture inside Guardian's own foreground PIN UI. Full design: §6. |
| Failed **Android lockscreen** attempts → photo | CANNOT | CANNOT | One-paragraph note: §6.6. Not pursued in either flavor. |
| Decoy PIN → front+back video (§7) | CAN* | CAN* | *Device-dependent: true dual-camera needs Android 11+ concurrent-camera support; defined fallbacks cover everything else. Same in both flavors — the constraint is hardware, not policy. |
| Block shutdown / fake shutdown screen | CANNOT | WILL NOT | No supported API intercepts the power menu for normal apps, and imitating a system shutdown is deceptive-behavior territory. Cerberus's power-dialog tricks are part of why it is the industry cautionary tale. Not shipped in either flavor. |
| Uninstall protection | CANNOT | WILL NOT | Play's Malware policy: "Don't use device admin features to block uninstallation" + "Provide a clear and easy way for users to remove your app." Guardian promises easy removal in both flavors (deactivate Recovery Guard → uninstall, Prey-style). |
| Integrate with Google Find Hub (read its location, trigger its actions) | CANNOT | CANNOT | Google provides **no SDK or API for apps** — its partner program is for BLE accessory hardware (Fast Pair firmware, NDA, lab certification). Guardian deep-links `android.com/find` and `android.com/lock` and guides setup; it cannot plug into the Find Hub network. |
| Read whether Find Hub / theft toggles are on | CANNOT | CANNOT | No API exposes them. The wizard guides the user to each toggle and records *user attestation*. What IS queryable — e.g. `KeyguardManager.isDeviceSecure()` (a screen lock exists) — is checked directly. |
| Read the phone's own IMEI for the Device ID Kit | CANNOT | CANNOT | Since Android 10, IMEI/serial are restricted to device-owner / carrier-privileged apps. The ID Kit (§3) is user-entered (dial `*#06#`, Settings → About, or scan the box barcode). |
| Accessibility-service tricks for recovery (overlay locks, power-dialog interception) | NOT USED | NOT USED | Deliberate contrast with Prey (which uses Accessibility for its screen-lock overlay). Guardian's recovery features use zero Accessibility APIs in either flavor — this stays true in the listing copy and declarations. |

**Precedent check.** Prey ships on Play today *with* a user-enabled device admin for
remote lock/wipe, opt-in evidence photos/location reports, and an explicit
deactivation path before uninstall — the shape §3 copies. Cerberus was removed from
Play for steering users to its off-Play full version (anti-pattern: the Play build
must never link to, mention, or hint at the direct edition), and its Play build
dropped SMS commands — matching the matrix above. Neither precedent contradicts any
row; the two CANNOT rows for lockscreen selfies and shutdown tricks are precisely
where the precedents confirm platform limits in their own listings ("Power Button
Lock is available only on Android 8 and lower due to OS restrictions" — Prey).

---

## 3. Layer 1 — Readiness (setup-time; extends the Sis wizard)

Nothing in recovery works if it is first configured *after* the phone is gone.
Readiness is a wizard section ("If your phone is taken") with a green/amber status
list. Each item is either verified by the app or attested by the user (the app
cannot read Google's toggles — see matrix).

**Google's own anti-theft stack — guide + attest:**
1. **Find Hub on** — guide to confirm a Google Account is signed in (Find Hub turns
   on automatically with it), then a **live self-test**: "Open android.com/find on
   any other device and see this phone." Deep links provided.
2. **Theft Detection Lock** — guide to Settings → Google → All services → Theft
   protection; user attests it's on. (OS feature: AI motion-sensor detection of a
   snatch-and-run locks the screen. Not active while already locked; may not
   trigger on stable Wi-Fi/Bluetooth — the wizard says so; Guardian's own snatch
   heuristic in §4 complements, not replaces, it.)
3. **Offline Device Lock** — same screen; attest. Locks after brief offline use
   (max 2×/24 h).
4. **Remote Lock** — guide to set a verified phone number so android.com/lock
   works; attest.
5. **Identity Check** (devices that offer it) — biometrics required outside
   trusted places for turning off Find Hub / theft protection, factory reset,
   changing the screen lock. Recommended ON: it stops a thief who watched the
   owner type their PIN from disabling recovery.
6. **Screen lock strength** — `KeyguardManager.isDeviceSecure()` checked directly;
   wizard pushes a real PIN/password over a 4-digit/short pattern where possible.

**Guardian's own readiness:**
7. **Recovery Guard (device admin) — OFF by default, separate opt-in screen.**
   Grants exactly two capabilities: *lock this phone on command* and *erase this
   phone on command* (owner-only, §5). The consent screen names them, states what
   it never does (no uninstall blocking, no policy control, no password rules),
   and how to remove it (Settings → deactivate → uninstall normally). Play posture
   follows the Malware policy's own guidance: explicit consent + easy removal.
8. **SIM PIN** — guided (carrier default PINs are public knowledge; an un-PIN'd
   SIM moved to another phone exposes the number to account-recovery abuse).
9. **Full-screen-intent grant** — since January 2025 only calling/alarm apps get
   `USE_FULL_SCREEN_INTENT` by default; the wizard sends the user to the system
   setting so panic and lost-mode screens can break through.
10. **DND access (optional)** — for guaranteed ring-through (§2). Skippable, with
    the consequence stated in one line.
11. **Decoy/intrusion evidence setup** — the §8 settings panel is walked once here,
    including the on-device camera probe that tells the user which decoy-video
    mode *their* phone supports (§7).

**Device ID Kit (stored in the encrypted vault; shown in the recovery console):**
- Auto: model, Android version, Guardian install ID.
- User-entered (app cannot read them — see matrix): **IMEI**, serial, phone
  number, Google-account email used for Find Hub.
- **Recovery Code** — generated at setup, shown once, big and printable. The owner
  stores it (paper, password manager, or sealed with a circle member). This is the
  key that decrypts recovery data in the console (Decision D1, §9) and the step-up
  proof for destructive console actions.

**Practice drill (part of readiness, not an afterthought):** from the wizard, the
user opens the console on a second device, sees their own last-known position, and
sends a test ring. A recovery flow first touched during a theft will fail; one
rehearsed for 90 seconds won't.

## 4. Layer 2 — During a session (the phone is taken mid-appointment)

The spine is already shipped: the circle holds the live encrypted track and,
thanks to retained room state, the **last-known position the moment the stream
stops**. Recovery adds detection and circle agency on top:

- **Snatch heuristic (on-device):** accelerometer burst + sudden rapid
  displacement while a session is armed → Guardian raises its own Panic PIN Lock
  screen, jumps the beacon to panic cadence (2 s), and sends the circle a
  **"possible snatch"** alert with the position at the moment of the event. This
  complements the OS Theft Detection Lock (which only locks) with the two things
  it doesn't do: notify the circle and mark the place.
- **Connectivity loss while moving** extends the existing signal-interrupted
  escalation: silence >45 s during an armed session already warns the circle; in
  recovery terms the warning now includes "last seen here, moving at X when
  contact was lost" and a one-tap route to the console's mark-lost flow.
- **Last-gasp flush:** an `ACTION_SHUTDOWN` receiver (context-registered; a
  protected broadcast on orderly shutdowns) flushes the latest fix to the outbox
  and, if the network allows, straight to the room. Best-effort by platform
  design — battery pulls and forced power-offs may not deliver it. Copy never
  promises it.
- **Circle-triggered actions** (E2EE commands through the session room, all logged
  to the session journal):
  - **Ring** — any circle member, any time during a session. (Default ON.)
  - **Lock** — only if the owner enabled "my circle can lock my phone" at
    readiness. Default OFF; it hands another person real power over the device.
  - The intruder-evidence triggers of §6–§7 (lost-mode and threshold sends) run
    in this layer too.
- **Session-less theft:** if no session was running, the armed-at-setup recovery
  beacon (§2) is what the console sees — lower cadence, last-known between fixes,
  and it steps up when the console sets lost mode (§5).

## 5. Layer 3 — Recovery console (web, any device, Supabase account)

Same codebase as the app; the owner signs in with their Phase 6 magic-link account
on any browser (a friend's phone, a library PC — Rob's case starts with "my phone
is gone," so the console must assume *no trusted device is available*).

**Mark lost — server-side effects, in order:**
1. Set the device's **lost flag** (picked up via high-priority FCM and on the
   beacon's next connect): beacon cadence steps up, on-device evidence triggers
   (§6–§7) arm their lost-mode sends, Guardian lock/message screen engages.
2. **Revoke the live session / circle / client links** — the guardian-sync room
   for any in-progress session is closed server-side so a thief holding the phone
   can't ride the session link or see the circle.
3. **Revoke that device's Supabase app sessions** (the account stays usable from
   the console; the phone's tokens die).
4. **Notify the circle** ("X marked their phone lost — last seen …").
5. **Start the retention clock** (§9).

**Console home:** live map while the beacon reports; otherwise the last-known fix
with accuracy circle, timestamp, and battery-at-capture. Stale data is labeled
stale — never rendered as live.

**Actions:**
- **Ring** (alarm stream, max volume; note shown if DND access wasn't granted).
- **Lock now** — Recovery Guard `lockNow()` if enabled; otherwise the Guardian
  lock/message screen. If neither is armed, the console says so and deep-links
  Find Hub's Secure device.
- **Show lost message + callback number** — rendered on Guardian's lock screen
  (message text + a callback number that is *not* the stolen phone's). Writing to
  the system lock screen stays a Find Hub handoff (matrix).
- **Share recovery link** — view-only, expiring, revocable link (same fragment-
  token pattern as circle links) for family or police.
- **Export incident pack** — trail as JSON/GPX plus a plain-language incident
  sheet (times, last-known, IMEI from the Device ID Kit) formatted for a police
  report or carrier call.
- **Mark found** — ends lost mode, restores normal beacon, starts the §9 purge
  countdown with an immediate-delete button.

**Erase — the honest handoff.** The console's Erase button explains in two
sentences and deep-links: Find Hub's Erase (android.com/find) is the supported
path — it factory-resets and, honestly stated, *tracking stops afterwards*, so
the console nags the user to export the incident pack first. For owners who
enabled Recovery Guard (and de-Googled direct users with no Find Hub at all), a
Guardian-initiated wipe is available behind: Recovery Code entry + typed
confirmation + a delay-cancel window (default 10 minutes, cancellable from the
console) — an irreversible action gets friction proportional to its cost.
Guardian never claims an erase it didn't perform: until the device acknowledges,
status reads "erase requested, not yet confirmed."

---

## 6. Wrong-PIN intruder selfies — Guardian's OWN App PIN (Rob: "i meant our pin")

### 6.1 Feasibility — CAN in both flavors

The capture happens **inside Guardian's own foreground PIN UI**: the PIN pad is on
screen, the app is in the foreground, `CAMERA` is an ordinary dangerous permission
Guardian already holds for its emergency A/V features. CameraX/Camera2 can capture
to a non-preview surface (ImageReader / ImageCapture without a visible preview),
so the pad's look doesn't change. Distribution channel is irrelevant — **identical
in the Play and direct builds.**

Surfaces covered — **every incorrect App PIN entry**, on:
- the app-unlock PIN pad, and
- the **panic-unlock pad** (the v0.4 Panic PIN Lock stop paths) — the pad a thief
  meets mid-session.

### 6.2 Semantics per PIN type (the three PINs are not the same event)

- **Wrong PIN (no match):** capture, log, count toward the attempt threshold.
- **Duress PIN:** the entry already silences the app and fires the silent
  coercion alert. **Photo capture on duress entry is OFF by default and a
  separate opt-in (§8)** — because of §6.4: the system camera indicator is visible
  to whoever is standing over the user, and a duress moment is the worst moment
  to advertise a camera. If the owner opts in anyway, the readiness copy says
  exactly that before they can turn it on.
- **Decoy PIN:** **never a selfie.** Decoy entry is handled by §7 (video), and a
  still-camera capture is deliberately not stacked onto it — the decoy only works
  if nothing about the phone's behaviour betrays it.

### 6.3 Storage, sending, retention

- **Storage:** encrypted on-device only, in the evidence vault (same encryption
  pattern as the session evidence vault), in a "Security attempts" log the owner
  can view in-app. **Rolling cap ~20 photos; auto-delete after 7 days** (both
  configurable, §8). Most captures will be the *owner's own typos* — the in-app
  copy says so plainly, so the log reads as a security feature, not an accusation
  machine.
- **A photo leaves the phone only when one of these is true** (E2EE to the circle
  / recovery console, same channel as session traffic — BNE never holds a readable
  copy):
  1. **Lost mode is active** (§5), or
  2. **A session is active AND the attempt threshold is reached** (default 3 wrong
     entries — below that, typos stay on the phone), or
  3. **Duress entry** — only if the §6.2 opt-in is on.
  Outside those conditions the photo *cannot* be sent; there is no background
  trickle of attempt photos to anyone, including "just in case."
- When a photo *is* sent under condition 1 or 2, the circle alert frames it
  accurately: "3 wrong PIN tries on [device] — most recent photo" — evidence for
  the owner, not a public accusation.

### 6.4 The indicator honesty note

Since Android 12, the system shows a **green camera indicator** whenever any app
uses the camera, and logs the use in the Privacy Dashboard. **Apps cannot hide
this.** On the normal wrong-PIN pad that costs little (a thief guessing PINs has
already seen Guardian's UI). On duress/decoy surfaces it's a real tactical fact —
hence the defaults in §6.2 and §8, and readiness copy that states it in plain
words: *"Android always shows a small green dot when the camera is on. Anyone
holding your phone can see it."*

### 6.5 Play / Data Safety

- `CAMERA` is already declared and justified by existing features; the PIN-pad
  capture adds no new permission.
- **Photos become a declared Data Safety data type.** On-device-only storage is
  *not* "collected" under Google's definition; the conditional sends in §6.3 are
  collection/sharing events and must be declared as such (user-initiated,
  safety-purpose, E2EE in transit). The §8 prominent disclosure runs before the
  feature is first enabled (consent first, capture second) — the same
  User Data policy pattern `play-policy.md` already mandates for background
  location and audio.
- Listing copy discipline: "takes a photo when someone guesses your Guardian PIN
  wrong" — never "catches intruders," never any claim about the phone's own
  lockscreen (see §6.6).

### 6.6 Android lockscreen — one paragraph (scope closed, Rob 2026-11-02)

Normal apps cannot observe the **system lockscreen's** failed attempts or
photograph them. The only historical route is `DeviceAdminReceiver.onPasswordFailed`
(user-enabled legacy device admin with watch-login), and even that delivers only a
*failure notification*: since Android 9 a background or locked app cannot use the
camera at all, so **no photo at the moment of a failed lockscreen attempt is
possible on modern Android in either flavor** — sideloading changes policy
exposure, not platform APIs. Guardian is not enabling device admin to chase a
notification that can't carry a photo. End of scope: the selfie feature is the App
PIN's, per Rob's correction.

---

## 7. Decoy-PIN countermeasure video (front + back, on decoy entry)

**Trigger:** the decoy PIN is entered and the fake Notes decoy opens. Recording
starts automatically and runs for the configured duration (default 5 minutes)
while the decoy UI behaves exactly as it always has.

### 7.1 Concurrent-camera feasibility (verified, Android primary docs)

- **True simultaneous front+back exists, but is a hardware capability, not a
  guarantee.** From Android 11, Camera2 exposes concurrent camera sets:
  `PackageManager.FEATURE_CAMERA_CONCURRENT` advertises support;
  `CameraManager.getConcurrentCameraIds()` returns the supported combinations;
  `isConcurrentSessionConfigurationSupported()` validates a concrete
  configuration at runtime. CameraX wraps the same capability
  (`ConcurrentCamera`), dual-camera only, with **max resolution 720p or 1440p**
  depending on the device's mandatory concurrent stream combinations.
- **What the platform guarantees** on devices that advertise concurrent support
  (AOSP mandatory concurrent stream combinations): paired streams on the order of
  **one camera at s720p alongside the other at up to s1440p** (s720p = 1280×720,
  s1440p = 1920×1440 ceilings, or the sensor's max if lower). Full dual-1080p
  recording is *not* part of the guaranteed set; some flagships exceed the floor,
  many devices don't reach it.
- **Device reality:** support concentrates in flagship-class phones (recent
  Pixels, Galaxy S-class, etc.). Guardian makes **no model promises**: the
  readiness wizard *probes the actual phone* (§8's test button), records which
  mode this device earned, and shows the user the result. Rob's Pixel 9 Pro XL
  class of hardware is in the expected-supported tier, but the spec's contract is
  "probe, don't assume."
- **Recording without a preview:** Camera2/CameraX recording targets
  (MediaRecorder surface / CameraX VideoCapture) do not require a visible preview
  surface. The decoy Notes UI stays on screen, untouched; the app is in the
  foreground throughout, so this is ordinary foreground camera use — no FGS type
  games, no background-camera problem (contrast §6.6).
- **The indicator cannot be hidden** (§6.4 applies in full): the green dot shows
  for the entire recording and the session lands in the Privacy Dashboard.
  Readiness copy states it; the decoy design does not pretend otherwise. A
  sophisticated holder who knows Android will know a camera is live. The feature
  is evidence-gathering, not invisibility — the spec and the copy say so.
- **Thermal/battery:** dual ISP + dual encode for 5–10 minutes is the heaviest
  load Guardian ever puts on the phone (Google's own Jetpack Camera App docs warn
  of added power/thermal load in dual mode). Recording stops cleanly on thermal
  shutdown signals or critical battery, sealing what exists (§7.3).

### 7.2 Fallback ladder (device can't do true dual)

Selected automatically by the probe; user can override the *strategy* in §8:

1. **True dual** — front + back simultaneously, 720p each by default (1440p-class
   where the device's concurrent set supports it and the user picked High).
2. **Back video + front photo bursts** — continuous back video; a front still
   every ~10 s (stills fit inside the guaranteed concurrent combinations on more
   devices than dual video does).
3. **Fast alternation** — one camera at a time, ~15 s slices alternating
   front/back, single file sequence. Works on any dual-camera phone.
4. **Single camera** — front only or back only (user's §8 choice).
5. **Photo burst only** — if even single video fails (storage/thermal), stills
   every few seconds. Degraded, never silent: the attempts log records which mode
   actually ran.

### 7.3 Files, sizes, storage

- **Segmented recording:** 60-second sealed segments per camera (front/back
  written as separate files + a manifest tying them to the decoy-entry event).
  Each segment is encrypted into the evidence vault on close — a shutdown or
  battery pull mid-recording loses at most the open segment.
- **Size math** (engineering estimates at typical Android H.264 encoder bitrates,
  audio excluded): 720p ≈ 5–8 Mbps → **~190–300 MB per camera per 5 min** → dual
  ≈ **0.4–0.6 GB**. 1080p ≈ 14–17 Mbps → ~525–640 MB per camera → dual **>1 GB**.
  Hence: default quality cap 720p in dual mode (also the platform's common
  ceiling, §7.1), a **vault space guard** (recording refuses to eat the last
  1 GB of free storage; oldest *non-evidence* vault material is never touched —
  evidence evicts only by its own retention rule), and HEVC roughly halving sizes
  where the device supports it.
- **Audio — separate toggle, OFF by default, legal warning attached.**
  Video-only capture records no conversations. The moment audio is on, WA law
  applies: Washington is an **all-party consent** state (RCW 9.73.030) —
  recording a *private conversation* without every participant's consent is a
  gross misdemeanor and the recording is inadmissible. Narrow statutory
  exceptions exist (e.g. threats/extortion), but Guardian does not build on them.
  The §8 toggle carries this in plain language ("Recording sound can be illegal
  in Washington without everyone's consent — video alone is the safe default"),
  and other states' rules vary; the copy says "check your state" rather than
  pretending WA is universal.

### 7.4 Upload policy

Same rule framework as §6.3, configured separately (§8): vault-only by default
until a trigger condition holds — **lost mode active**, or **session active +
decoy event** (a decoy entry during a live session is never benign, so session
context alone arms the send — no threshold needed for the decoy case). Sends are
E2EE, chunked/resumable (these files are hundreds of MB; a send that can't resume
is a send that fails), and the console shows per-segment arrival so partial
evidence is visible as partial.

---

## 8. Settings panel — "Intrusion & Evidence"

Rob's rule: **every countermeasure in §6–§7 is editable and toggleable here.**
Labels below are the user-facing plain-language strings; defaults ship as listed.

**Access control for the panel itself:** Settings opens only behind the correct
App PIN or biometrics. Duress and decoy entries can never reach it (duress stays
silent; decoy opens Notes), and changing any *upload* setting requires the real
PIN — a person holding the unlocked phone cannot loosen evidence rules behind
the owner's back.

| Setting (plain-language label) | Control | Default | Why this default |
|---|---|---|---|
| "Take a photo when someone enters my PIN wrong" | On/Off | **On** | The core evidence feature; cheap, on-device, and the owner asked for it. |
| "When wrong-PIN photos can be sent to my circle / recovery console" | Never / Only if my phone is marked lost / During a session or when lost / Always | **Only if marked lost** | Keeps the published "your data stays on your phone" promise true until the owner declares the emergency. |
| "Wrong tries before it counts as an attack" (threshold) | 1–10 | **3** | Separates the owner's typos from a guessing attack before anything is sent or escalated. |
| "Also take a photo if my duress PIN is used" | On/Off | **Off** | Android's green camera dot is visible to the person forcing the entry — §6.2/§6.4. Opt-in only, behind a warning screen. |
| "Keep wrong-PIN photos for" | 1 / 3 / 7 / 30 days | **7 days** | Long enough to notice a pattern; short enough that a log of your own typos doesn't pile up. Rolling cap ~20 photos regardless. |
| "Record video when my decoy PIN is used" | On/Off | **On** | A decoy entry is never the owner's normal path — if it happens, evidence matters. |
| "Decoy video length" | 1 / 2 / 5 / 10 min | **5 min** | Rob's specified duration; balances evidence value against file size (§7.3) and battery/thermal load. |
| "Decoy video cameras" | Both if my phone can / Front only / Back only | **Both if my phone can** | The ask, with honesty about hardware: the phone is probed and the actual mode is shown (§7.1). |
| "If both cameras can't run together" (fallback behaviour) | Back video + front photos / Switch back and forth / Front only / Back only | **Back video + front photos** | Keeps continuous video of the surroundings *and* periodic faces — the best evidence mix the widest set of phones can do (§7.2). |
| "Decoy video quality" | Standard (720p) / High (up to 1080p) | **Standard (720p)** | Dual-mode platform ceiling is ~720p on most devices, and High can exceed 1 GB for 5 minutes dual (§7.3). |
| "Record sound with decoy video" | On/Off | **Off** | WA all-party consent law (RCW 9.73.030) — §7.3. Toggle carries the legal warning inline. |
| "When decoy videos can be sent" | Never / Only if marked lost / During a session or when lost / Always | **Only if marked lost** | Same reasoning as photos; note §7.4: during a *session*, a decoy entry arms the send at any setting except Never. |
| "Alert my circle after repeated wrong PINs" | On/Off | **On** | A guessing attack during a session is exactly what the circle exists for. |
| "Test my decoy camera setup" | Button | — | Runs the §7.1 probe + a 5-second test recording and *shows the owner* which mode their phone got and what the green dot looks like. No surprises later. |

Panel footer (fixed copy, not a setting): *"Android always shows a green dot
while a camera or microphone is on. Guardian can't hide it, and neither can
anyone else's app."*

## 9. Data retention + Decision D1

**Plain statement of the change:** until now Guardian's servers have held *no*
position history — the sync rooms forward ciphertext and retain only the latest
state. Lost-mode recovery creates, for the first time, a reason to retain
position data beyond the moment: a phone beaconing while lost, whose owner reads
the trail from the console. The retention rules below are therefore part of the
feature, not an appendix.

**Decision D1 — who can read recovery positions? (FOR ROB)**
- **Recommended: E2EE under the Recovery Code (§3).** The device encrypts beacon
  fixes with a key derived from the setup Recovery Code; the server stores
  ciphertext + minimal metadata (timestamps, accuracy). The console decrypts
  in-browser after the owner enters the code. BNE still cannot read anyone's
  location — the published beta guarantee survives intact. Cost: if the owner
  loses the code *and* never stored/sealed it, the console shows metadata
  ("last contact 14:02, accuracy 30 m" without coordinates) and recovery leans on
  the circle's retained last-known + Find Hub. The wizard's storage drill exists
  precisely to prevent this.
- **Rejected alternative: server-readable positions.** Simpler console, no code —
  and it breaks the beta-blog promise ("BNE does not access users' GPS data")
  the day it ships. Not recommended at any convenience level.
- Circle-visible data is unaffected: during sessions the circle already holds
  what it holds, under the existing E2EE session design.

> **D1 DECIDED — 2026-11-03 (Rob).** E2EE as recommended above, with the
> Recovery Code being **user-chosen** (amending §3's generated-code model):
> during setup, the recovery-code field auto-populates with the main app PIN
> the user just entered, so by default the Recovery Code *is* the user's app
> PIN; the user may instead enter a separate custom recovery code only they
> know, for added security. Key derived via a slow, salted KDF; console code
> entry is attempt-throttled/rate-limited. Recorded honestly: a PIN-length
> default code is only as strong as the PIN against offline attack on stolen
> ciphertext — the PIN default is the zero-friction option, the custom code is
> the high-security option. A forgotten code is unrecoverable; nobody can
> reset it. Server stores ciphertext only; the beta guarantee stands. Folded
> into NATIVE_AND_AI.md §8.2/§8.8 as DECIDED.

**Retention schedule (applies under D1-recommended; identical if Rob overrides):**
- **Normal times:** the beacon's last-known record is a *single overwritten
  per-device snapshot* — no history accumulates. Ever.
- **Lost mode:** the beacon trail is retained for the lost episode **plus 7 days
  after Mark found**, then auto-deleted server-side; **hard cap 30 days** in lost
  mode without renewal by the owner.
- **Evidence (photos/video):** governed by §8's on-device rules; anything sent to
  the console under lost mode follows the same lost-episode + 7-day rule, with
  immediate delete available in the console.
- **Owner controls:** export anytime (§5 incident pack); purge-now button in the
  console; account deletion purges everything, no residue.
- These numbers go in the privacy policy verbatim (§11) — retention that isn't
  published doesn't count.

## 10. Honest limits (ship in copy, not just in this spec)

1. Guardian **cannot** join or read Google's Find Hub network, trigger Find Hub
   actions, or put text on the system lock screen. It guides, deep-links, and
   covers the gaps Find Hub leaves (circle, console, evidence).
2. Guardian **cannot** photograph failed *Android lockscreen* attempts (§6.6),
   block or fake a shutdown, or survive a factory reset — no consumer app can.
   Find Hub Erase is the wipe of record.
3. A powered-off, SIM-removed, or Faraday-bagged phone reports nothing until it
   reconnects; last-known + accuracy + timestamp is the honest product then.
4. Every camera feature is **visible** while it runs (system indicator +
   Privacy Dashboard). Any copy implying covert capture is prohibited in both
   flavors — and the decoy/duress defaults are designed around that fact.
5. Recovery Guard (device admin) is opt-in, narrow (lock + wipe on the owner's
   command), and removable in two steps. The Play build never links to, names, or
   hints at the direct edition (the Cerberus removal is the standing warning).

## 11. Additions NATIVE_AND_AI.md needs

**New section** (suggested: "Device Recovery, Intrusion Evidence & Decoy
Countermeasures," placed after the packs section; renumbering is the editor's
call) containing:
- The §2 capability matrix (the CAN / DIRECT-ONLY / CANNOT table).
- The three layers: Readiness (wizard extension, Find Hub + theft-toggle guided
  setup with attestation honesty, Recovery Guard opt-in, Device ID Kit +
  Recovery Code, practice drill) / During session (retained last-known spine,
  snatch heuristic, last-gasp flush, circle ring/lock permissions) / Console
  (mark-lost server effects incl. room + token revocation, actions, Find Hub
  erase handoff, owner-only Guardian wipe path).
- The **wrong-PIN selfie** subsection (§6): capture surfaces (app pad +
  panic-unlock pad), duress default-off + warning, decoy exclusion, vault
  storage/caps, the three send conditions, indicator honesty, Data Safety.
- The **decoy video** subsection (§7): concurrent-camera probing + fallback
  ladder, no-preview recording, segmented encrypted files + size table, audio
  toggle + WA consent note, upload triggers.
- The **Intrusion & Evidence settings panel** (§8) as the normative control
  surface for both features, incl. its PIN-gating rule.
- Retention schedule + **Decision D1** (§9), recorded as DECIDED once Rob rules.
- §10's honest-limits list as binding copy constraints.
- One-paragraph lockscreen note (§6.6) closing that scope permanently.

**§3 amendment (wording, not philosophy):** §3.2's "no resume-after-reboot" rule
must be scoped to *microphone monitoring* in the text, with one added sentence:
a setup-consented, location-only recovery beacon with a persistent notification
may start from `BOOT_COMPLETED` in lost mode (the only boot-startable shape
Android 15 permits). The monitoring rule itself does not change.

**§9 build sequence:** add a recovery build step that depends only on the native
shell (7.1) + Phase 6 accounts — *not* on the AI phases — so it can land in
parallel with the voice work. Suggested placement: new step after 7.1, or a named
parallel track; exact numbering is the editor's call. The settings panel +
evidence vault land in the same step (they are the features' control surface).

**§8 Play-compliance checklist additions:**
1. Device-admin consent copy + commitments: explicit opt-in screen, named
   capabilities only (lock/wipe on owner command), no uninstall blocking, easy
   deactivation path documented in-app and in the listing.
2. Background-location declaration narrative covers the lost-mode beacon as the
   *same* declared feature (one-feature form discipline); demo video updated to
   show mark-lost.
3. Data Safety: add **Photos** (wrong-PIN selfies — collected/shared only under
   §6.3's conditions) and lost-mode **location retention** per §9; on-device-only
   items remain undeclared-as-collected per Google's definition, with the
   substantiation page updated to match.
4. Privacy policy gains: the §9 retention schedule verbatim, the evidence-send
   conditions, and the Recovery Code / D1 data-access statement.
5. Explicit manifest/declaration statements: the Play build requests **no SMS
   permissions** for recovery and uses **no Accessibility APIs** for recovery.
6. Full-screen-intent declaration + the wizard's user-grant flow (§3 item 9).
7. Prominent-disclosure copy for the Intrusion & Evidence panel (camera
   indicator honesty line included) reviewed against the User Data policy
   pattern already in §8.
8. Listing-claims discipline: no "guaranteed recovery," no shutdown-protection
   claims, no lockscreen-capture claims, no covert-capture language anywhere.

## 12. Sources (primary first)

- Find Hub capabilities (ring 5 min on silent; Secure device lock + lock-screen
  message; Erase stops tracking; crowdsourced network): support.google.com —
  "Find, secure or erase a lost Android device" (answer/6160491); android.com,
  "What to Do if Your Phone Is Stolen or Lost."
- Theft Protection (Theft Detection Lock, Offline Device Lock, Failed
  Authentication Lock, Remote Lock requirements/limits, Identity Check, IMEI +
  SIM PIN advice): support.google.com/android/answer/15146908.
- No Find Hub app API/SDK; hardware-accessory partner program only:
  developers.google.com — Nearby Fast Pair / Find Hub partner integration guide.
- FGS background-start exemptions (high-priority FCM, BOOT_COMPLETED):
  developer.android.com — foreground-service restrictions.
- Android 15 boot-start FGS type prohibitions (microphone/camera/dataSync et al.;
  location absent): developer.android.com — Android 15 behavior changes.
- Full-screen intent default for calling/alarm apps only (from 22 Jan 2025):
  Play Console Help answer/13392821.
- IMEI/serial restriction to privileged apps (Android 10+): developer.android.com
  — best practices for unique identifiers.
- `ACTION_SHUTDOWN` protected broadcast, context-registered receivers (AOSP
  Intent documentation).
- Background camera/mic inaccessibility (Android 9+); mandatory privacy
  indicators (Android 12+): developer.android.com / AOSP platform documentation.
- Device Administration API + deprecation note; `lockNow()` /
  `USES_POLICY_FORCE_LOCK`; `wipeData()`; `onPasswordFailed` /
  `USES_POLICY_WATCH_LOGIN` (DevicePolicyManager, AOSP source):
  developer.android.com — device administration overview + API reference.
- Play Malware policy (Elevated Privilege Abuse; Ransomware guidance incl.
  device-admin consent + easy removal; Stalkerware terms): Play Policy Center,
  answer/9888380. SMS permissions restriction + named exceptions:
  answer/9888170. (No standalone Device Admin policy page exists in the current
  Policy Center index — enforcement runs through these.)
- Prey (Play listing, accessed 2026-11-02): device-admin lock/wipe, opt-in
  evidence reports, Accessibility scoped to screen-lock overlay, "Power Button
  Lock… Android 8 and lower," deactivation before uninstall.
- Cerberus (cerberusapp.com, "What happened to Cerberus app"): Play removal for
  steering to off-Play installs; "The Play Store app has no SMS commands… due to
  Google policies."
- Concurrent camera (API + guarantees): source.android.com — "Concurrent camera
  streaming" (Android 11+, `getConcurrentCameraIds`,
  `SCALER_MANDATORY_CONCURRENT_STREAM_COMBINATIONS`, s720p/s1440p ceilings);
  developer.android.com — `CameraManager` reference; CameraX `ConcurrentCamera`
  reference ("max resolution is 720p or 1440p"); Google's Jetpack Camera App
  (dual-camera gated on `FEATURE_CAMERA_CONCURRENT`; power/thermal note).
- WA audio consent: RCW 9.73.030 (all-party consent for private conversations;
  consent-by-announcement §(3); narrow exceptions §(2)) — app.leg.wa.gov.
- Sideload-install permission friction (restricted settings, Android 13+; SMS
  hard restrictions, Android 15) affects only the direct flavor's wizard copy —
  secondary sourcing; flagged as such wherever relied on.
