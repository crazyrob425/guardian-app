# Guardian — Deep Research v2 (2026-11-01)

Three research lanes, all run 2026-11-01: **(1)** community voice — what escorts, adult
entertainers, and in-person sex workers actually want/need (interview studies, worker-written
guides, community orgs, app reviews — see Sources; direct Reddit access was blocked, so claims
rest on peer-reviewed interview research and worker-written sources, not scraped threads);
**(2)** competitor teardowns (17 apps/services); **(3)** 37 GitHub repos vetted live via the
GitHub API (stars/push/license as of 2026-11-01), on top of the 25+ in BLUEPRINT_V2.md.

---

# Part 1 — The Guardian audit (inside-out, current state v0.4.3)

**What exists:** PIN lock + duress PIN (silent coercion alert), press-hold SOS, session
check-in/out with 5-min grace → missed-checkout escalation, GPS publish every 10 s with
geofence arrival, encrypted (AES-GCM-256) expiring-key watch/client links over public MQTT,
hand-rolled WebRTC emergency A/V (Google STUN only), 6 alarm sounds + custom sound file,
panic alarm PIN-lock, free ntfy push + native share sheet + watch-page loud alerts, BTCPay
invoices + Stripe payment links, safety circle, discreet label mode, full settings suite.

**The gaps the research exposes (ranked by how much the audience cares):**
1. **No screening workflow** — the #1 daily practice of the audience has zero support.
2. **No memory** — no session history, client notes, or journal; every date evaporates (and
   with it the evidence + retention value).
3. **Payments are a doorway, not a system** — no deposit policy templates, cancellation
   ladders, booking board, or rebooking flow.
4. **English only.** Spanish is the obvious first gap for this audience.
5. **No crash-proofing** — no error boundary, no tests, no offline queue (Phase 1 fixes the
   queue), no diagnostics.
6. **Settings sprawl** — power without guidance; nothing walks a new user to a safe config.
7. **Single point of failure in alerts** — if the send fails, nothing escalates on *silence*;
   escalation is send-based, not silence-based.
8. **Photo privacy** — no EXIF check/strip before she shares images (a documented doxxing
   vector).

---

# Part 2 — What the audience actually wants (community voice)

Top wants, ranked (full detail + quotes in research notes; sources below):
1. **Rigorous screening before any meeting** — name, real (non-burner) number, references,
   ID+selfie, employment verification at the high end. Hesitation = decline.
2. **Bad-date lookup that is worker-only, secret, and un-leakable** — hashed identifiers,
   vouched access; a leaked list is a dead list (clients change SIMs).
3. **Buddy check-in with real escalation** — Guardian's core; validated as a top-3 want.
4. **Location shared with a trusted *person*, never a company** — per-session, expiring,
   encrypted. Battery level matters (a dying phone is a known failure mode).
5. **Deposits that enforce policy** — 20–30% typical, 30–50% first-timers/high-end, $50 flat
   common; non-refundable; 50%-at-48h / 100%-at-24h cancellation ladders; always for new
   clients, 3h+ bookings, and touring/FMTY.
6. **Payment rails that can't seize the money** — 63% of surveyed workers have lost a bank
   account or payment tool over their work (FSC/SexWorkCEO 2023, n=600+); ~60% whose funds
   were held never recovered them (Ditmore et al., n=440). Cash still king for balances;
   crypto loved for finality, hated for off-ramp complexity.
7. **No-show / time-waster filtering** — deposits + screening *are* the filter.
8. **A fully separate, disposable work identity** — alias everything; no real-name linkage.
9. **Doxxing defense** — EXIF, reverse image search, data brokers.
10. **A phone that isn't evidence** — minimal retention, expiring data, nothing subpoena-able
    server-side because nothing exists server-side.
