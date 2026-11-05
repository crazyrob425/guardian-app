# Guardian Phase 7 — Native Android, On-Device AI & Experience Packs Blueprint

*Researched and written 2026-11-02. Companion to BLUEPRINT_V2.md,
RESEARCH_V2.md and SETUP_AND_ACCOUNTS.md. Every policy verdict below comes
from the primary-source sweep in `.phase7-research/play-policy.md`; every
model, size and license in §4 was verified against official repos/docs in
`.phase7-research/ondevice-ai.md`; the pack system in §7 is the design in
`.phase7-research/pack-architecture.md`; device recovery and intrusion
evidence in §8 are the design in `.phase7-research/device-recovery.md`.
Rule of the build, same as v2:
repurpose battle-tested open source; never reinvent; never let a downloaded
file become code; never let an AI model touch the panic path.*

## Where Guardian stands today (honest audit)

- **Version:** v0.11.1. All five BLUEPRINT_V2 phases are shipped, plus
  Phase 6: the **Sis** first-run wizard (8 steps, resumable) and **free
  Supabase accounts** (`guardian-accounts` — identity + entitlement ONLY,
  RLS own-row, 30-day offline entitlement grace, nothing paywalled during
  beta). The account database holds no GPS, sessions, clients, ledger,
  bookings or vault data, and Phase 7 does not change that.
- **Form factor:** a React + Vite **PWA**. That was a deliberate Phase 0
  choice — app stores reject adult-industry apps, and a PWA installs from
  the browser with no gatekeeper. It is also now the ceiling: browsers
  cannot guarantee background GPS with the screen off, cannot run a
  microphone foreground service, cannot hear a global trigger, and can be
  killed by battery savers at exactly the wrong moment. RESEARCH_V2 put
  **Capacitor in the back pocket** with the note "revisit when browser
  limits start costing safety." This phase is that revisit.
- **What already anticipates Phase 7:** fake call v2 (v0.10) already runs
  a *live AI caller on the phone's own speech stack* (speechSynthesis +
  SpeechRecognition, branching intent scripts, 5 personas, tap-reply
  fallback) — voice interaction is a shipped feature, not a promise.
  On-device transcription was deferred in Phase 5 explicitly as "a product
  decision, not a code gap." Phase 7 makes both decisions.
- **What Phase 7 is:** (1) wrap the *same* React app in a native Android
  shell, (2) move everything safety-critical into a native foreground
  service that survives the WebView dying, (3) add a layered on-device AI
  stack — cheap ears always on during a session, speech-to-text on
  trigger, a small LLM only when asked to think, (4) reposition the base
  app as a generic solo-worker safety app, customised per career by
  signed, data-only **Experience Packs**, (5) add lost/stolen device
  recovery and intrusion evidence (§8) — the phone itself becomes a
  protected asset, in both flavors.
- **Decision D1 (§8.8) — DECIDED 2026-11-03 (Rob):** E2EE with a
  user-chosen Recovery Code. During setup the recovery-code field
  auto-populates with the app PIN the user just set — by default the
  Recovery Code *is* the app PIN — and the user may instead enter a
  separate custom code for added security. The server stores
  ciphertext + timestamps only; BNE cannot read anyone's positions.

---

## 1. Vision — one safety core, every solo worker, packs per mission

### 1.1 The repositioning

Guardian today is built for in-person adult entertainers, and every core
feature — press-and-hold panic with PIN/duress/decoy lock, mandatory
check-in/out with grace escalation, live GPS, one-way client arrival
links, screening/client log, regulars book, booking board, earnings
ledger, evidence vault, safe places, dead-man's switch, fake call,
encrypted offline outbox, free alert stack — was shaped by that work.
Almost none of it is actually specific to that work. It is the feature set
of **anyone who meets a new customer alone, 1-on-1, in a place they don't
control:**

real-estate agents at vacant properties, notaries and signing agents
carrying identity documents to strangers' homes, cleaners, handymen,
landscapers and designers working inside other people's houses, pet
sitters and dog walkers holding clients' keys and alarm codes,
photographers on location, interpreters, bookkeepers and tax preparers,
independent reporters, driving instructors, tour guides — and, in their
personal lives, adults going on a first date or visiting someone new.

The Phase 7 product is therefore:

> **Guardian (base):** a generic, 18+, personal-safety app for solo
> workers and solo meetings. One reviewed binary, one safety core.
> **Experience Packs:** signed, data-only downloads that re-word,
> re-order, re-theme and re-tune that core for a specific career or
> mission — terminology, navigation, session fields, checklists,
> templates, fake-call personas, AI vocabulary.
> **On-device AI:** the phone listens for a user-chosen safeword and for
> sounds that *might* mean trouble, and takes voice commands for the
> whole app — with every model running on the device and no audio ever
> leaving it by default.

**99.9% same features** is the literal design rule: a pack configures
engines that already exist in the binary. If an idea needs a new sensor,
a new screen type or a new network call, it is not a pack — it is an app
release (see §7.2).

### 1.2 18+ only — a hard line, not a marketing choice

The base app declares an **18+ target audience**, in the Play Console
and everywhere else. "Students" in any copy means adult students.
There is no teen mode, no pack may target minors, and no marketing may
aim at under-18s. Reason (play-policy §3.4): selecting an under-18
target-audience group attaches the **Google Play Families Policies**
(COPPA/GDPR child-data regime, disclosure of microphone/camera data
collection from children, restrictions on social apps whose focus is
meeting strangers) to an app whose ecosystem includes an adult-work
pack — a **BLOCKER** combination. It also isn't needed: every career
in the launch list is adult work. A future campus product would be a
separate product decision with separate counsel, never a pack.

### 1.3 The two front doors (plus the web side door)

One codebase, three ways in:

| Door | Who it's for | What they get |
|---|---|---|
| **Google Play** — the legitimacy door | The generic solo-worker market; users who (rightly) trust a store listing, store updates and a Data Safety section | Generic base app + generic documented packs (§2.2a) |
| **Direct APK** — the full-professional door | The original audience and anyone who can't or won't use Play | Everything in Play **plus** the full In-Person Entertainment pack and the phone-matched fake-call screens (§2.2b) |
| **Web PWA** — the side door (existing, unchanged role) | iPhone users, circle watchers and clients (who should never need an install), no-install trial | The current guardian-app.blacklisted.studio app; watch/client links keep working exactly as today |

The doors share the safety core, the account system and the privacy
architecture. They differ only where §2 says they differ, and the
differences are build-time, visible, and documented — never server-flag
unlocks (that pattern is itself a policy violation; see §2.3).

---

## 2. Distribution flavors

> ### ✅ DECIDED — Rob, 2026-11-02 ~03:48 PST: DUAL-FLAVOR
> Rob approved the two-flavor split below: **Play = generic, direct
> APK = full Entertainment pack.** It is the only shape the
> primary-source policy research supports, and it is now the locked
> distribution plan. Nothing in §7.1 (the Capacitor prototype) depends
> on it; flavor wiring lands in §7.4.

### 2.1 Why flavors exist at all

Google Play's **Inappropriate Content — Sexual Content and Profanity**
policy bans apps that "contain or promote sexual content," apps that
"promote sex-related entertainment, escort services, or other services
that may be interpreted as providing or soliciting sexual acts in
exchange for compensation," and "explicit text, or adult/sexual keywords
in the store listing **or in-app**." A pack named or written for adult
entertainers — however purely its functions are safety functions —
matches that enumerated language as a reviewer or automated scan reads
it. In the Play build that is removal-and-strike exposure.

Three more policies close the escape hatches people usually reach for:

- **Deceptive Behavior** bans "misleading reviewers as to the purpose
  and functionality of your apps," "hidden, dormant, or undocumented
  features… designed to be activated remotely," and apps that "attempt
  to modify or obfuscate behavior during review." A server-side unlock
  that reveals the adult pack after approval is a textbook violation
  of both clauses at once.
- **Device and Network Abuse** bans downloading executable code
  (dex/JAR/.so) from anywhere but Google Play — so the adult pack
  cannot be smuggled in as code either (it never needs to be: §7 packs
  are data — the problem is its *content*, not its format).
- **Malware — Stalkerware** section: listings "must not provide any
  means to activate or access functionality that violate these terms,
  such as linking to a non-compliant APK hosted outside Google Play."
  Stated there for monitoring features; the listing-must-not-route-
  around-policy principle is what review applies generally. **The Play
  app and listing therefore contain no link, button, QR code or unlock
  path to the direct edition.** The doors are separate storefronts, not
  a funnel.

### 2.2 The flavors

#### (a) PLAY flavor — `flavorPlay`

- Generic listing: solo-worker / solo-meeting safety (§9.4 copy rules).
- The base app + the generic pack catalogue, every pack **documented in
  the listing** like every other feature (§9.3): Real Estate & Showings,
  Field & In-Home Services, Pet & Home Sitting, Mobile Notary, Signing
  & Mobile Professionals, Dating & Social (base mode) — and a genuinely
  generic **"In-Person Client Sessions"** pack: client / appointment /
  address / deposit-received / check-in-out terminology shared by
  notaries, photographers, cleaners, tutors and anyone who books
  1-on-1 client appointments. It is a real pack for a real broad use
  case, written generically on purpose, with **no adult keywords,
  imagery or entertainer-specific copy anywhere in the binary, the
  listing, or any Play-delivered module.**
- Fake call ships with a convincing **generic incoming-call screen**
  (our own layout and chrome). The v0.10 phone-matched skins
  (iPhone / Samsung One UI / Pixel) do **not** ship here:
  **Deceptive Behavior** — "Apps must not attempt to mimic functionality
  or warnings from the operating system or other apps." Pixel-faithful
  mimicry is exactly what that text describes (play-policy §3.5: RISK).
- No links, unlocks, codes or references to the direct edition or the
  Entertainment pack.

#### (b) DIRECT flavor — `flavorDirect`

- Signed APK downloaded from **guardian.blacklisted.studio** (the
  existing sales site), installed by sideload, updated from the same
  host with an in-app update check.
- Everything in the Play flavor, **plus**:
  - The flagship **In-Person Entertainment pack** in full — adult
    wording, incall/outcall terminology, the discreet terminology set,
    the screening/regulars/deposit workflows front and centre. This is
    the app as it already ships at v0.11.1, finally wearing its own
    name inside its own channel.
  - The **v0.10 phone-theme fake-call screens** (Auto / iPhone /
    Samsung / Pixel / Classic), unchanged.
- Same privacy architecture, same accounts, same safety semantics.
  Direct is a *superset of content*, never a different safety core.

#### (c) Web PWA — unchanged third door

- guardian-app.blacklisted.studio keeps shipping every release as
  today. It is the iOS answer, the watcher/client surface, and the
  zero-install trial that funnels Android users to a flavor.
- Web keeps the browser speech stack for the fake-call caller; native-
  only capabilities (FGS monitoring, hardware triggers) degrade
  honestly in the UI ("AI monitoring needs the Android app") rather
  than pretending.

### 2.3 Flavor mechanics (how the split stays honest)

- Gradle **product flavors** (`play` / `direct`) over one source tree;
  differences live in flavor source sets and `BuildConfig` flags
  (`FLAVOR_PLAY`, pack-catalogue filter, call-theme registry filter).
  No runtime remote config may widen a flavor after install — that
  would recreate the hidden-feature violation the flavors exist to
  avoid.
- The Entertainment pack is **absent from the Play AAB**, not hidden in
  it: not in assets, not in strings, not in a disabled menu. Review sees
  the whole Play product because the whole Play product is there.
- **Signing reality (flagged, not hidden):** Play App Signing means
  Google's final signing key for the Play build differs from our direct
  APK key, so a user cannot cross-update between doors in place. The
  bridge is data, not signatures: both flavors support the existing
  export/import of on-device data (journal export already ships), and
  first-run Sis offers "bring my stuff from the other edition" via
  that export file. Same `applicationId` is retained so deep links,
  watch links and ntfy topics behave identically.
- Accounts are flavor-blind: a beta grant or Pro entitlement earned in
  any door holds in every door (Supabase `profiles` already works this
  way).

### 2.4 What the split costs (so the decision is informed)

- Two storefronts to keep truthful; Play review notes must be re-filed
  when pack catalogue or declarations change.
- The generic Play listing cannot borrow the flagship audience's
  language or testimonials — its proof must come from the generic
  packs' trades (which is why §7.5's launch order leads with real
  estate's association channel).
- Direct-edition users carry sideload friction forever (install
  warnings, manual updates). Mitigation is the in-app updater + the
  PWA fallback, not pretending the friction away.

---

## 3. Native shell — Capacitor, a foreground service, and a thin plugin

### 3.1 The shape

```
┌─ Web layer — the existing React app, unchanged ─────────────────┐
│  UI · sessions · circle · payments · packs theming · Sis wizard │
└──────────────▲──────────────────────────────┬───────────────────┘
        events │ notifyListeners       calls │ registerPlugin('GuardianNative')
┌──────────────┴──────────────────────────────▼───────────────────┐
│  GuardianNativePlugin (Kotlin) — THIN REMOTE CONTROL ONLY        │
│  start/stop service · arm/disarm monitoring · query status       │
└──────────────┬───────────────────────────────────────────────────┘
┌──────────────▼───────────────────────────────────────────────────┐
│  GuardianMonitorService — Foreground Service                     │
│  android:foregroundServiceType = "location|microphone"           │
│  Owns: GPS engine · AudioRecord · Tier 0/1 models · escalation   │
│  state machine · hardware triggers · alert outbox flush          │
│  Survives WebView death, app swipe-away, screen off, lock.       │
└──────────────────────────────────────────────────────────────────┘
```