11. **One worker-only home for safety knowledge** (platforms keep deleting it).
12. **Discreet exit tools** — fake call, silent SOS. 13. **Private client notes** (retention
    = remembering preferences). 14. **Permission-based, deniable rebooking follow-up** —
    regulars are 75%+ of income for many; the practiced flow is follow-up → thanks → review
    ask → explicit recontact permission → next-booking prompt. 15. **Bookkeeping that doesn't
    out them.** 16. **Local early-warning networks.** 17. **Touring support** (mandatory
    deposits, itinerary to a home buddy). 18. **Works on cheap phones / thin data** — SMS
    fallback, graceful offline. 19. **Availability boundaries** (anti-burnout auto-replies,
    windows). 20. **Directory of non-stigmatizing professionals** (health, legal, tax).

**The 10 trust objections (design requirements in disguise):** (1) data must not exist to
become police evidence; (2) blacklists must never leak to clients; (3) false-report fairness —
corroboration + dispute path, or the list loses credibility; (4) the platform must not be able
to disappear with her data/money — export everything, custody nothing; (5) free core, no card
before value; (6) must beat the WhatsApp-group + spreadsheet baseline on effort or it's
shelfware; (7) nothing may out her — neutral name/icon options, innocuous notifications,
neutral payment descriptors; (8) support must answer; (9) it must work in the moment — dead
battery, no data, escalation on silence; (10) no identity paper trail — alias accounts, no KYC.

---

# Part 3 — Competitor lessons (17 teardowns, distilled)

**The 8 most-praised behaviors across all incumbents:**
1. A human/process **confirms before and after escalation** (Noonlight's text→call→dispatch
   ladder + follow-up check-ins — the single most praised behavior in the category).
2. **Coded, discreet one-tap messages** (Circle of 6's icons — the most-copied UX in safety
   history; its successor Círculo is E2EE + no-name onboarding).
3. **Fake call / graceful exit** (bSafe's most-cited feature).
4. **Off-device evidence that survives the phone** (bSafe's streamed recordings).
5. **One-input screening verdicts** (a number → instant context: VerifyHim, Truecaller,
   UglyMugs).
6. **Session/timed sharing that ends itself and reports the ending** (Follow Me, Apple
   Check In, the buddy protocol).
7. **Arrival/place alerts + reciprocal visibility** (Life360, Find My — when mutual/bounded).
8. **Handles, not legal names** ($cashtags, work numbers: identity separation).

**The 5 trust-destroyers:**
1. **The alert that doesn't fire / fires late / sends a stale location** (bSafe "works 10% of
   the time"; one witnessed failure = permanent churn + a story told to every peer).
2. **Money or identity held hostage** (Cash App/Venmo freezes — 2/3 of workers affected;
   VerifyHim's paywalled safety; Google's one-stroke account death; Burner's recycled number).
3. **Privacy betrayal at scale** (Life360 sold ~50M users' location data; Truecaller's
   contact-graph harvesting; alleged verification-photo reuse at Eros).
4. **Pricing deception at the moment of need** (UrSafe's $1.99→$7.99 checkout swap; bSafe's
   paid-but-never-activated premium).
5. **Abandonment & amputated features** (Circle of 6 unmaintained; ProviderBuzz vanished
   overnight — suspected libel suit; UglyMugs.ie lost call-screening under legal pressure).

**Gold-standard consent architecture (National Ugly Mugs / UglyMugs.ie):** sharing with police
only with explicit per-report consent; alerts legally *sanitized* (warn without naming);
**"checks are not logged"** as a stated guarantee; human caseworker tone after incidents.
Guardian's circle-local private log is the resilient, survivable form of the same idea —
public/central accusation databases die by libel (ProviderBuzz) and become honeypots.

**Positioning conclusion:** the unoccupied ground — free, account-less, no-custody,
session-based, PIN-locked, circle-powered, with confirmation loops and consent-gated sharing —
is exactly where Guardian stands. Winning moves: Noonlight's confirmation ladder, Circle of
6's coded grammar, NUM's consent architecture, UglyMugs' "checks are not logged" promise,
executed with bSafe's feature breadth and none of its unreliability.

---

# Part 4 — The 37 repos (beyond BLUEPRINT_V2.md's 25+)

Verdicts: **ADD** = adopt code/API · **PATTERN** = steal design, write our own · **SKIP**.

## Money / screening / booking / business

**1. btcpayserver/btcpayserver** — ★7,879 · MIT · pushed today · **[ADD — API, already ours]**
Self-hosted Bitcoin processor; Greenfield API for invoices/links. Repurpose: (a) invoice
states (new→paid→confirmed) drive Guardian's "deposit received ✅" session gate automatically;
(b) its invoice-metadata shape templates deposit requests for any processor. Pros: no fees, no
platform that can deplatform her — existentially important here. Cons: needs a running
instance; BTC UX friction for clients.

**2. invoiceninja/invoiceninja** — ★10,446 · **source-available, NOT open source** ·
**[PATTERN]** Full invoicing product. Repurpose: its invoice lifecycle + client-portal UX
(view→pay→receipt→reminder cadence) and recurring/late-fee models for regulars billing.
Pros: most complete invoicing UX anywhere. Cons: license forbids offering as a service; PHP
server; overkill.

**3. calcom/cal.diy** — ★49,629 · MIT · pushed 2026-11-01 · **[ADD — link/embed]**
The Calendly-killer. Repurpose: (a) hosted booking page with availability windows, buffers,
min-notice and no-show rules linked from Guardian at $0; (b) its webhook vocabulary
(BOOKING_CREATED/RESCHEDULED/CANCELLED) defines the events Guardian's session flow mirrors.
Pros: clients already trust the pattern. Cons: self-hosting needs a server+DB; embed relies on
a third-party account.

**4. alextselegidis/easyappointments** — ★4,473 · GPL-3.0 · **[PATTERN]** Self-hosted
appointment scheduler. Repurpose: its services×durations×availability×customer data model is
exactly a date-booking schema — implement *locally*; its customer-record fields template the
private client log. Pros: battle-tested solo-provider schema. Cons: GPL, PHP, dated UX.

**5. sebbo2002/ical-generator** — ★858 · MIT · **[ADD]** Tiny .ics calendar-file generator.
Repurpose: (a) one-tap "add date to calendar" for her *and* an .ics for the client via the
share menu (a date in his calendar = fewer flakes); (b) export her booking/journal history to
any calendar — portability = trust. Pros: MIT, small, TS-native. Cons: .ics is static (no
live updates).

**6. catamphetamine/libphonenumber-js** — ★3,003 · MIT · **[ADD — highest value-per-KB here]**
Google's phone-number parser in JS: validity, formatting, carrier region, line type
(mobile/landline/**VoIP**). Repurpose: (a) screening step zero — paste a number, instantly see
"valid mobile" vs "VoIP/burner-style" vs invalid (a standard screening signal, computed
on-device, nothing leaves the phone); (b) E.164 canonicalization so the private log matches
the same number in any format. Pros: MIT, zero network. Cons: VoIP detection is a *hint*,
never a verdict — present it that way.

**7. naptha/tesseract.js** — ★38,802 · Apache-2.0 · **[ADD — lazy-loaded]** Full OCR in the
browser (WASM). Repurpose: (a) screenshot-to-screening — OCR a client's texts/profile
screenshot and extract number/name/handles into the screening form, killing manual retyping
(the #1 screening friction); (b) OCR deposit screenshots to auto-fill amount+sender in the
payment log; (c) on-device ID-text extraction for her own notes (image never uploads — the
privacy story *is* the feature). Pros: Apache, zero server. Cons: multi-MB WASM — load
on-demand only, never in the precache; confirm-before-save for accuracy.

**8. mattiasw/ExifReader** — ★1,004 · MPL-2.0 · **[ADD]** Reads EXIF/XMP/IPTC (incl. GPS)
from photos in-browser. Repurpose: the "what does this photo reveal?" checker — warn before
she sends/posts a photo carrying GPS coordinates (a documented doxxing vector). Pros:
maintained, broad formats, file-level copyleft is clean. Cons: read-only; pair with #9.

**9. hMatoba/piexifjs** — ★616 · MIT · stale (2021) · **[ADD — vendor the snippet]** Writes/
removes JPEG EXIF client-side: the strip half of #8. Honest note: a plain canvas re-encode
strips everything and is more future-proof; piexif is the precision option. Pros: tiny, MIT.
Cons: unmaintained, JPEG-only — vendor it, don't depend on it.

**10. disposable-email-domains/disposable-email-domains** — ★5,654 · data list, updated daily
· **[ADD — data]** The canonical burner-email domain list. Repurpose: a booking inquiry from
a disposable domain gets a "burner email" flag in the pre-date checklist (same hint tier as
the VoIP flag). Pros: trivial size, zero runtime cost. Cons: hint only — false positives
exist; never present as proof.

**11. monicahq/monica** — ★25,562 · AGPL-3.0 · **[PATTERN — the richest business pattern
here]** The beloved personal CRM (birthdays, debts, last-contact, notes). Repurpose: its
relationship-journal fields are the checklist for Guardian's **regulars book** — last seen,
preferences, agreed rate, deposit owed, re-engagement reminders — implemented on-device and
encrypted. Retention is income; remembering is the product. Pros: a decade of personal-CRM
thinking. Cons: AGPL + PHP server — zero code crosses.

**12. twentyhq/twenty** — ★60,271 · AGPL/mixed · **[SKIP beyond one idea]** Open Salesforce.
Only its pipeline view translates: inquiry → screened → deposit → booked → completed columns
as Guardian's booking board. Cons: heavyweight server app; Salesforce thinking is the wrong
shape for a solo provider's phone.

**13. LinkStackOrg/LinkStack** — ★3,935 · AGPL-3.0 · **[PATTERN]** Self-hosted Linktree
(themes, verified links, age-gate, click stats). Repurpose: its feature checklist defines the
public links page providers want — on the BNE site, *outside* the app's privacy perimeter.
Cons: AGPL, PHP, public-marketing tool.

**14. sethcottle/littlelink** — ★3,117 · MIT · **[ADD — for the site]** Featherweight static
Linktree (one page, 30+ maintained brand buttons). The realistic $0 version of #13 for the
public site. Pros: MIT, zero deps, deployable today. Cons: static (no analytics), not app
functionality.

**15. kozakdenys/qr-code-styling** — ★2,976 · MIT · **[ADD]** Styled QR generation (rounded
modules, gradients, center logo). Repurpose: **luxury deposit QRs** — her BTCPay/Stripe link
as a branded QR on the payment-request screen and shareable as an image; booking-page QR for
in-person networking. Pros: MIT, TS, canvas/SVG. Cons: enforce high error-correction so
styling never breaks scannability.

**16. mebjas/html5-qrcode** — ★6,245 · Apache-2.0 · **[ADD — when a scan flow ships]** In-
browser QR/barcode scanning. Repurpose: scan a client's payment-confirmation QR; later,
scan-to-pair circle devices instead of link-copying. Pros: Apache, works in iOS Safari PWAs.
Cons: camera-permission UX needs care; moderate size — never preload.

**17. akaunting/akaunting** — ★10,264 · GPL-family · **[PATTERN]** Full small-business
accounting. Repurpose: only its chart-of-accounts/tax-category thinking — Guardian's
on-device earnings+expenses+mileage log with CSV tax-season export uses real accounting
categories (minus the server). Mileage itself needs no repo: it's math over the Phase-1 GPS
trail. Cons: server PHP, license, enormous scope.

## Safety depth / comms

**18. huggingface/transformers.js** — ★16,396 · Apache-2.0 · **[ADD — journal phase]**
Browser ML runtime (Whisper etc. in-page, no server). Repurpose: (a) **on-device transcription
of panic audio / voice notes** — the evidence journal gets searchable text, audio never leaves
the phone; (b) on-device language detection; (c) future screening text-classification. Pros:
Apache, HF-maintained, "AI runs on YOUR phone" is an unbeatable privacy story. Cons: ~40 MB
Whisper-tiny download — opt-in, Wi-Fi-cached, never bundled.

**19. ggml-org/whisper.cpp** — ★54,849 · MIT · **[MAYBE — pick ONE of #18/#19]** The canonical
Whisper port with a browser WASM build; smaller, license-pure alternative engine for the same
transcription feature. Pros: MIT, footprint. Cons: hand-rolled WASM integration. Don't ship
both — transformers.js wins on developer experience, whisper.cpp on purity.

**20. ente/ente** — ★29,819 · **AGPL-3.0** · **[PATTERN — no code]** Production E2EE photo
vault (Ente Photos). Repurpose: (a) its encrypted-thumbnail+original vault UX is the gold
standard for Guardian's **evidence vault**; (b) its passphrase key-derivation + recovery-key
flow models encrypting the log/journal at rest with a key we never see. Pros: best-in-class
flows, proven at scale. Cons: AGPL is a hard wall; it's a platform, not a library.

**21. valhalla/valhalla** — ★6,394 · license unverified via API · **[PATTERN/hosted, later]**
Industrial routing (pedestrian costing, isochrones, map-matching). Repurpose: (a) "safe route
home" pedestrian routing; (b) isochrone = "who in my circle can reach me in 10 minutes";
(c) map-matching to snap the GPS trail to streets for journal replay. Pros: best pedestrian
costing available. Cons: self-hosting breaks $0; demo endpoints are favors, not
infrastructure; never life-safety-critical.

**22. Project-OSRM/osrm-backend** — ★8,186 · BSD-2 · **[ADD — soft dependency]** The fastest
OSM router; public demo server. Repurpose: client ETA v1 today (drive/walk ETA into the watch
view) with graceful fallback to straight-line Turf math. Pros: BSD-clean, dead-simple HTTP.
Cons: demo server is fair-use — replace at scale (that's what the fallback is for).

**23. ushahidi/platform** — ★734 · AGPL-family · **[PATTERN]** The original crisis-mapping
platform: structured incident reports, severity, evidence attachments, moderation workflow.
Repurpose: the **incident-report data model** for the private bad-client/incident log, and the
moderation design for any future circle-only area alerts (never a public map). Pros: 15 years
of incident-workflow design to copy free. Cons: PHP, AGPL-family — zero code crosses.

**24. matrix-org/matrix-js-sdk** — ★2,194 · Apache-2.0 · **[SKIP — honest]** The official
Matrix E2EE chat SDK. Why skip: it needs a homeserver — matrix.org would hold her metadata,
self-hosting breaks $0 — and its E2EE device-verification UX is notoriously confusing, the
opposite of "no extra apps, no homework." Guardian's Phase-3 PartyServer rooms + libsodium
chat delivers in-app encrypted chat with a fraction of the surface. Revisit only for
federation.

**25. gotify/server** — ★16,164 · license unverified via API · **[PATTERN/docs]** Self-hosted
push server ("your own ntfy"). Repurpose: the documented escape hatch for power users/orgs
who want push that never touches ntfy.sh; the **UnifiedPush** ecosystem (android-connector
★38, Apache-2.0) lets Android users pick their own distributor. Also free without any repo:
carrier **email-to-SMS gateways** (number@vtext.com etc.) as a Settings hint + SMS-relay
pattern. Cons: needs a server we don't have; adds nothing for the default user today.

**26. schlagmichdoch/PairDrop** — ★11,733 · GPL-3.0 · **[PATTERN — write our own ~200
lines]** The beloved Snapdrop successor: room-code + WebRTC datachannel file transfer.
Repurpose: its design is exactly "send my journal/evidence export to my circle contact
standing right here" with no server seeing the file — and a future "move my data to my new
phone" flow. Cons: GPL blocks code reuse — the design is all we take.

## Reliability / crash-proofing

**27. GoogleChrome/workbox** — ★13,040 · MIT · **[ADD — recipes]** Already under the hood via
vite-plugin-pwa; this is its advanced playbook. Repurpose: (a) **app-update UX done right** —
workbox-window's waiting→prompt→skipWaiting flow with a luxury "New version — tap to refresh"
toast, killing the stale-cache gremlin that bit our v0.4 tests three times; (b) background-sync
complementing the Dexie outbox; (c) navigation-preload tuning for instant opens on bad
networks. Cons: recipe-level work, not a drop-in.

**28. vitest-dev/vitest** — ★17,324 · MIT · **[ADD]** The Vite-native test runner. Repurpose:
unit-test what must never break — crypto round-trips, PIN-hash migration, Kalman filter,
geofence math, the alarm-lock state machine, outbox flush. Pros: zero-config in a Vite repo;
the cheapest crash-proofing that exists. Cons: none real (dev-only).

**29. microsoft/playwright** — ★99,073 · Apache-2.0 · **[ADD]** Real-browser E2E testing.
Repurpose: automate the exact flows we hand-tested today — set PIN → panic → wrong PIN
rejected → correct PIN silences; settings persistence across reload; share-sheet fallbacks.
Catches the "Set button didn't save" class of bug *before users do*. Cons: CI weight — keep
the suite small and lethal.

**30. bvaughn/react-error-boundary** — ★7,996 · MIT · **[ADD — immediate]** The standard React
error boundary. Repurpose: wrap every screen so a crash in Payments can never take down the
panic button or a live session; failures log to the local Dexie diagnostics store, and the
session/alarm engine lives *outside* the wrapped tree so UI crashes can't kill safety
functions. Pros: tiny, MIT, maintained. Cons: none.

## Luxury feel

**31. greensock/GSAP** — ★30,032 · **proprietary free license (NOT open source)** · **[SITE
ONLY]** The animation platform behind award sites. Repurpose: landing-site hero choreography
and scroll stories on guardian.blacklisted.studio — the marketing surface where luxury sells.
Keep OUT of the safety app (weight + license); Motion + CSS covers in-app. Pros: unmatched
polish, free commercially. Cons: non-OSI license; removable from a static site in a day if
purity ever matters.

**32. nilbuild/driver.js** — ★27,007 · MIT · **[ADD]** Dependency-free product-tour library.
Repurpose: (a) a 60-second **first-run safety tour** ("This is your panic button. This is your
circle. Set your PIN now.") — directly raises the % of users who finish configuring, and
"PIN set" is the trust metric that matters; (b) opt-in re-tours when features land. Pros:
MIT, tiny, maintained. Cons: tours annoy if overused — one first-run + opt-in replays only.

**33. goldfire/howler.js** — ★25,423 · MIT · mature/stable · **[ADD — Phase 4]** The standard
web-audio library (sprites, pooling, mobile unlock handling). Repurpose: (a) a cohesive UI
sound-design system — soft confirmation ticks, check-in chime, luxury feedback — with one
mute/volume policy; (b) rock-solid alarm playback plumbing (its pooling/unlock handling is
exactly the mobile-audio pain we hand-manage today). Pros: MIT, battle-tested. Cons: schedule
with the face-lift, not before.

*One-liners:* **darkroomengineering/lenis** (★17,029, MIT) — buttery smooth scroll, landing
site only. Skeletons/haptics need no repo: Tailwind patterns + the existing vibration helper.

## Inclusivity / reach

**34. i18next/i18next (★8,660) + i18next/react-i18next (★10,062)** — both MIT, pushed today ·
**[ADD — highest inclusivity ROI]** The standard JS i18n framework. Repurpose: (a) full UI
translation, **Spanish first**, with safety-critical strings in their own human-reviewed
namespace (panic/check-in wording is never raw machine translation); (b) alerts localized for
the *watcher* too ("Ella está bien ✅"); (c) RTL groundwork for future Arabic. Cons: one-time
string-extraction sweep — do it before the string count grows.

**35. ionic-team/capacitor** — ★17,017 · MIT · **[BACK POCKET — don't build yet]** The
standard PWA→native wrapper. Repurpose: the escape hatch that unlocks what browsers forbid —
background geolocation that survives screen-off, global triggers, real background push,
store presence — as an optional shell around the *same* PWA (pairs with PWABuilder ★3,818).
Cons: app stores are hostile to this category (why Guardian is a PWA at all); native doubles
the test matrix. Revisit when browser limits start costing safety.

**36. dequelabs/axe-core** — ★7,737 · MPL-2.0 · **[ADD — dev-time]** The accessibility engine
behind axe DevTools, runnable in Vitest/Playwright. Repurpose: CI gate on safety flows —
panic-button target size/contrast, PIN-pad labels, and status colors that never rely on
red/green alone. For users who are stressed, one-handed, possibly injured — a11y *is* a safety
feature. Cons: automation catches ~half; still needs one manual pass.

**37. preactjs/preact** — ★38,973 · MIT · **[MEASURE FIRST]** 3 KB React-compatible runtime.
Repurpose: bundle diet for low-end Androids (a real slice of this audience) via one Vite
alias, if perf data ever demands it. Cons: subtle compat edge cases — vetted now so the
option exists before it's needed.

---

# Part 5 — How the research re-maps the 5 phases (all green-lit 2026-11-01)

- **Phase 1 — GPS Reliability Pack** (unchanged, plus): battery level in PosMsg (audience
  want #4), silence-based escalation groundwork (objection #9), Vitest + error-boundary spine
  (#28, #30) lands here because everything else stands on it.
- **Phase 2 — Trust Pack** (expanded): receipts + "I'm on my way" ack + She's Safe status +
  presence + address-in-alerts + fake call + coded messages — PLUS the **confirmation ladder**
  (alert → circle ack → follow-up check-ins), the **screening pack** (libphonenumber-js #6,
  disposable-email data #10, OCR #7, structured screening checklist from want #1), and the
  **private client log v1** (Easy!Appointments/Monica fields #4/#11, Ushahidi incident model
  #23, ExifReader+piexif strip flow #8/#9 in the share path).
- **Phase 3 — Protocol v2** (unchanged): PartyServer rooms, libsodium identity, Argon2id,
  LiveKit, passkeys; email-to-SMS gateway hint + UnifiedPush docs (#25).
- **Phase 4 — Face-lift** (expanded): MapLibre + tiles + shadcn/Vaul/Sonner + Howler sound
  design (#33), driver.js first-run tour (#32), workbox update toast (#27), i18next + Spanish
  (#34), GSAP/lenis/littlelink on the marketing site (#31, #14), qr-code-styling deposit QRs
  (#15), Playwright + axe gates in CI (#29, #36).
- **Phase 5 — Moat** (expanded): regulars book + rebooking flow (Monica pattern #11, want
  #14), booking board + Cal.com link + ical export (#3, #5), on-device earnings/expenses/
  mileage + CSV tax export (#17 pattern), evidence vault + on-device transcription (#18/#19,
  Ente patterns #20), decoy mode, dead-man's switch, safe places + OSRM/Valhalla routing
  (#22, #21), PairDrop-style local export (#26), knowledge base (want #11), friendly-services
  directory (want #20), touring mode (want #17).

**Sources (community lane):** Bernier et al. 2022, PLOS ONE 17(6):e0269730 · PMC scoping
review PMC8277340 · Beyond the Gaze · MECASA Safety Toolkit · FSC/SexWorkCEO 2023 survey
reporting · Ditmore et al. via Reason 2024 · VelvetGuide / PetiteSweetAthlete / Sutton Sommers
/ MercedezBooking / Lily Levine etiquette pages · Trustpilot (VerifyHim, ClientEye, Tryst) ·
saradas.org client forums · "It's stressful having all these phones" (SSRC Just Tech).
**Competitor lane:** SafeWise, CallSafe, AppStor.io, JustUseApp, AppBrain, Trustpilot,
Survivors Against SESTA, NOLA Courtesan, Beyond the Gaze, USENIX Security 2021, BuzzFeed
(NUM), Bustle (Círculo), Wired (financial discrimination), Clark/USPhonebook (Truecaller).