Capacitor (ionic-team/capacitor, MIT — already vetted in RESEARCH_V2
#35) wraps the existing Vite build. The custom plugin follows
Capacitor's official local-plugin pattern: a typed TypeScript interface
via `registerPlugin<GuardianNativePlugin>('GuardianNative')`, a Kotlin
`@CapacitorPlugin` class with `@PluginMethod`s, registered in
`MainActivity`, pushing long-lived events (safeword hit, escalation
state change, GPS state) to the web layer with `notifyListeners`.

**The load-bearing rule: the plugin is a remote control, never the
engine.** Anything that must work while the user is in danger lives in
the native service. If the WebView is killed, the app swiped away, or
the phone locked, the service keeps tracking, listening and escalating,
and the WebView re-syncs from service state when it returns. A design
where monitoring lives in WebView JavaScript is disqualified on safety
grounds — that was the PWA's ceiling and the entire point of going
native.

### 3.2 The foreground service

- **Types (Android 14+, API 34):** declares `location` +
  `microphone` foreground-service types in the manifest, holds
  `FOREGROUND_SERVICE_LOCATION` + `FOREGROUND_SERVICE_MICROPHONE`,
  and passes the types to `startForeground()`. Missing any piece
  throws — the declaration set in §9.1 mirrors this exactly.
- **Lifecycle is user-initiated, always.** `RECORD_AUDIO` and location
  are *while-in-use* permissions: a microphone/location FGS **cannot
  be created while the app is in the background**, and Android 15 bars
  `BOOT_COMPLETED` receivers from launching a microphone FGS at all.
  Guardian treats this as a consent feature, not a constraint to route
  around: monitoring is armed by an explicit in-app action at session
  start (§5.1), the service runs for that session, and it stops at
  check-out, stand-down or session end. No auto-arm on geofence, no
  resume-after-reboot **for microphone or camera monitoring** — the
  user re-arms monitoring, every time, in the open. One scoped
  exception, and it is location-only: a setup-consented recovery
  beacon with a persistent notification may start from
  `BOOT_COMPLETED` when the device is in lost mode (§8) — the only
  boot-startable shape Android 15 permits, and it carries no
  microphone or camera with it.
- **Persistent notification** for the whole armed period ("Guardian is
  on watch — tap to open, long-press to stop"), with the Android 12+
  green mic indicator while the mic is hot. There is no covert mode
  and Phase 7 does not want one: the notification is the trust
  artefact, and §9's Spyware defence depends on it existing.
- **GPS:** the Phase 1 tracking engine (Traccar-style filtering,
  Kalman smoothing, adaptive cadence, Dexie offline outbox) moves its
  *feed* into the service: same PosMsg v2 semantics, same 2 s panic
  cadence, but the position stream no longer dies with the browser tab.
  The web layer remains the publisher/renderer; the service is the
  source of fixes and the guarantor that the outbox flushes.
- **Escalation state machine lives here too** — missed check-out
  timers, silence escalation, dead-man's switch countdown and the
  §5.3 audio ladder run natively, so a killed WebView cannot strand a
  pending escalation.

### 3.3 Hardware & system triggers (native-only, honestly scoped)

- **Quick Settings tile:** "Start Guardian watch" / panic tile.
- **App widget + lock-screen shortcut:** start session, check in,
  trigger fake call — no unlock-then-navigate fumbling.
- **Shake trigger** (accelerometer, in-service): the multi-trigger SOS
  BLUEPRINT_V2 honestly limited to in-app `devicemotion`; the service
  makes it real with the screen off. Sensitivity tuned against
  false positives (running, driving) and off by default until the user
  drills it in the wizard.
- **Volume-button sequence** (e.g. three down-presses while a session
  is armed): implemented as an in-service listener during sessions
  only. Scoped honestly: Android reserves the power-button SOS gesture
  to the OS, and Guardian does not fight the OS for it — in the wizard
  Sis teaches the user that their phone's built-in 5-press SOS and
  Guardian's triggers are *different nets*, and to set up both.
- Every hardware trigger feeds the same deterministic panic path as
  the on-screen press-and-hold (§4.4). None of them passes through AI.

### 3.4 Panic presentation

- **Full-screen intent notification** for panic/missed-check-out so the
  alarm UI takes the screen even when locked.
- **Do-Not-Disturb bypass:** the alarm audio stream uses the alarm
  channel and requests notification-policy access (user-granted, in
  the wizard's permissions step, with the reason stated) so a silenced
  phone still sounds *Guardian's own* alarm — the existing six sounds +
  bring-your-own library, now played by the native audio engine, with
  the Panic PIN Lock semantics unchanged: every stop path routes
  through the PIN pad, the duress PIN silences but fires the silent
  coercion alert, and the audio engine refuses to stop while locked.
- Stand-down, check-out and SOS dismiss keep exactly their v0.4.1+
  behaviour; native changes *who survives to execute them*, not what
  they mean.

### 3.5 Secure storage & identity

- Identity keys (X25519, shipped Phase 3), session keys and entitlement
  cache move from browser storage to **Android Keystore-backed**
  storage via the plugin; the web layer asks, the native side holds.
- PINs stay **Argon2id** (`crypto_pwhash`, shipped Phase 3) — native
  changes the storage location, not the KDF. Passkey unlock (Phase 3)
  remains a local unlock factor.
- Model files and pack files live in app-private storage
  (`filesDir`), hash-verified on install (§4.5, §7.6). Nothing
  safety-related is stored on shared/external storage.

### 3.6 Build-flavor wiring

- One Gradle project, `flavorDimensions "channel"`, `play` + `direct`
  product flavors over the Capacitor Android project; web assets are
  built per flavor (pack catalogue + theme registry filtered at build
  time by the same `BuildConfig` flags the native side reads).
- CI builds three artefacts per release from one commit: Play AAB,
  direct APK, and the PWA `dist/` — version-locked, so a bug report
  names one build number across all doors.
- Capacitor and every native dependency are **version-pinned**; the
  native module's test matrix is Pixel (Tensor) + one mid-range
  Snapdragon + one low-end device (§7 gates).

### 3.7 Bluetooth remote triggers — a silent hand on the controls

*Added 2026-11-04 (Rob's directive). The reference hardware is the
commodity scrolling-ring category sold for social-media scrolling —
reference unit: WEWAHIVER "TikTok Scrolling Ring Remote Control"
(Amazon B0G7FMZ87T, ~$15): a finger ring with **completely silent
buttons**, an adjustable band, USB-rechargeable, offering scroll
up/down, swipe left/right, pause/play, likes and volume +/−. The
product insight is the form factor: a trigger she wears on her hand,
silent, operable by feel, while the phone sits in a bag across the
room. §3.3's triggers all live on the phone; this one doesn't.*

#### 3.7.1 The input layer — standard HID, no SDK, no device table

- Rings in this class pair as ordinary **Bluetooth HID** devices. To
  Android the ring is a small keyboard / media controller / mouse:
  its buttons arrive as standard `KeyEvent`s — typically
  `KEYCODE_MEDIA_PLAY_PAUSE` (center button), `KEYCODE_DPAD_UP /
  DOWN / LEFT / RIGHT` (the pad; some clones send media next/previous
  or page keys instead), and `KEYCODE_VOLUME_UP / DOWN`. The "like"
  button varies most by clone. **No vendor SDK exists, none is
  needed, there is no companion app and no account** — nothing about
  the device phones home, and Guardian never ships a per-device
  compatibility table. Universality is a property of the protocol,
  not of a brand list: any HID ring, selfie remote or presentation
  clicker is a candidate device.
- **Two receive paths, honestly scoped:**
  1. **MediaSession path (phone put away).** During a live session
     the §3.2 foreground service holds an active `MediaSession`;
     Android routes Bluetooth *media-class* button events
     (play/pause, next/previous — the ring's center button class) to
     that session's callback / media-button receiver with the
     screen off and the app backgrounded. This is the supported
     route and the one the default mapping leans on.
  2. **Foreground path (Guardian on screen).** The native plugin's
     activity-level `dispatchKeyEvent` capture hears *every* learned
     key — pad, volume, enter-class keys included — while a
     Guardian activity is in front (session screen, fake-call
     screen, lock-screen activity), before the WebView or the
     system default sees it.
- Learn mode labels every learned button with its delivery class —
  **"works with the phone put away"** (media class) vs **"works
  while Guardian is on screen"** (everything else) — so nobody
  discovers mid-session that a button needed the screen on.
  Accessibility services are **not** used to widen capture: Play's
  accessibility policy and this audience's optics both forbid it,
  so background capture of non-media keys is out of scope, stated
  plainly rather than papered over.
- **Mouse mode is detected, not supported.** Rings in this class
  commonly carry a second mode in which the pad moves an on-screen
  pointer and the center button clicks (HID mouse). Pointer input
  cannot be captured in the background, and click coordinates are
  not a trigger surface Guardian will ever act on. Learn mode
  detects the mode — presses that move a pointer, or produce no
  key events at all, fail the capture test — and walks the user
  through flipping the ring into its keyboard/media mode (a
  device-side toggle; the wizard gives the generic guidance, since
  the toggle's location varies by clone) before learning proceeds.
- **Connection awareness.** The service watches the learned
  device's HID connection state for the session's duration. The
  arm-time readiness checks (§8.2 pattern) gain one line: if a
  learned remote is mapped but not connected when a session arms,
  Sis says so — *"your ring isn't connected"* — a fix made in the
  calm before, not a discovery made in the moment.

#### 3.7.2 Learn mode — the pairing wizard

Because every clone wires its buttons differently, Guardian learns
the user's actual remote instead of recognising models. Learn mode
lives as a Sis step (§8.2 pattern) and as a settings panel,
**Remote Triggers**:

1. **Pair** in Android's Bluetooth settings — standard system
   pairing; Guardian runs no pairing dance of its own.
2. **Press each button** on the ring, one at a time. The wizard
   captures keycode + scan code per press, plays back what it heard
   in plain language, and tags the delivery class (§3.7.1).
3. **Mode check** — the mouse-mode test above; no learning on a
   pointer.
4. **Assign actions** — the §3.7.3 defaults arrive pre-filled;
   every assignment is changeable, per button, in one list.
5. **The volume disclosure** (§3.7.3) is read and accepted — or
   volume keys are excluded — before any mapping that uses them
   can save.
6. **Drill** — each mapped control is fired once in test mode,
   same discipline as the §3.3 shake trigger: remote triggers are
   off by default until drilled.

Multiple remotes can be learned (a ring plus a selfie remote);
mappings are per-device, keyed to the device's Bluetooth identity,
and stored in the Keystore-backed storage of §3.5. A different
unit that merely shares a product name inherits nothing until it
has been learned.

#### 3.7.3 The mapping — dedicated buttons first, patterns second

Defaults for the reference ring's layout (everything remappable):

| Ring control | Typical key event | Default action |
|---|---|---|
| Center (single press) | `KEYCODE_MEDIA_PLAY_PAUSE` | Mark safe / check in — warning level resets to 1 |
| Center (long press ≥ 1.5 s) | same, held | **Panic** — the deterministic panic path: SOS + GPS to her circle |
| Pad up | `KEYCODE_DPAD_UP` | Escalate warning one level |
| Pad down | `KEYCODE_DPAD_DOWN` | De-escalate one level (short of a full mark-safe) |
| Pad right | `KEYCODE_DPAD_RIGHT` | Start Fake Call — incoming call lands within a few seconds |
| Pad left | `KEYCODE_DPAD_LEFT` | **Off by default** — recommended assignment: start live A/V streaming to her circle (opt-in, §3.7.5) |
| Volume + / − | `KEYCODE_VOLUME_UP / DOWN` | **Unmapped by default** — see the volume rule below |

Press patterns are the second layer, and the only layer a
one-button device has. Any learned button additionally supports
single / double / triple / long-press; the single-button defaults
are: single = mark safe, double = escalate, triple = start Fake
Call, long press (≥ 1.5 s) = panic. A deterministic state machine
in the service does the recognising (≈400 ms multi-tap window,
800 ms long-press threshold for non-panic actions, 1.5 s for
panic). No AI touches this path (§4.4's rule) — it is the §5.4
grammar idea rendered in clicks instead of words.

**The volume rule (binding copy + behaviour).** If she maps the
ring's volume keys, those presses become Guardian controls during
an armed session and *stop being volume buttons* on the
foreground path; on the put-away path their behaviour is
OEM-dependent and they are labelled on-screen class. The wizard
says this in plain words before such a mapping can save —
*"While a session is running, these buttons stop changing your
volume and become Guardian buttons"* — and offers **"Don't use
my volume buttons"** as a first-class choice. Default is unmapped:
for many users the ring's pad and center button are the whole
surface, and the phone's volume is never touched.

#### 3.7.4 In session — service behaviour and feedback

- **Armed-session fence.** Remote input is live only while a
  session is armed (the §5 fence). Outside a session the ring is
  jewellery: the service isn't holding the session open, and even
  with Guardian in front, unlearned or out-of-session presses do
  nothing Guardian-side. A desk keyboard paired to the same phone
  fires nothing either — only learned devices resolve to intents.
- **One action bus.** A recognised press resolves to the same core
  intents as §6.2's voice commands (`checkIn`, escalate,
  `triggerFakeCall`, the deterministic panic, `startStreaming`),
  so behaviour, stand-down semantics and the session feed are
  identical whichever channel fired. The feed logs the channel
  (`remote: center long-press`) — the record shows how an action
  was triggered, which matters when a session is reviewed later.
- **Silent, screen-free feedback.** A firing changes nothing on
  the display — no toast, no flash, nothing for a client glancing
  at the phone to notice. Confirmation is haptic only: one short
  buzz for received (mark-safe, escalate, de-escalate), two for
  Fake Call armed, one discreet pulse for panic (configurable
  off). Nothing audible at any setting.
- **Fake Call timing.** A remote-started fake call rings after a
  short randomised delay (seconds), so it reads as an incoming
  call arriving on its own — not as a thing she just did with
  her hand.
- **Cost.** The service was already running and holding the
  MediaSession (§3.2); the recogniser adds no wake locks and no
  polling. The ring side is a rechargeable coin-cell-class
  device. Battery accounting lands in §4.6's table when 7.2
  measures it — no claim is published before then.

#### 3.7.5 Guardrails (binding)

- **Panic is deliberate, by construction.** Factory default is a
  sustained ≥ 1.5 s hold, and the wizard *refuses* to map panic to
  anything lighter than a double-press or a ≥ 1.5 s hold. No
  single stray tap — pocket, handbag, a fumbled ring — can fire
  panic.
- **The remote fires; it never cancels.** Stand-down, panic stop
  and session end keep exactly their §3.4 semantics: the PIN pad
  is the only stop path, and the duress/decoy meanings are
  unreachable from the remote. Mark-safe during an active panic
  does what an on-screen check-in does during one — it does not
  stand the panic down. A lost or stolen ring is a trigger, not
  a key: it unlocks nothing, opens nothing, and shows nothing —
  no Guardian UI appears when it fires.
- **Streaming is opt-in, never a default.** Assigning live A/V
  streaming to a button requires the §5 consent-fence explanation
  (what streams, to whom, when it stops) at assignment time, not
  buried in settings later.
- **Unlearning is one tap** (Settings → Remote Triggers), and
  every remote action keeps its on-screen and voice equivalents —
  losing the ring mid-tour costs convenience, never capability.

#### 3.7.6 Two stealth channels — voice and hardware

§5.4 and §6 gave her the first silent channel: key phrases worked
naturally into a Fake Call — *Mom, manager, whoever's "calling"* —
that escalate, stream, or stand the warning level back down to 1
without leaving the conversation. The ring is the second channel,
for the moments voice itself is the risk: he's listening as
closely as the AI is, she's mid-sentence, she's smiling — and her
thumb finds a silent button in her palm. The two channels cover
each other's failure modes (hands busy vs. can't speak), resolve
to the same deterministic intents, pass through no AI model, and
either can be disabled without weakening the other. That pairing —
voice for the room, hardware for the hand — is the feature; the
$15 ring is just its cheapest peripheral.

#### 3.7.7 Platform scoping (honest)

| Platform | Support |
|---|---|
| Native Android (both flavors) | **Full.** MediaSession put-away capture for media-class keys, foreground capture for all learned keys, learn mode, patterns, drill. Which *actions* a press can fire follows each flavor's existing feature rules (§2.2) — the input layer itself is flavor-neutral. |
| Web PWA | **Limited.** While the Guardian tab is open and in front, the page hears media/pad keys (KeyboardEvent / Media Session API) and learn mode works — every button labelled on-screen class. Screen off or tab backgrounded: nothing. That is the browser ceiling from the audit, not a choice. |
| iOS | **Not promised.** Third-party apps have no background key-event path for accessories in this class; until that changes, remote triggers are out of scope on iOS rather than half-shipped. |

Lands with the **7.2 step** — the session service and voice
commands v1 share the intent bus this plugs into, and it ships
behind the same release gate.

---

## 4. On-Device AI — three small models, three different jobs

*The whole section follows `.phase7-research/ondevice-ai.md`. The
headline finding, stated once and enforced everywhere below: **a
continuously-running LLM is a battery/thermal impossibility; a
continuously-running keyword spotter + VAD is a ~21 MB, sub-0.5 W
problem.** Guardian therefore ships three separate small models doing
three different jobs — never one LLM listening.*

### 4.1 The layered stack

| Tier | Job | When it runs | Engine (verified) | Size |
|---|---|---|---|---|
| **0 — Ears** | Safeword spotting, voice-activity gating, sound-event flags | Whole armed session | sherpa-onnx KWS + Silero VAD + YAMNet (TFLite) | **~21 MB total** |
| **1 — STT** | Voice commands; trigger-clip transcription | On speech / on trigger | sherpa-onnx streaming Zipformer 20M; whisper.cpp base.en; Vosk small (low-end) | 20–142 MB, in the AI pack |
| **2 — Brain** | Free-form speech → structured app actions | On demand only, unloaded after | LiteRT-LM + FunctionGemma 270M (default); Gemma 3 1B (optional); Qwen2.5-1.5B (alt) | 288 MB / 529 MB downloads |

### 4.2 Tier 0 — always-on cheap ears (~21 MB, Apache-2.0/MIT throughout)

- **Custom safeword: sherpa-onnx KWS** (k2-fsa/sherpa-onnx, ★11,699,
  Apache-2.0). Chosen because it is the only candidate with
  **open-vocabulary** keyword spotting: any phrase can be enrolled at
  runtime as tokens with per-keyword boosting + threshold — *no
  retraining, no vendor account, no per-device fee, no key that can be
  revoked.* The user's own secret safeword ("pineapple", "blue
  folder") becomes a keyword-file entry in seconds. Ship the English
  GigaSpeech KWS model (3.3M params, ~15 MB; its README declares
  Apache-2.0); do **not** ship the zh-en KWS model until its missing
  license file is clarified. **Picovoice Porcupine is rejected on
  licensing structure** (AccessKey + commercial agreement +
  Console-trained words) despite excellent tech; it is the named
  fallback only if sherpa's false-alarm rate fails §7.3 field tests.
  openWakeWord is rejected (pre-trained models are CC BY-NC-SA
  non-commercial; custom words need a training run per word).
- **Voice-activity gate: Silero VAD** (MIT, ~2 MB, <1 ms per 30 ms
  chunk on one CPU thread), via sherpa-onnx's built-in support — one
  native runtime for VAD + KWS + streaming ASR. Pipeline:
  `AudioRecord 16 kHz mono → Silero VAD → only speech-like or loud
  frames reach KWS / YAMNet / the ring buffer.` Silence costs almost
  nothing.
- **Sound events: YAMNet** (TFLite, ~4 MB, Apache-2.0; 521 AudioSet
  classes incl. *Screaming, Shout, Yell, Glass breaking, Slam, Thud,
  Crying/sobbing, Whimper, Groan*), run ~1×/second **only while the
  VAD/loudness gate says something is happening**. PANNs CNN14 and the
  transformer classifiers (AST/BEATs) are rejected for Tier 0
  (300 MB-class, server-shaped).
- Plus a plain energy/loudness detector (code, no model).

### 4.3 Tier 1 — offline speech-to-text (two jobs, two engines)

- **Live commands → sherpa-onnx streaming Zipformer** (`…-en-20M`
  int8, ~20 MB): already in-process for KWS; streaming partials in
  ~200–500 ms chunks make voice control feel instant.
- **Trigger clips / journal transcription → whisper.cpp base.en**
  (MIT; 142 MB, ~388 MB RAM): the accuracy reference for offline phone
  STT; windowed, a few seconds for a 30 s clip on mid-range hardware.
  tiny.en (75 MB) on low-end. This finally ships Phase 5's deferred
  on-device transcription — journal/evidence text, audio never leaves
  the phone.
- **Low-end fallback → Vosk small** (Apache-2.0; 40 MB, ~300 MB RAM)
  with a **restricted command grammar**: deterministic, and the grammar
  restriction *raises* command reliability on weak hardware.
- Base APK carries the sherpa runtime (Tier 0 + streaming ASR).
  Whisper/Vosk ship in the downloadable AI pack (§4.5), never bundled.

### 4.4 Tier 2 — the small LLM, and the rule that governs it

- **Runtime: LiteRT-LM** (google-ai-edge, Apache-2.0) — Google's
  production successor stack with a native Kotlin API (CPU/XNNPACK,
  GPU, NPU backends); **MediaPipe LLM Inference is deprecated in its
  favour — do not start new work there.** Pin the version (the line is
  pre-1.0 and moving fast); llama.cpp + GGUF is the documented escape
  hatch (its GBNF grammar-constrained sampling can make invalid JSON
  *impossible to emit*). MLC LLM is the alternative if iOS/desktop
  model parity is ever wanted, at the cost of per-GPU model compiles.
- **Default model: FunctionGemma 270M** (~288 MB download, ~550 MB
  RAM) — purpose-built to turn *"start a session with Marcus at nine,
  one hour, deposit paid"* into a structured function call against
  Guardian's ~15-action schema (Google's own figures: ~58% base
  accuracy on mobile actions, **~85% after fine-tuning on your own
  function set** — a tiny fixed action set is the ideal fine-tune
  target; fine-tuning is a v2 step, §7.5).
- **Optional free-form pack: Gemma 3 1B IT** (int4 `.litertlm`,
  529 MB; ~47 tok/s CPU / 56 GPU on S24 Ultra per Google's cards,
  derate 30–50% mid-range) for rambling booking dictation, journal
  summaries, "explain this alert." Realistic mid-range expectation for
  the 1B class is 15–35 tok/s — plenty, because Guardian's outputs are
  *short*: a function call is 30–80 tokens ≈ 1–4 s end-to-end.
- **License-clean alternative: Qwen2.5-1.5B** (Apache-2.0 weights).
  Gemma-family weights ship under the **Gemma Terms of Use** (not OSI;
  commercial use permitted with acceptable-use conditions) — legal
  reads them once before launch; if they ever bite, Qwen is the swap.
  Llama 3.2 is third choice (Community License, more encumbered, no
  capability win at this size). **Gemma 3n E4B is rejected**
  (4.2 GB, ~9 tok/s, thermal-hostile); E2B (2,965 MB) is a
  flagship-only optional experiment, never the default.
- **THE RULE — the LLM proposes; deterministic code disposes.**
  Model output is parsed, validated against a JSON Schema in Kotlin,
  and only then executed — or rejected with a clarifying question.
  Raw model output is never executed.
- **Panic, duress and alert-sending NEVER touch the AI.** The LLM may
  *request* `extendSession` or `triggerFakeCall`; a Kotlin validator
  checks session state. Safeword hits, the §5.3 ladder, dead-man's
  switch, hardware triggers and the panic button are deterministic
  native paths with no model in the loop, gated on nothing the LLM
  thinks.

### 4.5 Model delivery — models are data, downloads are disclosed

- Models are **data files executed by a runtime already in the app**,
  not dex/JAR/.so — outside the Device and Network Abuse download ban,
  and the same policy carves out VM/interpreter code with only
  indirect API access (play-policy §2.4). The conditions that keep
  this clean are followed literally:
  - Every model download is **user-tapped, prompted, and size-
    disclosed before it starts** (Deceptive Behavior §3.2's CDN rule —
    model packs are large, so this matters): "Guardian AI Pack —
    288 MB, Wi-Fi recommended," per-model sizes listed.
  - The feature is **documented in the listing** (Behavior
    Transparency, §9.3): on-device voice control + audio monitoring
    are named features, not surprises.
  - A model's functions stay **within the disclosed safety features**;
    a remotely delivered model that unlocked undisclosed behaviour
    would re-enter Backdoor territory. Model files are hash-pinned
    and signature-checked like pack files (§7.6).
  - Where Play Asset/Feature Delivery can carry the weights, prefer
    it — it removes the argument entirely.
- Models live in app-private storage, are loaded on demand and
  **unloaded after use**, and are never in the base APK beyond the
  ~21 MB Tier 0 set + the 20 MB streaming ASR.

### 4.6 Device tiers & low-end fallbacks

| Device | Tier 0 | Tier 1 | Tier 2 |
|---|---|---|---|
| **Low-end** (≤4 GB RAM) | Full — it is designed for this; YAMNet cadence reduced | Vosk small grammar commands; whisper tiny.en clips | **No LLM.** Deterministic grammar/intent parser over Vosk output covers the fixed command set — *more* reliable than a 270M model for fixed commands, just less flexible |
| **Mid-range** (6–8 GB) — the design target | Full | Zipformer streaming + whisper base.en | FunctionGemma 270M |
| **Flagship** (8 GB+, modern NPU/GPU) | Full + faster YAMNet cadence | Same | + Gemma 3 1B free-form pack; NPU builds where Google ships them |

Battery/thermal budget (engineering **estimates** from the research —
to be *measured*, §7 gates, before any number is published): Tier 0
sustained ~150–350 mW (~3–7% of a ~15 Wh battery per 1–2 h session),
YAMNet bursts +~1–2%, GPS +~2–4% (GPS and radios rival or exceed the
mic tier — the AI is not the dominant cost). An LLM burst is 3–8 W for
2–5 s — negligible per command, and ~25–50%/hour if run continuously,
which is precisely why it never is. Design rules: duty-cycle YAMNet
behind the VAD gate; drop KWS cadence under 20% battery or on thermal-
throttling signal (`PowerManager` thermal status); after a user's
first monitored session, show *their* measured %/hour on their device.

---

## 5. Audio monitoring — listening for trouble, inside a consent fence

### 5.1 The only shape it ships in

Non-negotiables, each one traceable to a named policy in §9 or to the
platform constraints in §3.2:

1. **Session-only.** Monitoring exists only inside an armed session.
   No session, no listening. Ever.
2. **User-armed, in the foreground.** The user turns it on at session
   start (a distinct toggle in the session-start flow, defaulting to
   the choice they made last time, never silently on). Android's
   while-in-use rules make background self-starting impossible anyway
   — Guardian's UX says so out loud: "Only you can start this."
3. **Persistent notification + mic indicator** for the entire armed
   period (§3.2). Stopping is one tap from the notification.
4. **On-device only.** Audio is analysed on the phone. Nothing is
   recorded to storage, streamed, or uploaded by the monitoring path.
   What can leave the phone is an *alert* (the existing encrypted
   session channel) after the ladder in §5.3 decides — and, only if
   the user opted in, a trigger-clip transcription in their own
   on-device evidence journal.
5. **Prominent disclosure + affirmative consent** before the first
   arming (§9.2), in the normal usage flow, naming the data and what
   happens to it — not buried in a privacy policy.

### 5.2 The buffer

- `AudioRecord` 16 kHz mono feeds a **rolling ring buffer in RAM
  only (~2 minutes)**. It exists so a trigger can transcribe *context*
  (the seconds before a shout), and it is overwritten continuously.
  It is never written to disk by the monitoring path; process death =
  buffer gone.
- VAD gates everything downstream (§4.2): silence and steady room tone
  cost almost nothing and produce no events.
- User-visible state at all times: armed / triggered-checking /
  escalated, in the notification and the session screen.

### 5.3 The escalation ladder — sound classification never fires panic

YAMNet was trained on YouTube audio. It can flag a scream; it **cannot**
tell a distress scream from consensual loud sex, a TV, or laughter —
no model surveyed claims otherwise, and for Guardian's flagship
audience that ambiguity is the normal case, not an edge case. Audio
events are therefore **one input to a ladder, never a panic trigger**:

```
Tier 0 event (YAMNet flag and/or distress-phrase candidate)
  1. HAPTIC CHECK — strong buzz pattern + notification spike.
     No response needed yet; most false alarms die here unnoticed
     by anyone but the user.
  2. SPOKEN CHECK (if no cancel in ~10 s) — quiet TTS through the
     phone: "Guardian check — say 'I'm OK' or tap your phone."
     Audible near the phone, phrased to sound like a reminder app.
  3. CANCEL WINDOW (~15 s) — cancel by voice (cancel grammar, §5.4),
     by tapping the notification/session screen, or by shaking.
     Cancel = stand down + log a false-positive event (§5.5).
  4. SOFT ESCALATION (no cancel) — per the user's ladder setting:
     default = fire the fake call (an exit, not an alarm); variant =
     coded "come get me" quick message to the circle.
  5. FULL ESCALATION (still nothing, or a second trigger inside the
     window) — circle alert over the existing encrypted channel with
     location + "audio check unanswered" — the confirmation-ladder
     machinery from Phase 2 takes it from there (acks, silence
     re-escalation, She's Safe).
```

**The safeword is different from a sound flag, on purpose.** A safeword
hit is a *deliberate user command*, detected by KWS, not a classifier's
guess. It enters the ladder at step 3 with a short cancel window
(protecting against KWS false alarms — spotting the word in TV dialogue
is a real failure mode), then executes the user's pre-chosen safeword
action: fake call now, or full circle alert. The user picks the action
at enrollment (§5.4) and can rehearse both in a drill mode that alerts
nobody. Distress *phrases* spotted by STT ("help me", "get off",
"stop" + raised-voice gate) enter at step 1 like sound flags — phrase
spotting is fallible, and the ladder prices that in.

### 5.4 Safeword enrollment UX & the cancel grammar

Enrollment is a Sis-wizard-style flow (also in Settings → AI
Monitoring), designed to take under two minutes:

1. **Pick the word.** Free choice (open vocabulary — §4.2) with
   guidance: pick something you can drop into a sentence ("we should
   order **pineapple** later"), not a word the situation itself makes
   likely ("stop", "no", "help" are offered as *distress phrases*,
   not safewords). The active pack's `suggestedSafewords` (§7.3) seed
   the suggestions per trade ("blue folder", "comparables").
2. **Say it three times** — normal voice, casual-sentence voice,
   quieter voice. Each attempt gets a live detection readout; the flow
   tunes the per-keyword threshold/boosting until all three hit.
3. **Noise test.** The flow plays ordinary room noise (and the user
   can run it against their TV) to confirm no false hits at the tuned
   threshold, and shows the trade-off slider plainly: *catches more /
   cries wolf less*.
4. **Choose the action** (fake call / circle alert — §5.3) and
   **run the drill**: say it, watch the ladder climb in drill mode,
   cancel it. An undrilled safeword is a decoration; the wizard does
   not mark monitoring "ready" until one drill completes.
5. **Change it any time**, instantly, on-device — no account, no
   server, no waiting. Re-drill nudged after a change and quarterly.

**Cancel grammar** (Tier 1 grammar, deliberately tiny and forgiving):
"I'm OK", "I'm okay", "cancel", "stand down", "false alarm", the
user's own chosen all-clear phrase — plus any tap on the notification,
the session screen, or the hardware cancel (volume sequence). A cancel
spoken/done with **duress semantics** (the duress PIN on the PIN pad,
or a user-set duress all-clear phrase) *appears* to cancel — and
silently escalates to the circle instead, exactly as the duress PIN
already behaves on the lock path. That symmetry is a core invariant;
packs cannot alter it (§7.2).

### 5.5 False-positive learning — on-device, from cancels only

- Every ladder event the user cancels is logged **on-device** with its
  feature context (which model fired, scores, VAD profile, pack sound
  profile) — **not** raw audio, unless the user separately opted into
  trigger-clip journaling.
- Adaptation is local and bounded: repeated cancels of the same event
  class in similar conditions nudge that class's threshold up inside
  hard core clamps; a missed-event report (user taps "it missed
  something" after a session) nudges down. No model is retrained, no
  data leaves the phone, and Settings shows the current sensitivity
  in plain words with a reset.
- Session review (opt-in prompt at check-out, one tap to dismiss
  forever): "Guardian checked on you twice — both false alarms?"
  Feeds the same local log. This labelled, user-owned corpus is also
  the only honest path to a future Guardian-specific distress head on
  YAMNet embeddings (research §1c) — a v2 research item, never a
  launch claim.

---

## 6. Voice control — the whole app, by talking

### 6.1 Principle

Voice control is a **new front end on existing actions**, not new
features. Every intent below maps to an app action that already exists
at v0.11.1 (or ships earlier in Phase 7); the speech stack (§4.3/§4.4)
turns speech into a validated call against this registry, and the app
confirms back in speech (TTS) + on screen. The deterministic grammar
parser (Vosk/Zipformer + intent lexicon) is the *primary* path —
reliable, offline, works with no LLM installed. The Tier 2 LLM is the
*flexibility layer* for free-form phrasing ("the guy from Tuesday,
same hotel, push it an hour") on devices that have it.

### 6.2 The command surface (v1 registry)

| Intent | Example | Maps to |
|---|---|---|
| `startSession` | "Start a showing with Dana, 45 minutes" | Session start (DateSetup → Session) with pack fields prefilled |
| `endSession` / check-out | "I'm safe, end it" | Check-out + She's Safe status |
| `checkIn` | "Check me in" | In-session check-in |
| `extendSession` | "Extend me thirty" | Session timer extend |
| `triggerFakeCall` | "Fake-call me in two minutes as Jess" | Fake call scheduling (pack personas) |
| `sendCodedMessage` | "Send the pizza one" | Coded quick messages (🍕/📞/🚗/💬 set + pack templates) |
| `armMonitoring` / `stopMonitoring` | "Start listening" / "Stop listening" | §5 arming toggle (foreground confirm if app is open; never arms from background — §3.2) |
| `nearestSafePlace` | "Where's my nearest safe place?" | Safe places (spoken name + distance) |
| `queryStatus` | "How long have I got?" / "Who's watching?" | Timer, watcher presence, battery — spoken answer |
| `logClient` / `lookupClient` | "Log this number…" / "Have I seen him before?" | Client log + screening verdict (on-device) |
| `addBooking` | "Book Marcus, Friday nine, deposit paid" | Booking board (+ ledger deposit entry) |
| `logPayment` | "Log 200 cash" | Earnings ledger entry |
| `followUp` | "Send the thank-you to Marcus" | Regulars 3-step follow-up flow |
| `startDeadMansSwitch` | "Dead-man me till 9 a.m." | Dead-man's switch arm |
| `panicPhrase` | user-set spoken panic phrase | **Deterministic path** — straight to the panic sequence, §4.4 rule; not an LLM intent |

Safety-critical confirmations: `endSession`, `stopMonitoring` and any
alert-affecting command spoken while *no* session is live require the
app to read the command b
back and take a confirming tap or
"yes" before executing; inside a live session the same commands
execute immediately (the user may have seconds, not attention to
spare) and are logged to the session feed.

### 6.3 Per-pack AI lexicon

Voice is where packs stop being skins. The pack manifest's `ai` block
(§7.3) supplies, for **existing intents only**:

- **Synonym phrases** per intent ("start a showing", "I'm at a
  viewing", "open house starting" → `startSession`).
- **Slot vocabularies** the STT/grammar and the LLM use to fill
  fields: property types, pet species + meds vocabulary, document
  types, trade job types.
- **Counterpart/session nouns** so confirmations speak the trade's
  language back ("Showing started with Dana — 45 minutes").
- **Suggested safewords** (§5.4) and a **sound-profile selection**
  (bundled threshold preset by id — never raw numbers, never weights).

A pack cannot add an intent, a slot that writes to a field type outside
the §7.3 whitelist, or a phrase that triggers panic — the panic phrase
is user-set and core-owned. Lexicon QA is part of the pack gate (§7.6):
the core's intent tests run parameterised by each pack's lexicon and
personas.

---

## 7. Experience packs — signed data, never code

*Full design: `.phase7-research/pack-architecture.md` §1. This section
is the build contract.*

### 7.1 The load-bearing principle

**Engines in the binary, packs are data.** Every capability a pack can
touch must already exist, reviewed, inside the shipped binary. A pack
configures engines; it never adds one. This is what keeps downloads
inside **Device and Network Abuse** (no executable code — dex/JAR/.so —
from anywhere but Play; packs need neither the prohibited path nor the
JS-interpreter exception: **a pack contains no JavaScript either**), and
it keeps every pack's behaviour auditable before it reaches a user.

| Engine (in the binary) | What a pack feeds it |
|---|---|
| i18n / labels layer | Terminology map (namespaced string bundle) |
| Router + screen registry | Nav order/visibility/renames over existing screens |
| Theme system (incl. call-screen themes) | Colour/typography/icon tokens from a whitelist |
| Session setup form | Custom-field definitions for the generic field renderer |
| Checklist renderer | Checklist item lists per phase |
| Template engine | Message templates with a placeholder whitelist |
| Fake-call persona runner | Persona records in the existing branching-script schema |
| Speech stack (Phase 7) | Lexicon/slot vocabularies for existing intents |
| Safety core | Numeric defaults **inside hard clamps** |

Distribution, in order of preference: **(1)** bundled starter packs in
the AAB/APK; **(2)** Play Feature/Asset Delivery for later official
packs; **(3)** in-app download of a signed manifest + assets from
Guardian's own host (data-only packs are not executable code; needed
for the direct flavor). Every download is user-tapped with its size
disclosed first (§4.5's rule applies to packs too). Paid packs, if
ever: **Play Billing in the Play build** — a pack never carries its
own payment links, prices or unlock codes.

### 7.2 What a pack CAN and CANNOT contain

**CAN (data / config / assets only):**

- Terminology overrides for core string keys + pack-namespace strings
  (plain text; template placeholders only). Includes a **mandatory
  complete discreet terminology set** — every pack ships one.
- Navigation: ordering of existing screens, visibility toggles for
  *optional* screens, Home quick-action selection, screen display
  names.
- Theme: colour tokens (contrast-checked at install), typography scale
  and shape enums, icon-set selection, call-theme default, static
  illustrations (size-capped, hash-pinned).
- Session custom fields from the field-type **whitelist**:
  `shortText, longText, phone, email, number, currency, date, time,
  duration, select, multiSelect, boolean, address, rating(1–5),
  personRef, photoRef` — deliberately **no** `url`, `file`, `richText`
  or `computed` in v1. Sensitive-flagged fields inherit the client
  log's on-device-only, never-synced treatment.
- Checklists (pre / arrival / wrap-up; ≤25 items per phase).
- Templates (circle / counterpart / coded / follow-up) with
  placeholders from the whitelist only.
- Fake-call personas in the existing script schema (all five intent
  buckets — agree/stall/question/distress/goodbye — non-empty).
- AI lexicon/slots/suggested safewords/sound-profile selection (§6.3).
- Safety defaults as numbers the core **clamps** before applying:
  session length (pack 15 min–8 h; core 10 min–12 h), missed-check-out
  grace (2–30 min; core 1–60, never 0/off), check-in cadence (10–120
  min; core 5–240, never off in-session), dead-man's window (2–24 h),
  fake-call lead (0–60 min; core 0–120). Silence escalation: always on.
- Onboarding questions from the whitelisted question types,
  recommended circle-role *labels*, a pack intro card, links only to
  Guardian-owned pages.
- Data-handling metadata (which fields are sensitive — a pack may flag
  more, never un-flag a core-sensitive field).

**CANNOT (hard prohibitions, enforced by the validator, not by trust):**

- ❌ Any executable content: dex/JAR/.so, JavaScript (including in
  "templates" or onboarding), HTML with script, WebView URLs, macros,
  expression languages beyond the placeholder whitelist.
- ❌ New screens/layouts/destinations; removing or renaming
  **safety-critical surfaces** (Panic/SOS, Check-in/out, Lock/PIN gate,
  Circle, Settings → Privacy & Account, the emergency disclaimer). A
  pack may re-emphasise; it may never hide the way out.
- ❌ New permissions, FGS types, background behaviour, network
  endpoints, data collection, or anything changing what leaves the
  device. A pack inherits the base app's Data Safety declaration
  exactly.
- ❌ Changes to safety *semantics*: mandatory check-out cannot be
  disabled; duress/decoy behaviour cannot be altered; ladder steps
  cannot be removed (notification-channel order may vary; the final
  circle alert may not be deleted); panic cannot be made quieter,
  slower, or confirmation-gated.
- ❌ Numeric defaults outside the core clamps.
- ❌ ML model weights or raw detection thresholds (v1) — packs select
  bundled models/profiles by id. (Core-delivered AI model downloads,
  §4.5, are a separate, disclosed mechanism — not pack content.)
- ❌ Monetisation mechanics, prices, payment links, paywall/unlock
  logic, external store links, advertising.
- ❌ Lowering the age gate or child-directed content (§1.2).
- ❌ Third-party content feeds. Official packs are Guardian-authored
  and Guardian-signed; future user-made packs install only from a
  local file, are marked unverified, and pass the same validator.

**Layering rule (the core wins every conflict):**
Core invariant > User explicit setting > Pack default > Pack
suggestion. A pack activation never resets a user's PINs, circle,
grace period or alarm sound; a conflicting pack default triggers one
"Pack suggests X — you have Y set. Keep yours?" prompt, defaulting to
*keep yours*. Every resolved value shows its provenance in Settings
("from Real Estate pack" / "your setting") — in a safety app,
"why did it do that?" is a trust feature.

### 7.3 Manifest schema (summary)

One JSON document (`pack.json`) + an `assets/` folder. **Caps:
manifest ≤ 256 KB, total pack ≤ 5 MB. Closed schema — unknown keys are
rejected** (that single rule prevents most "data that is secretly a
feature" drift).

| Field | Notes |
|---|---|
| `schemaVersion` | int, starts `1`; core refuses packs above its supported schema |
| `id` | reverse-domain, immutable once published, e.g. `studio.blacklisted.guardian.pack.realestate` |
| `version` | semver, independent of app version |
| `publisher {name, keyId}` + `signature` | Signature covers manifest + every asset hash; verified against a key pinned in the binary |
| `minAppVersion` / `maxAppVersion` | Outside range the pack disables with a user notice |
| `display {name, tagline, missionNoun, iconAsset}` | Picker/storefront presentation |
| `locales` | Pack must be complete for each locale it claims; core falls back per-string |
| `terminology` | Core keys + pack namespace; mandatory `discreet` sub-map |
| `navigation {homeOrder, hidden, quickActions, homeCards}` | Registry ids only; safety-critical ids rejected in `hidden` |
| `theme` | Colour tokens, `fontScale`/`shape` enums, `iconSet`, `callThemeDefault`, asset refs |
| `sessionProfile {fields[], defaultTitleField, summaryLayout}` | Field defs per §7.2 whitelist |
| `checklists {pre, arrival, wrap}` | Items `{id, text, required}` |
| `templates {circle, counterpart, coded, followUp}` | Placeholder whitelist enforced |
| `personas[]` | Must validate against the core persona-script schema |
| `ai {intentLexicon, slots, suggestedSafewords, soundProfileId, voiceNotes}` | Intent/slot ids from core registries; phrases, not regexes (v1) |
| `safetyDefaults` | Numeric; clamped at install **and** at activation |
| `onboarding {introCard, questions[], recommendedCircleRoles}` | Whitelisted question types |
| `dataHandling {sensitiveFields, notes}` | Drives the privacy card + never-sync flags |
| `entitlements {tier, playProductId?}` | `playProductId` must exist in Play Console; no pricing in the manifest |
| `assets [{path, sha256, bytes}]` | Every asset hash-listed; unlisted bundle files rejected |

A full worked example (Real Estate & Showings — fields, checklists,
templates, persona, lexicon, clamps) lives in
`.phase7-research/pack-architecture.md` §1.3 and is the template every
pack author starts from.

### 7.4 Mission switching & per-pack data partitioning

Design assumption: **one person, several gigs** — cleaner in the
morning, pet sitter in the evening, photographer on Saturday.

- **Shared identity core (never touched by switching):** account +
  entitlement, PINs (main/duress/decoy), biometric, the person-level
  circle, safe places, alarm sound, language, device identity keys.
- **Per-mission namespace (by pack id):** terminology/theme, session
  fields *and their data*, client/regulars log partition, checklists,
  templates, fake-call personas, per-mission circle *subset* (pack
  role labels mapped by the user to real people), timer defaults,
  onboarding answers.
- **Ledger stays unified, tagged by mission:** entries carry `packId`;
  the tax CSV is one file with a mission column.
- **Switching rules:** one active pack at a time in v1; **no switching
  during a live session, a pending check-out grace window, or an
  active dead-man's countdown** (switcher disabled, reason shown);
  sessions **snapshot** their `packId` + `packVersion` + field schema
  + terminology at start, so history/journal/watch pages render
  correctly after a pack updates or uninstalls; switching is a
  <5-second, no-network action (packs fully cached on-device); Home
  carries a persistent mission chip ("Today: Pet Sitting ▾").
- **Cross-mission leakage is opt-in and off by default:** client-log
  search defaults to the active mission's partition — a user's
  entertainment clients and cleaning clients must never surface in
  each other's contexts. That separation is a *selling point* for
  multi-gig users. A deliberate "search all missions" toggle exists in
  the log only.
- **Watch links are per-session** and carry that session's watcher set
  (identity circle as narrowed by the mission subset picked at start).
- **Uninstall** archives the namespace (data retained on-device,
  export offered); **downgrades** never rewrite session snapshots.
  Packs are also **suspended wholesale** during a live session, during
  panic, and during the wizard's test alert — the app a user drilled
  with is the app that responds.

### 7.5 Depth bar & launch order

**Anti-goal, enforced:** do not launch ten shallow packs. A pack that
is only find-and-replace on the word "date" will be seen through in
one session, by exactly the professional communities whose associations
are the distribution channel. A pack does not ship without **all** of:
≥40 terminology entries incl. a full discreet set; ≥3 phase checklists
written from the trade's real workflow; ≥8 templates; ≥3 personas with
complete intent scripts; session fields a practitioner recognises as
*theirs*; a named practitioner reviewer from the trade; ≥10 beta users
from the trade completing real sessions; complete ES strings for
safety surfaces.

**Launch order** (scored on market size / closeness to the existing
feature set / Play-policy safety; full evidence in pack-architecture
§2):

| # | Pack | Why here |
|---|---|---|
| Flagship | **In-Person Entertainment** (DIRECT flavor only, §2.2b) | It *is* the app at v0.11.1 — panic, screening, regulars, deposits, discreet mode, fake call. Zero new core work; never the Play storefront face |
| Base mode | **Dating & Social** — free, in the base app, 18+ | The Tinder/Noonlight register: share plans, check-in timer, fake call, SOS. Not a paid pack — charging for the most universal use case is a growth and PR error. **Adults only** (§1.2) |
| 1 | **Real Estate & Showings** | NAR: 1.44M members; 22% of residential agents report a situation that made them fear for their safety. A showing *is* a session with renamed nouns (fit 5/5). Associations/MLSs are a proven bulk channel (Tether RE via Bright MLS: 100,000+ agents) |
| 2 | **Field & In-Home Services** | Handymen, cleaners, landscapers, locksmiths, designers, on-location photographers — one pack, per-trade terminology variants. Largest combined pool (BLS: 2.43M janitor/cleaner + 1.30M grounds jobs, 2025); entering strangers' homes alone is the flagship's pattern mirrored |
| 3 | **Pet & Home Sitting** | Pet sitters, dog walkers, drop-ins, house sitters (Rover alone advertises 200,000+ sitters/walkers US+CA). Keys/alarm codes/empty homes map 1:1 onto existing fields + checklists; a young, phone-native, heavily multi-gig workforce that proves mission switching in public |
| 4 | **Mobile Notary, Signing & Mobile Professionals** | Mobile notaries + signing agents as anchor (the 4.4M-notary headline discounted honestly to the travelling slice), interpreters/bookkeepers/field reporters as variants. The most distinctive terminology of any pack — the best *demonstration* packs are deep. NNA/state associations = one reachable gatekeeper |
| — | **"In-Person Client Sessions"** (PLAY flavor, §2.2a) | The genuinely generic appointment pack that carries the flagship's *workflows* (minus its words) into Play |

**Deferred, deliberately (decisions, not backlog):**

- **Gig Driver & Delivery** — biggest headline market, worst fit
  (score 11 vs 13–14): the work is a shift of brief doorstep
  encounters, not a 1-on-1 session; platforms already ship in-app
  emergency buttons and crash detection owns the in-vehicle case. A
  credible driver pack needs a **shift-mode core feature first** —
  an app release, not a pack. Revisit after launch packs prove the
  model.
- **In-Home Care & Babysitting** — real market (BLS: 1.01M childcare
  jobs, 2025), real risk, deferred on safeguarding/policy grounds:
  the pack's subject is a worker alone *with minors* — background-
  check assumptions Guardian does not meet (its log is private and
  self-kept by design) and Families-policy scrutiny. Returns only
  with a safeguarding review and an association partner.

Photographers, reporters, driving instructors, interpreters and tour
guides are **inside** packs 2 and 4 as terminology variants rather
than standalone packs — real, but none alone clears the depth bar at
launch.

### 7.6 Validation, versioning & the bad-pack playbook

- **Install pipeline:** fetch → verify signature → verify asset hashes
  → closed-schema validation → clamp safety defaults → contrast-check
  theme tokens → stage → atomic activate (never half-installed).
  Compatibility (`min/maxAppVersion` + `schemaVersion`) is re-checked
  at every *activation*, not just install.
- **Updates:** same pipeline; failed validation keeps the previous
  version live. Users can pin a version; auto-update is per-pack
  opt-in during beta.
- **Revocation:** a signed revocation list (pack id + version range)
  is checked at activation; a revoked pack disables to the generic
  base with a plain-language notice. This is the recall mechanism Play
  reviewers will ask about — it is documented in the Play review notes
  (§9).
- **QA gate per pack release:** validator suite + the core's Vitest
  persona/intent tests parameterised by the pack's personas and
  lexicon + a scripted golden session (start → check-in → fake call →
  check-out → missed-check-out escalation) rendered in the pack's
  terminology, in every locale the pack claims. A pack that fails any
  intent bucket or leaves a safety string untranslated does not ship.

---

## 8. Device recovery, intrusion evidence & decoy countermeasures

*This section is the design in `.phase7-research/device-recovery.md`
(primary sources: Android developer docs, Play Policy Center, Prey /
Cerberus precedents, RCW 9.73.030). It applies to **both flavors
identically** except where the matrix says otherwise — a stolen phone
is a stolen phone in every career.*

Everything before this section protects the *user during a session*.
This section protects the **device itself** — Rob's case: the phone
is stolen or lost **during an appointment**, which for this audience
also means the thief may be holding the session, the circle links and
the evidence with it. Recovery is built in three layers — readiness
before anything goes wrong (§8.2), detection and circle agency while
a session is live (§8.3), and a web recovery console the owner drives
from someone else's device (§8.4) — plus two intrusion-evidence
features that fire on the phone's own PIN surfaces: wrong-PIN selfies
(§8.5) and decoy-entry video (§8.6), both governed by one settings
panel (§8.7) and one retention schedule (§8.8).

What already exists carries most of the weight: the live encrypted
position stream, the sync room's **retained last-known position**
(which already survives the phone going silent), the on-device
session trail and offline outbox, the signal-interrupted warning, and
the Phase 6 accounts the console signs in with. The gaps this section
fills are (a) readiness, (b) a beacon that works when *no session was
running* or after a reboot, and (c) the console itself.

### 8.1 Capability matrix (verified)

Verdicts are per flavor. "CAN" = shippable as designed.

| Capability | Play | Direct | Basis / notes |
|---|---|---|---|
| Circle sees live position during a session | CAN | CAN | Already shipped (PWA); native keeps the design. |
| Last-known position after phone dies / loses signal | CAN | CAN | Retained room state replays last pos; every alert already carries last-known + accuracy + timestamp. |
| Recovery beacon after reboot (armed at setup) | CAN | CAN | `BOOT_COMPLETED` may start a **location-type** FGS; Android 15 bars boot-starting microphone/camera/dataSync FGS — location is not prohibited. The beacon is location-only (§3.2's scoped exception); mic monitoring never resumes after reboot. |
| Wake a sleeping phone to act | CAN | CAN | High-priority FCM is a listed exemption to background FGS-start restrictions. De-Googled direct phones may have no FCM — there the beacon polls on its own schedule. |
| Remote ring at max volume | CAN | CAN | Alarm stream at max volume from the native service. Bypassing *silent* is reliable; bypassing DND is guaranteed only with the notification-policy access the wizard optionally requests (§8.2). Find Hub's "Play sound" is offered as a parallel path. |
| Remote lock — Guardian lock/message screen | CAN | CAN | Guardian's own full-screen lock screen with owner message + callback number. |
| Remote lock — true system lock | CAN (opt-in) | CAN (opt-in) | Via the Recovery Guard device admin (§8.2): `DevicePolicyManager.lockNow()`, user-enabled at setup with `USES_POLICY_FORCE_LOCK`. |
| Lost message on the **system** lock screen | CANNOT | CANNOT | That is Find Hub's privileged capability; no public API writes to the system lock screen. Guardian's own lock screen is the substitute; the console deep-links Find Hub for the real thing. |
| Remote wipe | Find Hub handoff (default) | CAN (opt-in) | Find Hub Erase is the path of record in both flavors (§8.4). Guardian-initiated `wipeData()` via Recovery Guard is an advanced, owner-only path — it matters most for de-Googled direct users, who get nothing from Find Hub. |
| SMS command channel ("text the phone: ring") | CANNOT | CAN | Play restricts `RECEIVE_SMS` to default-SMS-handler apps (Cerberus's own statement confirms its Play build dropped SMS commands for this reason). Direct: a signed command-SMS listener is allowed. Outbound emergency SMS stays fine in both (named Play exception). |
| SIM-change alert | CAN | CAN | Carrier/subscription change is observable on-device; the alert goes out over the data channel. Honest limit: the *new* number is usually not readable — the alert says "SIM changed," with the new carrier if available. |
| Wrong **App PIN** → front-camera photo | CAN | CAN | Capture inside Guardian's own foreground PIN UI (§8.5). |
| Failed **Android lockscreen** attempts → photo | CANNOT | CANNOT | Scope closed — §8.9. Not pursued in either flavor. |
| Decoy PIN → front+back video | CAN* | CAN* | *Device-dependent: true dual-camera needs Android 11+ concurrent-camera support; the §8.6 fallback ladder covers everything else. The constraint is hardware, not policy. |
| Block shutdown / fake shutdown screen | CANNOT | WILL NOT | No supported API intercepts the power menu for normal apps, and imitating a system shutdown is deceptive-behavior territory. Not shipped in either flavor. |
| Uninstall protection | CANNOT | WILL NOT | Play's Malware policy: don't use device admin to block uninstallation; provide a clear, easy removal path. Guardian promises easy removal in both flavors (deactivate Recovery Guard → uninstall). |
| Integrate with Google Find Hub (read/trigger it) | CANNOT | CANNOT | Google provides **no SDK or API for apps** — its partner program is for BLE accessory hardware. Guardian deep-links `android.com/find` and `android.com/lock` and guides setup; it cannot plug into the Find Hub network. |
| Read whether Find Hub / theft toggles are on | CANNOT | CANNOT | No API exposes them; the wizard guides and records *user attestation*. What IS queryable (e.g. `KeyguardManager.isDeviceSecure()` — a screen lock exists) is checked directly. |
| Read the phone's own IMEI for the ID Kit | CANNOT | CANNOT | Since Android 10, IMEI/serial are restricted to device-owner/carrier-privileged apps. The ID Kit (§8.2) is user-entered. |
| Accessibility-service tricks for recovery | NOT USED | NOT USED | Deliberate contrast with Prey (which uses Accessibility for its lock overlay). Guardian's recovery uses **zero Accessibility APIs** in either flavor — stated in the listing and declarations (§9.5). |

**Precedent check.** Prey ships on Play today *with* a user-enabled
device admin for remote lock/wipe, opt-in evidence photos/location
reports, and an explicit deactivation path before uninstall — the
shape §8.2 copies. Cerberus was removed from Play for steering users
to its off-Play full version (the standing anti-pattern behind §2.3:
the Play build must never link to, mention, or hint at the direct
edition), and its Play build dropped SMS commands — matching the
matrix above.

### 8.2 Layer 1 — Readiness (the Sis wizard grows a section)

Nothing in recovery works if it is first configured *after* the
phone is gone. The Phase 6 wizard gains a section — **"If your phone
is taken"** — with a green/amber status list. Each item is either
verified by the app or attested by the user (the app cannot read
Google's toggles — matrix, §8.1).

**Google's own anti-theft stack — guide + attest:**
1. **Find Hub on** — confirm a Google Account is signed in, then a
   **live self-test**: "Open android.com/find on any other device and
   see this phone." Deep links provided.
2. **Theft Detection Lock** — guided (Settings → Google → All
   services → Theft protection); user attests. Its limits are stated:
   not active while already locked, may not trigger on stable
   Wi-Fi/Bluetooth. Guardian's snatch heuristic (§8.3) complements,
   never replaces, it.
3. **Offline Device Lock** — same screen; attest.
4. **Remote Lock** — guide to set a verified phone number so
   android.com/lock works; attest.
5. **Identity Check** (devices that offer it) — biometrics required
   outside trusted places for turning off Find Hub / theft protection,
   factory reset, changing the screen lock. Recommended ON: it stops
   a thief who watched the owner type their PIN from disabling
   recovery.
6. **Screen lock strength** — `KeyguardManager.isDeviceSecure()`
   checked directly; the wizard pushes a real PIN/password over a
   short pattern.

**Guardian's own readiness:**
7. **Recovery Guard (device admin) — OFF by default, separate opt-in
   screen.** Grants exactly two capabilities: *lock this phone on
   command* and *erase this phone on command* (owner-only, §8.4). The
   consent screen names them, states what it never does (no uninstall
   blocking, no policy control, no password rules), and how to remove
   it (Settings → deactivate → uninstall normally). Play posture
   follows the Malware policy's own guidance: explicit consent + easy
   removal (§9.5, item 1).
8. **SIM PIN** — guided (an un-PIN'd SIM moved to another phone
   exposes the number to account-recovery abuse).
9. **Full-screen-intent grant** — since January 2025 only
   calling/alarm apps get `USE_FULL_SCREEN_INTENT` by default; the
   wizard sends the user to the system setting so panic and lost-mode
   screens can break through.
10. **DND access (optional)** — for guaranteed ring-through (§8.1).
    Skippable, with the consequence stated in one line.
11. **Intrusion-evidence setup** — the §8.7 panel is walked once
    here, including the on-device camera probe that tells the user
    which decoy-video mode *their* phone supports (§8.6).

**Device ID Kit** (encrypted vault; shown in the recovery console):
auto-captured model, Android version, Guardian install ID; user-entered
**IMEI**, serial, phone number, and the Google-account email used for
Find Hub (the app cannot read the identifiers — matrix). Plus the
**Recovery Code** — chosen by the user during setup (Decision D1,
§8.8, DECIDED 2026-11-03): the setup form's recovery-code field
auto-populates with the app PIN the user just entered, so by default
the Recovery Code *is* the app PIN; the user may replace it with a
separate custom code only they know, for added security. It is the
key that decrypts recovery data in the console and the step-up proof
for destructive console actions. A forgotten custom code cannot be
reset by anyone — the recovery data it protects is unrecoverable
without it (§8.8).

**Practice drill** (part of readiness, not an afterthought): from the
wizard, the user opens the console on a second device, sees their own
last-known position, and sends a test ring. A recovery flow first
touched during a theft will fail; one rehearsed for 90 seconds won't.

### 8.3 Layer 2 — During a session (the phone is taken mid-appointment)

The spine is already shipped: the circle holds the live encrypted
track and, thanks to retained room state, the **last-known position
the moment the stream stops**. Recovery adds detection and circle
agency on top:

- **Snatch heuristic (on-device):** accelerometer burst + sudden
  rapid displacement while a session is armed → Guardian raises its
  own Panic PIN Lock screen, jumps the beacon to panic cadence (2 s),
  and sends the circle a **"possible snatch"** alert with the position
  at the moment of the event. This complements the OS Theft Detection
  Lock (which only locks) with the two things it doesn't do: notify
  the circle and mark the place.
- **Connectivity loss while moving** extends the existing
  signal-interrupted escalation: silence >45 s during an armed session
  already warns the circle; the warning now includes "last seen here,
  moving at X when contact was lost" and a one-tap route to the
  console's mark-lost flow.
- **Last-gasp flush:** an `ACTION_SHUTDOWN` receiver (context-
  registered; a protected broadcast on orderly shutdowns) flushes the
  latest fix to the outbox and, if the network allows, straight to the
  room. Best-effort by platform design — battery pulls and forced
  power-offs may not deliver it. Copy never promises it (§8.9).
- **Circle-triggered actions** (E2EE commands through the session
  room, all logged to the session journal):
  - **Ring** — any circle member, any time during a session. Default ON.
  - **Lock** — only if the owner enabled "my circle can lock my
    phone" at readiness. Default OFF; it hands another person real
    power over the device.
  - The intrusion-evidence triggers of §8.5–§8.6 (lost-mode and
    threshold sends) run in this layer too.
- **Session-less theft:** if no session was running, the armed-at-
  setup recovery beacon (§8.1) is what the console sees — lower
  cadence, last-known between fixes, stepping up when the console
  sets lost mode (§8.4).

### 8.4 Layer 3 — Recovery console (web, any device, Supabase account)

Same codebase as the app; the owner signs in with their Phase 6
magic-link account on any browser — a friend's phone, a library PC.
Rob's case starts with "my phone is gone," so the console assumes
*no trusted device is available*.

**Mark lost — server-side effects, in order:**
1. Set the device's **lost flag** (picked up via high-priority FCM
   and on the beacon's next connect): beacon cadence steps up,
   on-device evidence triggers (§8.5–§8.6) arm their lost-mode sends,
   Guardian lock/message screen engages.
2. **Revoke the live session / circle / client links** — the
   guardian-sync room for any in-progress session is closed
   server-side, so a thief holding the phone can't ride the session
   link or see the circle.
3. **Revoke that device's Supabase app sessions** (the account stays
   usable from the console; the phone's tokens die).
4. **Notify the circle** ("X marked their phone lost — last seen …").
5. **Start the retention clock** (§8.8).

**Console home:** live map while the beacon reports; otherwise the
last-known fix with accuracy circle, timestamp, and battery-at-
capture. Stale data is labeled stale — never rendered as live.

**Actions:**
- **Ring** (alarm stream, max volume; a note shows if DND access
  wasn't granted).
- **Lock now** — Recovery Guard `lockNow()` if enabled; otherwise
  the Guardian lock/message screen. If neither is armed, the console
  says so and deep-links Find Hub's Secure device.
- **Show lost message + callback number** — rendered on Guardian's
  lock screen (message text + a callback number that is *not* the
  stolen phone's). Writing to the system lock screen stays a Find Hub
  handoff (matrix).
- **Share recovery link** — view-only, expiring, revocable (same
  fragment-token pattern as circle links), for family or police.
- **Export incident pack** — trail as JSON/GPX plus a plain-language
  incident sheet (times, last-known, IMEI from the Device ID Kit)
  formatted for a police report or carrier call.
- **Mark found** — ends lost mode, restores the normal beacon, starts
  the §8.8 purge countdown with an immediate-delete button.

**Erase — the honest handoff.** The console's Erase button explains
in two sentences and deep-links: Find Hub's Erase (android.com/find)
is the supported path — it factory-resets, and, honestly stated,
*tracking stops afterwards*, so the console nags the user to export
the incident pack first. For owners who enabled Recovery Guard (and
de-Googled direct users with no Find Hub at all), a Guardian-initiated
wipe is available behind Recovery Code entry + typed confirmation +
a delay-cancel window (default 10 minutes, cancellable from the
console) — an irreversible action gets friction proportional to its
cost. Guardian never claims an erase it didn't perform: until the
device acknowledges, status reads "erase requested, not yet
confirmed."

### 8.5 Wrong-PIN intruder selfies — Guardian's OWN App PIN

Rob's requirement, with his clarification: *"i meant our pin."* The
capture happens **inside Guardian's own foreground PIN UI** — the PIN
pad is on screen, the app is in the foreground, and `CAMERA` is an
ordinary permission Guardian already holds for its emergency A/V
features. CameraX/Camera2 captures to a non-preview surface, so the
pad's look doesn't change. **Identical in both flavors** — the
distribution channel is irrelevant.

Surfaces covered — **every incorrect App PIN entry**, on:
- the app-unlock PIN pad, and
- the **panic-unlock pad** (the v0.4 Panic PIN Lock stop paths) — the
  pad a thief meets mid-session.

**Semantics per PIN type — the three PINs are not the same event:**
- **Wrong PIN (no match):** capture, log, count toward the attempt
  threshold.
- **Duress PIN:** the entry already silences the app and fires the
  silent coercion alert. **Photo capture on duress entry is OFF by
  default and a separate opt-in (§8.7)** — because the system camera
  indicator (§8.9) is visible to whoever is standing over the user,
  and a duress moment is the worst moment to advertise a camera. If
  the owner opts in anyway, the readiness copy says exactly that
  before they can turn it on.
- **Decoy PIN:** **never a selfie.** Decoy entry is handled by §8.6
  (video); a still capture is deliberately not stacked onto it — the
  decoy only works if nothing about the phone's behaviour betrays it.

**Storage, sending, retention:**
- Encrypted on-device only, in the evidence vault, in a "Security
  attempts" log the owner can view in-app. **Rolling cap ~20 photos;
  auto-delete after 7 days** (both configurable, §8.7). Most captures
  will be the *owner's own typos* — the in-app copy says so plainly,
  so the log reads as a security feature, not an accusation machine.
- **A photo leaves the phone only when one of these is true** (E2EE
  to the circle / recovery console — BNE never holds a readable copy):
  1. **Lost mode is active** (§8.4), or
  2. **A session is active AND the attempt threshold is reached**
     (default 3 wrong entries — below that, typos stay on the phone), or
  3. **Duress entry** — only if the §8.7 opt-in is on.
  Outside those conditions the photo *cannot* be sent; there is no
  background trickle of attempt photos to anyone.
- When a photo *is* sent, the circle alert frames it accurately: "3
  wrong PIN tries on [device] — most recent photo" — evidence for the
  owner, not a public accusation.

**Play / Data Safety:** `CAMERA` is already declared and justified;
the capture adds no new permission. **Photos become a declared Data
Safety data type** (§9.5, item 3): on-device-only storage is not
"collected" under Google's definition; the conditional sends above
are collection/sharing events and are declared as such. The §8.7
panel's prominent disclosure runs before the feature is first enabled
— consent first, capture second (the User Data pattern in §9.2).
Listing copy discipline: "takes a photo when someone guesses your
Guardian PIN wrong" — never "catches intruders," and never any claim
about the phone's own lockscreen (§8.9).

### 8.6 Decoy-PIN countermeasure video (front + back, on decoy entry)

**Trigger:** the decoy PIN is entered and the fake Notes decoy opens.
Recording starts automatically and runs for the configured duration
(default **5 minutes**) while the decoy UI behaves exactly as it
always has.

**Concurrent-camera feasibility (verified against Android docs):**
- True simultaneous front+back is a **hardware capability, not a
  guarantee**. From Android 11, Camera2 exposes concurrent camera
  sets — `PackageManager.FEATURE_CAMERA_CONCURRENT` advertises
  support, `CameraManager.getConcurrentCameraIds()` returns the
  supported combinations, `isConcurrentSessionConfigurationSupported()`
  validates a concrete configuration at runtime. CameraX wraps the
  same capability (`ConcurrentCamera`, dual-camera only), with max
  resolution **720p or 1440p** depending on the device's mandatory
  concurrent stream combinations.
- What the platform guarantees on concurrent-capable devices is
  paired streams on the order of **one camera at s720p alongside the
  other at up to s1440p**. Full dual-1080p recording is *not* part of
  the guaranteed set; some flagships exceed the floor, many devices
  don't reach it.
- Support concentrates in flagship-class phones. Guardian makes **no
  model promises**: the readiness wizard *probes the actual phone*
  (§8.7's test button), records which mode this device earned, and
  shows the user the result. The contract is "probe, don't assume."
- **Recording without a preview:** Camera2/CameraX recording targets
  do not require a visible preview surface. The decoy Notes UI stays
  on screen, untouched; the app is in the foreground throughout — no
  FGS-type games, no background-camera problem.
- **The indicator cannot be hidden** (§8.9): the green dot shows for
  the entire recording and the session lands in the Privacy Dashboard.
  The feature is evidence-gathering, not invisibility — spec and copy
  say so.
- **Thermal/battery:** dual ISP + dual encode for 5–10 minutes is the
  heaviest load Guardian ever puts on the phone. Recording stops
  cleanly on thermal signals or critical battery, sealing what exists.

**Fallback ladder** (selected automatically by the probe; the user
can override the *strategy* in §8.7):
1. **True dual** — front + back simultaneously, 720p each by default
   (1440p-class where the concurrent set supports it and the user
   picked High).
2. **Back video + front photo bursts** — continuous back video; a
   front still every ~10 s.
3. **Fast alternation** — one camera at a time, ~15 s slices
   alternating front/back.
4. **Single camera** — front only or back only (user's §8.7 choice).
5. **Photo burst only** — if even single video fails (storage/
   thermal), stills every few seconds. Degraded, never silent: the
   attempts log records which mode actually ran.

**Files, sizes, storage:**
- **Segmented recording:** 60-second sealed segments per camera
  (separate files + a manifest tying them to the decoy-entry event),
  each encrypted into the evidence vault on close — a shutdown or
  battery pull mid-recording loses at most the open segment.
- **Size math** (engineering estimates, audio excluded): 720p ≈
  **~190–300 MB per camera per 5 min** → dual ≈ **0.4–0.6 GB**; 1080p
  → dual **>1 GB**. Hence: default quality cap **720p** in dual mode,
  a **vault space guard** (recording refuses to eat the last 1 GB of
  free storage; evidence evicts only by its own retention rule), and
  HEVC roughly halving sizes where the device supports it.
- **Audio — separate toggle, OFF by default, legal warning attached.**
  Video-only capture records no conversations. With audio on, WA law
  applies: Washington is an **all-party consent** state (RCW
  9.73.030) — recording a *private conversation* without every
  participant's consent is a gross misdemeanor and the recording is
  inadmissible. The §8.7 toggle carries this in plain language, and
  the copy says "check your state" rather than pretending WA is
  universal.

**Upload policy:** same framework as §8.5, configured separately
(§8.7): vault-only by default until a trigger condition holds —
**lost mode active**, or **session active + decoy event** (a decoy
entry during a live session is never benign, so session context alone
arms the send — no threshold needed for the decoy case). Sends are
E2EE, chunked/resumable (these files are hundreds of MB), and the
console shows per-segment arrival so partial evidence is visible as
partial.

### 8.7 Settings panel — "Intrusion & Evidence"

Rob's rule: **every countermeasure in §8.5–§8.6 is editable and
toggleable here.** Labels below are the user-facing plain-language
strings; defaults ship as listed. This panel is the features' control
surface — it lands in the same build step as the features themselves
(§10, step 7.1R).

**Access control for the panel itself:** Settings opens only behind
the correct App PIN or biometrics. Duress and decoy entries can never
reach it, and changing any *upload* setting requires the real PIN —
a person holding the unlocked phone cannot loosen evidence rules
behind the owner's back.

| Setting (plain-language label) | Control | Default | Why this default |
|---|---|---|---|
| "Take a photo when someone enters my PIN wrong" | On/Off | **On** | The core evidence feature; cheap, on-device, and the owner asked for it. |
| "When wrong-PIN photos can be sent to my circle / recovery console" | Never / Only if my phone is marked lost / During a session or when lost / Always | **Only if marked lost** | Keeps the published "your data stays on your phone" promise true until the owner declares the emergency. |
| "Wrong tries before it counts as an attack" (threshold) | 1–10 | **3** | Separates the owner's typos from a guessing attack before anything is sent or escalated. |
| "Also take a photo if my duress PIN is used" | On/Off | **Off** | Android's green camera dot is visible to the person forcing the entry (§8.5/§8.9). Opt-in only, behind a warning screen. |
| "Keep wrong-PIN photos for" | 1 / 3 / 7 / 30 days | **7 days** | Long enough to notice a pattern; short enough that a log of your own typos doesn't pile up. Rolling cap ~20 photos regardless. |
| "Record video when my decoy PIN is used" | On/Off | **On** | A decoy entry is never the owner's normal path — if it happens, evidence matters. |
| "Decoy video length" | 1 / 2 / 5 / 10 min | **5 min** | Rob's specified duration; balances evidence value against file size (§8.6) and battery/thermal load. |
| "Decoy video cameras" | Both if my phone can / Front only / Back only | **Both if my phone can** | The ask, with honesty about hardware: the phone is probed and the actual mode is shown (§8.6). |
| "If both cameras can't run together" (fallback behaviour) | Back video + front photos / Switch back and forth / Front only / Back only | **Back video + front photos** | Keeps continuous video of the surroundings *and* periodic faces — the best evidence mix the widest set of phones can do (§8.6). |
| "Decoy video quality" | Standard (720p) / High (up to 1080p) | **Standard (720p)** | Dual-mode platform ceiling is ~720p on most devices; High can exceed 1 GB for 5 minutes dual (§8.6). |
| "Record sound with decoy video" | On/Off | **Off** | WA all-party consent law (RCW 9.73.030) — §8.6. Toggle carries the legal warning inline. |
| "When decoy videos can be sent" | Never / Only if marked lost / During a session or when lost / Always | **Only if marked lost** | Same reasoning as photos; note §8.6: during a *session*, a decoy entry arms the send at any setting except Never. |
| "Alert my circle after repeated wrong PINs" | On/Off | **On** | A guessing attack during a session is exactly what the circle exists for. |
| "Test my decoy camera setup" | Button | — | Runs the §8.6 probe + a 5-second test recording and *shows the owner* which mode their phone got and what the green dot looks like. No surprises later. |

Panel footer (fixed copy, not a setting): *"Android always shows a
green dot while a camera or microphone is on. Guardian can't hide it,
and neither can anyone else's app."*

### 8.8 Retention schedule & Decision D1

**Plain statement of the change:** until now Guardian's servers have
held *no* position history — the sync rooms forward ciphertext and
retain only the latest state. Lost-mode recovery creates, for the
first time, a reason to retain position data beyond the moment: a
phone beaconing while lost, whose owner reads the trail from the
console. The retention rules below are therefore **part of the
feature**, not an appendix — and they go in the privacy policy
verbatim (§9.5, item 4). Retention that isn't published doesn't count.

> **D1 — DECIDED 2026-11-03 (Rob): E2EE Recovery Code (server stores
> ciphertext + timestamps only).**
>
> The device encrypts beacon fixes with a key derived from the
> user-chosen Recovery Code (§8.2); the server stores ciphertext +
> minimal metadata (timestamps, accuracy). The console decrypts
> in-browser after the owner enters the code. BNE still cannot read
> anyone's location — the published beta guarantee ("BNE does not
> access users' GPS data") survives intact.
>
> **The code is the user's, not the system's (Rob's design):** during
> setup, the recovery-code field auto-populates with the main app PIN
> the user just entered — by default the Recovery Code *is* the
> user's app PIN. The user may instead enter a separate custom
> recovery code that only they know, for added security.
>
> **Key derivation & console hardening (binding):** (1) the
> encryption key is derived from the recovery code via a slow, salted
> KDF (e.g. Argon2id or scrypt with a per-user random salt), never a
> fast raw hash; (2) code entry in the console is attempt-throttled /
> rate-limited server-side with escalating delays, so online guessing
> is impractical.
>
> **Strength, stated honestly:** a PIN-length default code is only as
> strong as the PIN against an *offline* attack on stolen ciphertext
> — the slow KDF raises the cost of each guess but cannot make a
> short numeric code strong. The PIN default is the zero-friction
> option (nothing new to remember or store); the custom code is the
> high-security option. Rob chose to offer both with the PIN as the
> default — that tradeoff is decided, not pending.
>
> **Cost, stated plainly:** if the owner forgets a custom code, the
> trail is unrecoverable — nobody can reset it, including BNE. The
> console then shows metadata only ("last contact 14:02, accuracy
> 30 m" without coordinates) and recovery leans on the circle's
> retained last-known + Find Hub.
>
> **Rejected alternative: server-readable positions.** Simpler
> console, no code — and it breaks the beta-blog promise the day it
> ships. Rejected in the ruling.
>
> Circle-visible data is unaffected by D1: during sessions the circle
> already holds what it holds, under the existing E2EE session
> design.

**Retention schedule (applies under D1 as decided):**
- **Normal times:** the beacon's last-known record is a *single
  overwritten per-device snapshot* — no history accumulates. Ever.
- **Lost mode:** the beacon trail is retained for the lost episode
  **plus 7 days after Mark found**, then auto-deleted server-side;
  **hard cap 30 days** in lost mode without renewal by the owner.
- **Evidence (photos/video):** governed by §8.7's on-device rules;
  anything sent to the console under lost mode follows the same
  lost-episode + 7-day rule, with immediate delete available in the
  console.
- **Owner controls:** export anytime (§8.4 incident pack); purge-now
  button in the console; account deletion purges everything, no
  residue.

### 8.9 Honest limits (binding copy constraints)

These ship in the product copy, not just in this blueprint:

1. Guardian **cannot** join or read Google's Find Hub network,
   trigger Find Hub actions, or put text on the system lock screen.
   It guides, deep-links, and covers the gaps Find Hub leaves
   (circle, console, evidence).
2. Guardian **cannot** photograph failed *Android lockscreen*
   attempts (see the closing note below), block or fake a shutdown,
   or survive a factory reset — no consumer app can. Find Hub Erase
   is the wipe of record.
3. A powered-off, SIM-removed, or Faraday-bagged phone reports
   nothing until it reconnects; last-known + accuracy + timestamp is
   the honest product then.
4. Every camera feature is **visible** while it runs: since Android
   12 the system shows a green camera/microphone indicator whenever
   any app uses a sensor, logs the use in the Privacy Dashboard, and
   **apps cannot hide this**. On the wrong-PIN pad that costs little;
   on duress/decoy surfaces it is a real tactical fact — hence the
   defaults in §8.5/§8.7 and the readiness copy: *"Android always
   shows a small green dot when the camera is on. Anyone holding
   your phone can see it."* Any copy implying covert capture is
   prohibited in both flavors (§9.5, item 8).
5. Recovery Guard (device admin) is opt-in, narrow (lock + wipe on
   the owner's command), and removable in two steps. The Play build
   never links to, names, or hints at the direct edition (the
   Cerberus removal is the standing warning, §2.3).

**The lockscreen note (scope closed, Rob 2026-11-02).** Normal apps
cannot observe the **system lockscreen's** failed attempts or
photograph them. The only historical route is
`DeviceAdminReceiver.onPasswordFailed` (user-enabled legacy device
admin with watch-login), and even that delivers only a *failure
notification*: since Android 9 a background or locked app cannot use
the camera at all, so **no photo at the moment of a failed lockscreen
attempt is possible on modern Android in either flavor** —
sideloading changes policy exposure, not platform APIs. Guardian is
not enabling device admin to chase a notification that can't carry a
photo. End of scope: the selfie feature is the App PIN's, per Rob's
correction (§8.5).

---

## 9. Play compliance checklist

*Everything below traces to `.phase7-research/play-policy.md`. File
declarations **early, in parallel with the prototype** (§10 build
sequence) — background-location review can take weeks, and it gates
the launch, not the code.*

### 9.1 Declarations & Console filings

- [ ] **Background location** — *Permissions and APIs that Access
  Sensitive Information* + Background Location policy. Play Console →
  App content → Location permissions, all four mandatory items:
  (1) **Permissions Declaration Form describing ONE feature only**
  (multiple features in one form = rejection; approval covers the
  whole app); (2) **demo video ≤30 s** showing the declared feature,
  the prominent disclosure dialog and the runtime prompt; (3)
  **prominent in-app disclosure** in normal usage flow (not only in
  the privacy policy); (4) **privacy policy** in Play Console *and*
  in-app. Guardian's argument is the one the policy itself names:
  "**physical safety, perceived safety**" are *significant* user
  benefits. Note: session FGS tracking is not a loophole around this
  — Google treats FGS use equivalent to background location as
  subject to the same requirements; file the declaration.
- [ ] **Foreground Services declaration — per type** — *Device and
  Network Abuse* (FGS policy) + Android 14 platform rules. For each of
  `location` and `microphone` (and `dataSync` if ever used — avoid it
  for session sync; Android 15 gives it a 6 h/24 h timeout the other
  types don't have): manifest `foregroundServiceType` + matching
  permission, plus Play Console declaration with description, user
  impact and a **demo video**, justified on the policy's own tests:
  beneficial + core-relevant, user-initiated/perceptible,
  user-stoppable, system-interruption would harm the feature, runs
  only as long as necessary.
- [ ] **Data Safety section** — accurate, and built on the strongest
  fact Guardian has: per Google's own guidance, data "accessed only
  on your device and not sent off your device" is **not "collected."**
  On-device-only audio (monitoring, transcription) is therefore
  declared as not collected — and that must be *literally true* of
  the shipped binary (no analytics SDK quietly uploading
  audio-adjacent data). What **does** leave the device is declared
  plainly: precise location shared with the user's chosen circle
  during sessions, account identifiers (Supabase), alert payloads.
  Declaring "no data collected" while location leaves the phone would
  itself be a violation.
- [ ] **User Data policy** items: privacy policy in listing + app;
  secure transmission (HTTPS/modern crypto — the E2EE session channel
  already exceeds this); no sale of personal/sensitive data; **account
  deletion in-app AND via an external web resource** (freezing is not
  a substitute) — Supabase accounts make this a real build item, not
  a formality.
- [ ] **Target audience: 18+ only** (§1.2). No under-18 age group
  selected, anywhere, ever, for this app.
- [ ] **SEND_SMS (only if the native build wires the Twilio relay
  natively)** — *SMS and Call Log Permissions* has a named exception,
  "Physical safety/emergency alerts to send SMS," eligible via the
  Permissions Declaration Form + review. The web flavor's relay design
  already keeps the app itself out of SMS; only file this if that
  changes.

### 9.2 Prominent disclosures (in-app, in normal flow, before consent)

- [ ] **Before first location permission:** what is tracked (during
  sessions), who sees it (the user's chosen circle, via encrypted
  links), when it stops.
- [ ] **Before first mic arming:** microphone data is personal and
  sensitive data (User Data policy) and background collection is
  outside users' reasonable expectation by default — so the §5.1
  disclosure names the data, the on-device-only processing, the
  ladder, and what (if anything) can leave the phone, immediately
  before the consent/permissions request, with consent as a clear
  affirmative action granted *before* collection begins.
- [ ] **Spyware defence, assembled** — *Malware — Spyware* lists
  "recording audio" among its violation examples; Guardian's shipped
  shape is the same page's stated mitigation set: clear notice +
  explicit consent before any collection, collection limited to the
  stated function, no hidden collection, persistent notification,
  nothing recorded/transmitted by the monitoring path. Review notes
  say exactly this, in these terms.
- [ ] **Stalkerware framing audit** — *Malware — Stalkerware*: Guardian
  is the inverse pattern (the device owner shares **her own** location
  with **her own** contacts for **her own** protection). Rules:
  never market any feature as tracking/monitoring *another person*;
  tracking is always of the signed-in user; persistent notification
  while a session runs; the listing discloses the sharing plainly.
  Any future "watch your partner/client" feature is a BLOCKER under
  this section and is not on any roadmap.

### 9.3 Behaviour transparency & downloads

- [ ] **No hidden, dormant or undocumented features** (Deceptive
  Behavior §5): the pack system itself **and the pack catalogue
  categories** are described in the listing ("downloadable experience
  packs for different kinds of solo work"); packs restyle/reorder/
  relabel the *same reviewed feature set* — a pack may not switch on
  functionality nowhere in the listing/review (and by §7.1 design,
  cannot).
- [ ] **Every download prompted with size disclosed first**
  (Deceptive Behavior §3.2 CDN rule): packs and AI model packs alike.
- [ ] **No code from our servers** (Device and Network Abuse): packs
  are data (§7.1); anything code-bearing would ship only as a Play
  Feature Delivery module inside the reviewed bundle.
- [ ] **Listing/app never link to or unlock the direct edition**
  (§2.1) — checked as part of release QA, not left to memory.

### 9.4 Listing copy rules

- [ ] **No overclaimed safety claims** (Deceptive Behavior —
  Misleading Claims): copy may promise alerts to the user's own
  circle, check-in escalation and location sharing (all real). It may
  NOT promise guaranteed rescue, guaranteed response times, or any
  connection to emergency services/dispatch Guardian doesn't have.
  The shipped honest limit — *"Guardian alerts your circle; it is not
  a substitute for emergency services"* — is the compliant posture
  and stays verbatim in spirit.
- [ ] **Permissions match promoted features only** (Permissions
  policy): no sensitive permission for an undisclosed, unimplemented
  or disallowed feature — declarations (§9.1) and listing copy are
  written from the same feature list.
- [ ] **Zero adult/sexual keywords, imagery or entertainer framing**
  anywhere in listing or Play binary (Sexual Content policy, §2.1).
- [ ] **Dating written in the Tinder/Noonlight register** (play-policy
  §3.3): "meeting someone new / first date" safety language — share
  plans, check-in timer, fake call, SOS — is fine; matchmaking or
  facilitating the encounter is where the policy bites. Precedent that
  the core feature set itself is listable: bSafe's live Play listing
  openly includes voice-activated SOS, live streaming, SOS recording,
  fake call and GPS follow-me.
- [ ] **No teen-directed copy** (§1.2); "students" = adult students.
- [ ] **Screenshots/video show the generic packs**, with Field
  Services / Real Estate as the listing face (§7.5 note), and the
  demo videos filed with declarations match what the listing shows.

---

### 9.5 Recovery & intrusion-evidence filings (from §8)

- [ ] **Device-admin consent copy + commitments** (Malware — Device
  Admin): Recovery Guard (§8.2) ships with an explicit opt-in screen
  naming its capabilities only (lock/wipe on the owner's command),
  **no uninstall blocking**, and an easy deactivation path documented
  in-app *and* in the listing.
- [ ] **Background-location declaration covers the lost-mode beacon**
  as the *same* declared feature (one-feature form discipline,
  §9.1); the declaration demo video is updated to show mark-lost
  (§8.4), not just session tracking.
- [ ] **Data Safety additions:** **Photos** (wrong-PIN selfies —
  collected/shared only under §8.5's three conditions) and **lost-mode
  location retention** per §8.8 are declared; on-device-only items
  remain not-collected per Google's definition, and the
  substantiation page is updated to match.
- [ ] **Privacy policy gains:** the §8.8 retention schedule verbatim,
  the §8.5/§8.6 evidence-send conditions, and the Recovery Code / D1
  data-access statement (who can read recovery positions, exactly as
  decided).
- [ ] **Explicit negative declarations:** the Play build requests
  **no SMS permissions** for recovery and uses **no Accessibility
  APIs** for recovery (§8.1) — stated in the manifest review notes
  and listing, not just true of the code.
- [ ] **Full-screen-intent declaration** + the wizard's user-grant
  flow for `USE_FULL_SCREEN_INTENT` (§8.2, readiness item 9), filed
  alongside the §9.1 FGS declarations.
- [ ] **Prominent-disclosure copy for the Intrusion & Evidence
  panel** (§8.7) — including the camera-indicator honesty line —
  reviewed against the User Data pattern in §9.2 (before consent,
  in normal flow, naming the data).
- [ ] **Listing-claims discipline for recovery:** no "guaranteed
  recovery," no shutdown-protection claims, no lockscreen-capture
  claims, and **no covert-capture language anywhere** (§8.9).

## 10. Build sequence — Phase 7.1 → 7.5

Each step has a **verification gate**. A step is done when its gate
passes on real hardware, not when its code compiles. Declarations
(§9.1) are filed in parallel from 7.1 onward.

### 7.1 — Capacitor prototype APK
Wrap the existing app; thin `GuardianNative` plugin; monitor service
skeleton owning the GPS feed; Keystore storage move; debug-signed APK.
**Gate:** Rob installs it on his **Pixel 9 Pro XL** and runs a full
golden session with the WebView *killed mid-session* — GPS keeps
publishing at cadence, the missed-check-out timer still fires, the
alarm still sounds and PIN-locks. Plus one mid-range device passing
the same script. If the service can't survive WebView death, nothing
else in Phase 7 exists — this gate is the phase.

### 7.1R — Device recovery & intrusion evidence (parallel track)

Depends only on the 7.1 native shell + Phase 6 accounts — **not** on
the AI steps (7.2/7.3) and not on packs (7.4) — so it lands in
parallel with the voice work. Scope: the §8.2 readiness extension
(Find Hub/theft-toggle guided setup, Recovery Guard opt-in, Device ID
Kit + Recovery Code, practice drill); the lost-mode beacon +
mark-lost server effects (§8.4: room closure, device-token
revocation, retention clock); the recovery console (map, ring, lock,
incident pack, erase handoff); wrong-PIN selfies (§8.5); decoy-entry
video with the device probe + fallback ladder (§8.6); and the
**Intrusion & Evidence settings panel (§8.7)** — the features'
control surface ships in the same step, not after them.
**Gate:** scripted real-device test — from a second device, mark-lost
steps the beacon up, ring sounds, lock engages, and session-room +
device-token revocation is verified server-side; wrong-PIN captures
land in the vault and a threshold send fires *only* under the §8.5
conditions (lost mode / session + threshold); a decoy entry records
in the mode the probe assigned to *this* device, with segments sealed
after a mid-recording kill; every §8.7 toggle is proven to gate its
feature (off means off, tested, including upload settings behind the
real PIN). Console position *history* ships in the §8.8 D1-decided
E2EE shape: ciphertext server-side, in-browser decryption with the
user-chosen Recovery Code (PIN-default or custom, §8.2/§8.8). Outside
lost mode, the console's default view remains the last-known snapshot
and metadata — that is the normal-times presentation, not a pending
decision.

### 7.2 — Voice commands v1
Deterministic path only: sherpa streaming ASR + grammar/intent parser
(+ Vosk low-end fallback), the §6.2 registry, TTS read-backs, pack
lexicon hooks (base lexicon only). No LLM.
**Gate:** command suite on both test devices, in a noisy room —
≥95% of registry commands executed correctly from natural phrasing,
100% of *rejected* commands rejected safely (read-back + confirm, no
wrong-action executions in the suite), `endSession`/`stopMonitoring`
confirmation behaviour verified live.

### 7.3 — Audio monitoring v1
Tier 0 complete (VAD + KWS + YAMNet), RAM ring buffer, §5.3 ladder,
safeword enrollment + drill (§5.4), cancel grammar incl. duress
all-clear, §5.5 cancel logging.
**Gates:** (a) **Battery measured** — Battery Historian/Perfetto on
the Pixel + the mid-range phone over a 2 h armed session; Tier 0 must
land inside the §4.6 budget (target ≤7% mic-tier cost) before any
user sees it, and the measured number goes in the in-app disclosure.
(b) **False-alarm field test** — scripted corpus: TV dialogue
(incl. the safeword spoken on TV), music, laughter, consensual-volume
shouting, real scream samples; ladder must absorb every non-distress
case at steps 1–3 and climb on the distress set. If sherpa KWS
false-alarms fail this gate, Porcupine is evaluated as the paid
fallback (§4.2) before shipping — not after complaints. (c) Drill
mode verified to alert nobody, ever.

### 7.4 — Packs engine + first packs
Manifest validator + install/revocation pipeline (§7.6), settings
layering + provenance UI, mission switching + data partitioning
(§7.4), flavor wiring (§2.2/§3.6 — *after* Rob's §2 decision), and
the first packs: Dating & Social base mode, Real Estate, Field
Services, the generic Client Sessions pack (Play) and the
Entertainment pack (Direct).
**Gate:** golden-session suite green in every shipped pack × claimed
locale; validator red-team — a hand-built malicious pack (script in a
template, safety screen in `hidden`, 12 h grace period, unlisted
asset) is rejected on every count; cross-mission leakage test —
searching the client log in one mission surfaces nothing from another
without the deliberate all-missions toggle.

### 7.5 — LLM pack
AI-pack download flow (§4.5: prompt + size + hash/signature),
FunctionGemma 270M wired to the §6 registry through the Kotlin schema
validator, Gemma 3 1B as the optional free-form pack, Qwen2.5-1.5B
kept buildable as the license-clean swap.
**Gate:** adversarial command suite — malformed, ambiguous and
actively hostile phrasings ("send an alert to… everyone?", commands
buried in dictated notes) produce valid function calls or clarifying
questions, **never** an unvalidated execution; panic/duress paths
proven (by test, with the LLM loaded and mid-generation) to be
completely unaffected by model state; cold-load + per-command latency
measured on the mid-range device (target: command answered ≤4 s).
Fine-tuning FunctionGemma on Guardian's action set (~58% → ~85% per
Google's figures) is scoped here as a follow-up only if the gate shows
base accuracy is the bottleneck.

---

## 11. Risks & honest limits

1. **YAMNet cannot tell distress from consensual noise, a TV, or
   laughter — and may never reliably do so.** This is the phase's
   highest-risk item. The mitigation is architectural (the §5.3 ladder
   makes a false flag cheap and a missed flag non-fatal — the timer
   and check-in nets still exist underneath), plus the §5.5 local
   learning loop. Marketing must say "early-warning net," never
   "detects attacks." If field tests show the ladder still cries wolf
   too often for the flagship audience, monitoring ships
   safeword-only and the sound-event tier waits for the fine-tuned
   head. That is a legitimate outcome of 7.3's gate, not a failure to
   hide.
2. **Safeword spotting in real rooms is unproven until measured.**
   sherpa KWS's open vocabulary is the right tool, but false-alarm and
   miss rates on *user-chosen* words in noisy rooms are a 7.3
   measurement, not a spec-sheet fact. Porcupine is the paid fallback;
   enrollment drills (§5.4) are the UX mitigation.
3. **Battery numbers in §4.6 are engineering estimates** derived from
   component behaviour in the research — no primary source publishes
   a Guardian workload. They are gates to measure against (7.3), and
   no battery claim is published until the measurement exists.
   Sustained >1 W designs are wrong for a 2 h session by construction;
   Tier 0 is sized to sit under the thermal envelope, and the LLM is
   bursty or absent.
4. **Play review is a timeline risk, not just a rejection risk.**
   Background-location + per-type FGS declarations with demo videos
   can take weeks and one-feature-at-a-time iteration. Filed early
   (§9/§10), they run parallel to the build; filed late, they *become*
   the launch date. Category hostility (RESEARCH_V2's standing
   warning) is answered by the §2 flavor split — which is itself
   **Rob's pending decision**, and the Play door does not exist until
   he makes it.
5. **The flavor split has a real human cost.** Sideload friction for
   direct users, a signing-key bridge instead of seamless migration
   (§2.3), and a generic Play listing that cannot speak to the
   audience that built Guardian. The alternative — putting the
   flagship's words in Play — risks the whole developer account, not
   just one listing. There is no third shape in the policy texts;
   §2.4 prices the chosen one honestly.
6. **Model/runtime churn.** LiteRT-LM is pre-1.0 with a fast cadence
   (pin everything; llama.cpp is the escape hatch). Gemma weights
   carry Google's Terms, not an OSI license (Qwen2.5 is the clean
   swap). sherpa's zh-en KWS model has no license file (excluded
   until clarified). Every one of these is a *known* risk with a
   named fallback — the discipline is not discovering a fourth kind
   in production.
7. **Voice control fails where speech fails.** Accents, whispers,
   loud rooms, a user who cannot speak freely in front of the person
   she's monitoring — voice is an *additional* surface. Every voice
   action keeps its tap equivalent, tap-reply chips (shipped in
   v0.10's caller) remain the silent path, and a user who never
   enables the mic loses nothing but the new surface.
8. **The Noonlight expectation gap survives Phase 7.** In the generic
   market some users will expect a professional monitoring centre
   that dispatches emergency services. Guardian alerts **the user's
   own circle** — by design, for privacy reasons the generic packs
   don't change. §9.4's copy rules exist so the first bad review
   doesn't write itself; positioning, not features, carries this.
9. **Packs are copyable; the moat is underneath them.** If packs
   succeed, bSafe-class competitors can add "profiles" within a
   release cycle, and Tether RE already owns real-estate channel
   deals. The defensible layers are the ones packs re-tune rather
   than create: session-scoped E2EE privacy (per-session keys, no
   central client database), safety + business tooling in one place,
   and data-partitioned mission switching. Packs ship *with* those,
   or they are a skin store on a commodity SOS button.
10. **Recording-consent law varies and Guardian stays out of it by
    design.** Monitoring records nothing and transmits no audio; the
    moment any future feature proposes storing or sending audio
    (beyond the existing, user-triggered panic A/V), it needs its own
    legal review per jurisdiction — it is not a pack, not a setting,
    and not a Phase 7 item.

## 12. Phase 8 — Low Signal Mode, Command & Control, and the circle mesh

*Written 2026-11-05, alongside app v0.12.0 ("Phase 8a"). Rob's field
feedback — sent after real dates — is the requirements source: the app
must detect when the signal dies, say so, and behave like the date is
still happening anyway; the user needs one screen that answers every
"what's going on right now" question without digging; and when her
circle asks, the app answers with exactly the facts she chose to share
and nothing else. §12.0–§12.6 spec what v0.12.0 SHIPPED app-side (all
self-contained, no new servers). §12.7–§12.10 spec the Phase 8 backend
that turns these local mechanisms into a real circle mesh. The hard
rules that govern the whole section, stated once: **zero-knowledge
stands** (dossier data lives on the device; circle-share toggles
default OFF; status bundles are generated on-device and carried by the
session's end-to-end-encrypted channel); **connectivity detection is
advisory only** — no safety path waits on it, and Low Signal Mode never
delays, gates, or alters a panic/SOS in any way; it only adds
redundancy; and **PIN semantics are unchanged** — the ticker gate
mirrors the lock screen exactly (real PIN/passkey opens real data;
duress alerts silently and shows a bland page; decoy shows a bland
page; neither fake PIN ever reveals Command & Control).*

### 12.0 What shipped in v0.12.0 (app-side, verified)

- **Escalation became a condition set** (`lib/escalation.ts`): named
  conditions with levels, reasons, and start times — `lowsignal`,
  `manual`, `panic`, `missed`, `rescue`, `concern`. The active level is
  the max; the "why" is always answerable from the condition list.
  Level naming: 1 Normal · 2 Heightened — and specifically **Low
  Signal Mode** when a lowsignal condition is the driver · 3 Emergency.
- **Connectivity detection** (`lib/connectivity.ts`): five signals —
  `navigator.onLine` + online/offline events, live sync-connection
  state, consecutive send outcomes reported by the dispatch layer,
  encrypted-outbox depth, and the Network Information API
  (`effectiveType` 2g/slow-2g). Engaging Low Signal Mode requires either
  a hard signal (offline, or sync down with a non-empty outbox) or two
  stacked soft signals; clearing needs 45 s of all-clean so the mode
  never flaps mid-date.
- **Multi-path blast with delivery learning** (`lib/blast.ts`,
  `lib/dispatch.ts`): on connectivity trouble (or for any critical
  message), every configured automated path fires at once — both to get
  the message out and to probe which networks exist. Each path's
  confirmations/failures are recorded per session; subsequent sends
  lead with confirmed paths, then everything else — **including the
  built-in self-hosted ntfy push** — fires as a second wave 5–10 s
  later (user-configurable 5/7/10). Panic and missed-checkout now route
  through this dispatcher; the sync publish, SMS relay text, and push
  text are byte-identical to what they replaced.
- **Event log + news ticker** (`lib/events.ts`,
  `components/NewsTicker.tsx`): every status change, check-in, circle
  communication, remote command, and app-executed command lands in a
  Dexie `events` table (DB v5) and rotates through a bottom ticker on
  every owner screen. The ticker is a security boundary, not decoration:
  tapping it runs `components/PinGate.tsx`, which reproduces the lock
  screen's decision order bit-for-bit. The duress and decoy fakes are
  content-free status pages — by design they contain zero real data,
  not even a session's existence.
- **Command & Control** (`screens/CommandScreen.tsx`): the cheat sheet
  reads ONLY existing local stores — active session (+ linked booking
  via `clientId`/`bookingId` carried from the booking board, else a
  time-window match), clients/dossier, per-date ratings (new: bookings
  carry a 1–5 rating, set on the board or in the dossier), check-ins
  (from the event log), battery (existing tracking state), network
  (Network Information API), escalation conditions, circle log (§12.7).
  GPS match = live position vs the session's incall/outcall point within
  the existing arrival radius; it reports a match, a distance, or
  "unknown" — never a fabricated position.
- **Status ping + share toggles** (`lib/statusping.ts`): dossier rows
  gain `shareNotes` / `shareRatings` / `shareHistory`, default OFF,
  edited in the client record with plain-language copy. The bundle
  builder is a pure function that (a) includes dossier fields only when
  toggled on, (b) returns the list of what it withheld, and (c) excludes
  deposit/payment detail by construction — C&C previews the exact text
  and the withheld list before the user ever relies on it. Watchers
  gained remote-command buttons (full status, live stream, fake call)
  on the watch page; the owner app answers a status request
  automatically with the filtered bundle over the encrypted session
  channel, executes a fake-call request via the existing scheduler, and
  treats a stream request as consent to start the existing broadcast.
- **Quick requests** (`lib/quickrequests.ts`): Rob's 23-item menu —
  status signals, the verbatim siren/armed-guard warning request,
  extensions (+15/30/60/120 actually extend the session clock),
  rescue, door knocks (now / +5 / +10 / +15 / +20 / +30 / at scheduled
  end), all-clear, and cancel-last-request. Timed requests persist as
  scheduled follow-ups (`guardian.followups.*`) fired by an App-level
  host loop, so they survive leaving the session screen; they are
  circle ALERTS — Guardian never dispatches anyone and never claims to.
- **Backup-paths setup**: the Sis wizard grows a 9th step ("Backup
  plans 📡") and Settings gains the same card
  (`components/BackupPathsCard.tsx`). Only real paths are listed:
  encrypted live session (always on), built-in Guardian push over
  self-hosted ntfy, SMS relay (automated), and share sheet / SMS
  composer / email as honestly-labeled manual paths. Unconfigured paths
  say so and link to their setup — the catalog never advertises a path
  that cannot fire.

### 12.1 Low Signal Mode semantics (the contract)

1. Detection inputs are exactly the five signals above; no heuristic
   may engage the mode on a single soft signal (one failed send is a
   hiccup, not a dead zone) — false "LOW SIGNAL" banners train users to
   ignore the real one.
2. Engaging is a *label + posture* change only: escalation Level 2,
   reason recorded, ticker announces it, dispatch posture switches to
   probe-blast (§12.2). Nothing else in the app may key behavior off
   the flag except presentation (ticker badge, C&C) and dispatch.
3. Clearing requires sustained clean signals (45 s hysteresis) OR the
   session ending. A panic does not "clear" Low Signal; the conditions
   coexist, and the level is always the max of the set.
4. **Never a gate.** If connectivity detection itself fails (API
   absent, monitor crashed), the app behaves as v0.11 did: sends
   attempt immediately on every path the send already used. Detection
   can only add paths and ordering intelligence; it cannot remove or
   delay any.

### 12.2 Blast + learning rules

1. **Probe rule:** a send is a probe when (a) Low Signal Mode is
   active, or (b) the message is critical (panic, missed checkout,
   rescue, violent-client). Probes fire all configured automated paths
   concurrently. Non-probe sends use the ranked order (§12.2.2).
2. **Ranking:** per session, a path is *confirmed* when its latest
   outcome is a success; ordering is confirmed (freshest first) →
   never-tried → failed (least-recent failure first). Ties break
   toward the zero-knowledge session channel, then ntfy — the two
   paths Guardian itself operates.
3. **Second wave:** critical sends re-fire the not-yet-confirmed
   automated paths after the configured delay (5–10 s), and the
   built-in ntfy path is ALWAYS in that wave even if it led wave one —
   push is the path most likely to traverse a network the data paths
   can't.
4. **Honesty of "confirmed":** for the sync path, confirmation means
   the connection was live at send (queued-in-outbox does NOT count —
   the v0.11.2 lesson, applied here too); for SMS, the relay (or the
   user's own Messages send) reporting a real send; for ntfy, HTTP
   acceptance by our server. Delivery confirmation is transport-level
   only — it never implies a human read anything, and no copy may say
   otherwise.
5. **Flavor availability:** Play/generic flavor — SME-class paths
   only, per §2's messaging constraints; the direct flavor adds the
   full catalog. The path catalog is data, so flavors filter it
   without code changes.

### 12.3 Ticker + gate invariants

1. The ticker shows the event log, never raw store contents: event
   text is written at the moment things happen, so the ticker cannot
   leak a dossier field by accident.
2. Duress through the ticker behaves EXACTLY as duress through the
   lock screen: silent emergency alert to the circle, then a bland
   page. An attacker who knows the app must learn nothing from the
   fake — including that an alert was sent.
3. The gate is skipped only when the user has set no PIN at all
   (consistent with the rest of the app); passkey unlock counts as the
   real identity, same as the lock screen.

### 12.4 C&C data contract

Every C&C field names its source store and its "unknown" behavior
(position unavailable → say so; no booking link → time-window match or
"no booking linked"; battery API absent → "not reported by this
device"). The screen is a *reader*: it executes nothing except the
circle actions in §12.6 and the manual status send. In particular it
never writes dossier data, never changes settings, and never cancels a
panic — stand-down remains on the session screen behind the existing
panic PIN gate.

### 12.5 Status ping protocol

1. Transport today: the session's E2EE sync channel (`status-request` /
   `status-reply` alert types; the bundle rides the encrypted `data`
   field). Phase 8 transport: §12.7.
2. Bundle contents are the session facts (busy status, start, scheduled
   end, next booking today, last check-in, location + match,
   escalation) ALWAYS, plus dossier fields (notes, ratings, history)
   ONLY under their per-client toggles. Circle-executed commands this
   session are summarized from the event log.
3. The owner app auto-replies to a status request from a circle member
   who is ON the live session — there is no per-request approval tap,
   because mid-date she cannot tap anything; the approval is the
   toggles, set in advance, in the dossier. Changing a toggle mid-date
   changes the next reply.
4. Requests from identities not on the session are dropped and logged;
   the bundle is never broadcast to non-members.

### 12.6 Quick requests + follow-ups

1. Requests are data (catalog), so packs (§7) can re-label them
   without touching dispatch. Severity drives posture: `critical`
   requests blast with probe rules; `watch` requests raise a Level 2
   concern condition until stood down or the date ends.
2. Extensions mutate the session clock and publish the new state —
   the circle's view of "late" must move with them, or every extension
   manufactures a false missed-checkout.
3. Follow-ups (siren/knock timing) are scheduled alerts to the circle,
   persisted locally, fired by the App-level host; if the app was
   closed when one came due, it fires late-and-labeled on next open
   rather than never.
4. **Cancel last request** cancels pending follow-ups of the most
   recent timed request AND notifies the circle — a cancellation that
   only deletes local state would leave the circle acting on a request
   she already withdrew.

### 12.7 Circle presence + remote commands — today vs Phase 8

**Today (v0.12.0):** presence is what the sync layer already proves —
watch-page heartbeats give joined/last-active; a member is "watching
now" only within a 45 s heartbeat window; acks are the only "responses"
that exist, so the circle log shows acks and remote commands and
claims nothing about message reading (sync has no read receipts and
v0.12.0 does not invent any). Remote commands ride the encrypted
session channel: status-request (auto-answered, §12.5),
stream-request, fakecall-request, ack, DM.

**Phase 8 backend (the spec):**
1. **Chat:** Matrix homeserver **Tuwunel** on guardian-core (per the
   adoption study: maintained Conduit-family fork, fits the A1.Flex),
   clients **Cinny**-based (AGPL kept at arm's length: hosted client,
   no code import into the app). Per-circle 1:1 rooms + one full-circle
   room per user; disposable display identities for the direct flavor,
   per §10/§11 naming rules. Voice: MatrixRTC when it proves out on
   Tuwunel; the in-app voice-call buttons stay honest stubs until then
   (LiveKit self-host is a Watch item — too heavy for the current box
   pair; revisit with Phase 9 streaming).
2. **Transport duality:** remote commands and presence travel BOTH the
   Matrix room AND our ntfy topics (`guardian-*`, per-user ACLs as
   shipped in the ntfy build-out) — Matrix for richness, ntfy for the
   content-free wake-up ping that survives Matrix being down, and the
   session sync channel remains the third, session-scoped path.
   Commands are idempotent, carry a nonce + issue time, and expire
   (5 min) — a replayed or stale command is a log entry, not an action.
3. **Presence honesty carries forward:** Matrix presence is advisory in
   every client; the circle log keeps the same rule — heartbeats and
   explicit actions are facts, "reading" is never inferred.

### 12.8 Remote command execution rules (deterministic, no AI)

1. The executable set is a whitelist, executed by a deterministic
   state machine on the owner's device: send status bundle, start
   stream, schedule fake call, surface DM. Nothing else is remotely
   executable — in particular NOT: stand down a panic, cancel an
   alarm, change settings/PINs/sharing, delete anything, or disclose
   any field outside §12.5's bundle.
2. **Remote can fire, never cancel** (the Bluetooth rule, §3.7,
   generalized): a circle member can raise the alarm level from afar;
   only the owner — on device, real PIN, existing panic gate — can
   lower it.
3. Under duress/decoy unlock states, inbound commands execute only
   their silent subset (status replies carry the toggles' fields but
   the device shows nothing); the bland fake pages never change.
4. Every remote command and its execution result land in the session
   event log (ticker + C&C) — the audit trail is the feature: after a
   bad date she can see exactly who asked for what, when, and what the
   app did.
5. AI never enters this path. No model decides whether a command is
   "really" urgent, summarises a bundle, or speaks for the owner; the
   Fake Call's conversational AI (§3) is a separate, user-initiated
   surface and changes nothing here.

### 12.9 Build order + dependencies

1. **Adoption-study Adopt-Now floor first** (backups/monitoring) —
   Phase 8 adds stateful services to boxes that currently have no
   backups; Tuwunel's room state joins ntfy auth DB + TTS as
   must-restore data.
2. Tuwunel + Cinny on guardian-core; account model reuses the Supabase
   identity (Matrix IDs minted per circle membership, never per real
   name). Blocked until ntfy's public path is live (the Cloudflare DNS
   grey-cloud flip) — Matrix federation is NOT required (closed
   circles), so a single-host deployment behind the same proxy pattern
   as voice.blacklisted.studio works.
3. Presence/command duality (§12.7.2), then WITNESS (stream +
   heartbeat + chat) and GHOST EAR (trusted contact puppeteering the
   Fake Call from the E2EE room) from the adoption-study combos — both
   assume §12.8's rules verbatim.
4. Native pass: the same screens and rules port to the native build
   (§3) with Background Service transport replacing sync heartbeats;
   nothing in §12 is PWA-specific except the Network Information API
   fallback (native reads TelephonyManager directly).

### 12.10 Honest limits

- "Confirmed delivery" is transport acceptance, not human attention;
  the circle log's job is to make the gap visible, not close it.
- Battery/network telemetry is best-effort per platform (iOS PWA
  reports neither reliably); C&C says "not reported" rather than
  guessing — a safety screen that guesses is worse than one that
  admits.
- Presence windows (45 s) trade freshness for battery; a member whose
  phone died shows "last active" honestly, which is itself signal.
- Low Signal Mode cannot create signal. Its value is ordering,
  redundancy, and telling the truth about the situation on the ticker
  and in C&C while the outbox + second wave keep trying — the moment
  any path breathes, the queue drains through it first.

---

*Sources: `.phase7-research/play-policy.md` (Google Play Policy Center
+ Android Developers, primary texts, incl. Deceptive Behavior,
Device and Network Abuse, Malware/Stalkerware/Spyware, User Data,
Permissions & FGS, Sexual Content, Families, Data Safety),
`.phase7-research/ondevice-ai.md` (sherpa-onnx, Silero VAD, YAMNet,
whisper.cpp, Vosk, LiteRT-LM, FunctionGemma/Gemma/Qwen model cards,
Capacitor plugin docs, Android 14/15 FGS docs),
`.phase7-research/pack-architecture.md` (manifest schema, CAN/CANNOT
lists, launch scoring — NAR, BLS, NNA, Rover market evidence — and the
Noonlight/bSafe/Life360, SHEQSY-class and Tether RE competitor scan),
`.phase7-research/device-recovery.md` (Find Hub / device-admin /
concurrent-camera primary docs, Prey and Cerberus precedents, RCW
9.73.030).
Internal: README.md (v0.5–v0.11.1 feature history), BLUEPRINT_V2.md,
SETUP_AND_ACCOUNTS.md in this repo.*

*Star counts and model figures were retrieved 2026-11-02 in the
research docs above; re-pull before quoting any of them publicly.*
