# Guardian Phase 7 — Experience Pack Architecture, Launch Ordering & Competitor Scan

*Research/design document, 2026-11-02. Companion to the Phase 7 direction approved
2026-11-02: Guardian repositions as a **generic personal-safety base app** for solo
workers who meet new customers 1-on-1 in unsecured places, with downloadable
**Experience Packs** that re-skin and re-tune the same safety core per career/mission.
Flagship pack: **In-Person Entertainment** — i.e. the app as it already ships today
(v0.11.1: panic + PIN/duress/decoy lock, mandatory check-in/out, live GPS, client
arrival links, screening/client log, regulars book, booking board, earnings ledger,
evidence vault, safe places, dead-man's switch, fake call v2 with 5 AI personas,
Sis setup wizard, free Supabase accounts). Nothing in this document invents a new
core feature; packs only re-express the existing one.*

---

## Executive summary — the three decisions this doc makes

1. **A pack is data, never code.** Every capability a pack can touch must already
   exist, reviewed, inside the shipped binary. A pack configures engines; it never
   adds one. This is not an aesthetic choice — it is what keeps downloadable packs
   inside Google Play's Device and Network Abuse policy (see §1.1) and keeps every
   pack's behaviour auditable before it reaches a user.
2. **Launch 4 packs beyond the flagship, in this order:** (1) Real Estate &
   Showings, (2) Field & In-Home Services, (3) Pet & Home Sitting, (4) Mobile
   Notary, Signing & Mobile Professionals. Gig Driver/Delivery — the biggest
   headline market — is deliberately **not** in the first wave (worst feature fit,
   strongest platform-incumbent safety tools). Babysitting/human care and anything
   aimed at minors are deferred on safeguarding/policy grounds (§2.4).
3. **Nobody in the market ships self-serve, cross-vertical, user-switchable
   packs.** Consumer safety apps (Noonlight, bSafe, Life360) are one generic UX.
   Lone-worker platforms (SHEQSY, StaySafe, Ok Alone) adapt per *industry* only as
   B2B employer configuration. Vertical apps (Tether RE, FOREWARN, SafeShowings)
   prove one vertical can support a whole company — and are trapped inside it.
   Guardian's gap: **one private, circle-based safety core that a self-employed
   person re-skins per mission, several times a day** (§3).

**Anti-goal, stated once and enforced in §2.5:** do not launch ten shallow packs.
A pack that is only the word "date" find-and-replaced with "showing" will be seen
through in one session, will burn credibility in exactly the professional
communities whose associations are the distribution channel, and multiplies the
QA matrix on every core release. Fewer, deeper packs win.

---

# 1. Pack manifest architecture

## 1.1 The load-bearing principle: engines in the binary, packs are data

Google Play's Device and Network Abuse policy (official text, Play Console Help)
states that an app distributed via Play *"may not modify, replace, or update itself
using any method other than Google Play's update mechanism"* and *"may not download
executable code (such as dex, JAR, .so files) from a source other than Google Play"*,
with a narrow exception for code running in a VM/interpreter with only indirect
API access (e.g. JavaScript in a WebView). Source:
https://support.google.com/googleplay/android-developer/answer/9888379?authuser=4

Experience packs are designed to need **neither** the prohibited path **nor** the
exception. A pack contains no JavaScript either. It is a signed JSON manifest plus
static assets (images, and — in v1 — nothing else), interpreted by engines that
shipped in the reviewed AAB:

| Engine (already in the binary) | What a pack feeds it |
|---|---|
| i18n / labels layer (`src/lib/labels.ts`, i18next EN/ES) | Terminology map = a namespaced string bundle |
| Router + screen registry (`src/App.tsx`, `src/screens/`) | Nav order/visibility/renames over existing screens only |
| Theme system (Tailwind tokens, call-screen themes v0.10) | Colour/typography/icon tokens from a token whitelist |
| Session setup form (DateSetupScreen) | Custom-field definitions rendered by the generic field renderer |
| Checklist renderer (screening checklist, v0.6) | Checklist item lists per phase |
| Quick-message / template engine (coded messages v0.6, follow-up flow v0.9) | Template strings with a placeholder whitelist |
| Fake-call persona scripts (`src/lib/personas.ts`, v0.10) | Persona records in the existing branching-script schema |
| On-device speech stack (v0.10 live caller; Phase 7 voice control) | Lexicon/slot vocabularies for existing intents only |
| Safety core (panic, timers, escalation, outbox) | Numeric defaults **inside hard clamps** (§1.2) |

**Consequence that must be said to users and reviewers alike:** if a pack idea
needs a capability that is not in the binary (a new sensor, a new screen type, a
new network call), it is not a pack — it is an app release. The pack roadmap is
therefore also the core roadmap's demand signal, never a shortcut around it.

### Distribution channels (in order of preference)

1. **Bundled starter packs** inside the AAB (flagship + Real Estate at native
   launch). Zero download friction, fully reviewed.
2. **Play-delivered asset/feature delivery** for official packs published after
   launch — Play's own mechanism, so the "update only via Play" rule is honoured
   by construction.
3. **In-app download of a signed manifest + assets from Guardian's own host** —
   acceptable for *data-only* packs (JSON/images are not executable code), and
   needed for the direct-APK channel. Constraints: pack signature verified against
   a key pinned in the binary; schema validated before install; a remotely
   published **revocation list** (pack id + version) can disable a bad pack
   without an app update. Remote data must never enable a feature the reviewed
   binary did not already contain and disclose — packs stay inside the app's
   declared functionality (location/mic/camera foreground-service declarations,
   Data Safety section) or Play review can treat the change as undisclosed
   functionality.

Paid packs, if ever: digital goods sold in the Play build go through **Play
Billing**; a pack must never carry its own payment links, prices in template
strings, or unlock codes. (The flagship's BTCPay/Stripe features are *user
business tooling* inside a session, not a way to sell packs — keep those two
worlds visibly separate in review notes.)

## 1.2 What a pack CAN and CANNOT contain

### CAN (data / config / assets only)

- **Terminology:** string overrides for any key in the core string table
  (session noun, counterpart noun, location noun, verbs), plus pack-specific
  strings in the pack's own namespace. Plain text only — no HTML, no markup
  beyond the template placeholder syntax.
- **Navigation:** ordering of existing screens in Home/more-nav, visibility
  toggles for *optional* screens (e.g. hide Payments for a salaried-adjacent
  mission), Home quick-action selection from the existing action registry,
  screen *display names* (via terminology).
- **Theme:** colour tokens (background/surface/accent/danger/success, light +
  dark), typography scale choice from bundled fonts, corner/elevation style
  enum, icon selection from the bundled icon set, call-screen theme default,
  hero/empty-state illustrations (static WebP/PNG, size-capped, hash-pinned).
- **Session custom fields:** field definitions rendered by the core renderer
  (§1.3 field-type whitelist), grouped, ordered, flagged required/optional,
  flagged *sensitive* (sensitive fields inherit the client log's on-device-only,
  never-synced treatment).
- **Checklists:** pre-session / at-arrival / wrap-up lists; item text, order,
  required flag; completion is stored with the session.
- **Templates:** circle messages, counterpart messages, coded quick messages,
  follow-up/no-show messages — with placeholders drawn only from the whitelist
  (`{firstName}`, `{sessionNoun}`, `{time}`, `{addressLocality}`, `{packField:<key>}`…).
- **Personas:** fake-call personas expressed in the **existing** persona script
  schema (pretext, opening lines, intent reply sets for agree/stall/question/
  distress/goodbye, voice profile = selection among system TTS voices + rate/
  pitch within the existing ranges). Persona *behaviour* is the core script
  runner; the pack supplies only lines and casting.
- **AI grammar / vocabulary:** for each **existing** voice intent, synonym
  phrases, slot lexicons (e.g. property types, pet species, document types),
  entity lists, suggested safewords, and a sound-profile *selection* among
  bundled audio-monitoring profiles (threshold presets by id — never weights,
  never thresholds as raw numbers in v1).
- **Safety defaults, clamped:** default session length, grace period, check-in
  cadence, fake-call lead time, dead-man's-switch window — each as a number the
  core clamps to its global safe range before applying (§1.3).
- **Onboarding:** questions from the question-type whitelist (single choice,
  multi choice, short text, yes/no, duration picker), recommended circle roles
  (labels only), a pack intro card (text + bundled illustration), links only to
  an allowlist of Guardian-owned pages.
- **Classification metadata:** which custom fields are PII/sensitive, default
  data-handling notes shown in the privacy card, locale list.

### CANNOT (hard prohibitions, enforced by the validator, not by trust)

- ❌ Any executable content: dex/JAR/.so, JavaScript (including in "templates"
  or onboarding), HTML with script or a JS bridge, WebView URLs, macros,
  expression languages beyond the placeholder whitelist.
- ❌ New screens, new layouts, new navigation destinations, or removing/renaming
  **safety-critical surfaces**: Panic/SOS, Check-in/Check-out, Lock/PIN gate,
  Circle, Settings → Privacy & Account, the emergency disclaimer. A pack may
  *re-emphasise*; it may never hide the way out.
- ❌ New permissions, new foreground-service types, new background behaviour,
  new network endpoints, new data collection, or any change to what leaves the
  device. A pack inherits the base app's Data Safety declaration exactly.
- ❌ Changes to safety *semantics*: mandatory check-out cannot be disabled;
  duress/decoy behaviour cannot be altered; escalation ladder steps cannot be
  removed (a pack may pick among core-provided ladder variants and reorder
  *notification* channels, never delete the final circle alert); panic cannot
  be made quieter, slower, or confirmation-gated.
- ❌ Numeric defaults outside core clamps (see table in §1.3) — e.g. a pack
  cannot set a 12-hour grace period and call the result "relaxed mode".
- ❌ ML model weights or raw detection thresholds (v1). Packs select bundled
  models/profiles by id. (Weights are data in a narrow technical sense, but
  shipping per-pack models would make detection behaviour unreviewable per
  pack and inflate pack size past any sane cap; revisit only with a signing +
  evaluation harness.)
- ❌ Monetisation mechanics: prices, payment links, unlock/paywall logic,
  external store links, affiliate links, advertising of any kind.
- ❌ Lowering the age gate or adding child-directed content. The base app's
  target audience stays adults; no pack may re-target it (§2.4).
- ❌ Unreviewed third-party content feeds. Official packs are authored and
  signed by Guardian; user-made packs (a possible later feature) install only
  from a local file/share, are marked unverified, and get the same validator.
- ❌ Anything that outs the user by default: a pack's discreet-mode strings are
  still mandatory — every pack must ship a complete discreet terminology set,
  not just its proud professional one.

### Safety invariants (the core wins every conflict)

Layering rule (§1.4) exists to make this mechanical: **Core invariant >
User explicit setting > Pack default > Pack suggestion.** If a manifest value
and an invariant collide, the invariant applies and the pack validator logs a
warning; if a manifest *requires* breaking an invariant to install, install
fails. Packs are also suspended wholesale during a live session, during panic,
and during the setup wizard's test alert — the app a user drilled with is the
app that responds.

## 1.3 Draft manifest schema

Format: one JSON document (`pack.json`) + an `assets/` folder. All sizes
capped: manifest ≤ 256 KB, total pack ≤ 5 MB (illustrations are the budget).
Unknown keys are rejected (closed schema) — that single rule prevents most
"data that is secretly a feature" drift.

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | int (start `1`) | Core refuses packs above its supported schema. Migrations are core-side, versioned. |
| `id` | string, reverse-domain | e.g. `studio.blacklisted.guardian.pack.realestate`. Immutable once published. |
| `version` | semver string | Pack version, independent of app version. |
| `publisher` | object `{name, keyId}` | Signature covers manifest + every asset hash. |
| `signature` | string | Detached signature, verified against key pinned in binary / Play-delivered metadata. |
| `minAppVersion` / `maxAppVersion` | semver | Pack silently disables (with user notice) outside range. |
| `display` | `{name, tagline, missionNoun, iconAsset}` | Store/picker presentation. |
| `locales` | string[] | Pack must be complete for each locale it claims; core falls back per-string, never per-pack. |
| `terminology` | map<string,string> | Keys must exist in the core string table or the pack namespace. Includes a mandatory `discreet` sub-map. |
| `navigation` | `{homeOrder: screenId[], hidden: screenId[], quickActions: actionId[], homeCards: cardId[]}` | Ids from core registries only; safety-critical ids rejected in `hidden`. |
| `theme` | token object | Colour tokens (hex, contrast-checked at install against WCAG AA for safety strings), `fontScale` enum, `shape` enum, `iconSet` id, `callThemeDefault` enum, asset refs. |
| `sessionProfile` | `{fields: FieldDef[], defaultTitleField, summaryLayout: fieldKey[]}` | See field whitelist below. |
| `checklists` | `{pre: Item[], arrival: Item[], wrap: Item[]}` | Item = `{id, text, required}`. Max 25 items per phase. |
| `templates` | `{circle: Tmpl[], counterpart: Tmpl[], coded: Tmpl[], followUp: Tmpl[]}` | Placeholder whitelist enforced; max length per template. |
| `personas` | PersonaDef[] | Must validate against the core persona-script schema (all five intent buckets non-empty). |
| `ai` | `{intentLexicon: map<intentId, string[]>, slots: map<slotId, string[]>, suggestedSafewords: string[], soundProfileId, voiceNotes}` | Intent/slot ids from core registries. Lexicon entries are phrases, not regexes (v1: no pattern syntax at all). |
| `safetyDefaults` | numeric object | Every value clamped by core (table below) at install *and* at activation. |
| `onboarding` | `{introCard, questions: QuestionDef[], recommendedCircleRoles: string[], firstSessionChecklistRef}` | Question types whitelisted like field types. |
| `dataHandling` | `{sensitiveFields: fieldKey[], notes}` | Drives the privacy card and the never-sync flag. Cannot mark a core-sensitive field non-sensitive. |
| `entitlements` | `{tier: "included"\|"pro"\|"pack", playProductId?}` | `playProductId` must exist in Play Console; no pricing data in the manifest. |
| `assets` | `{path, sha256, bytes}[]` | Every asset hash-listed; unlisted files in the bundle are rejected. |

**Field-type whitelist** (the entire universe a `FieldDef` can use):
`shortText, longText, phone, email, number, currency, date, time, duration,
select(options[]), multiSelect(options[]), boolean, address, rating(1–5),
personRef(client-log link), photoRef(evidence-vault link)`.
A field def is `{key, label, type, required, sensitive, helpText?, options?,
default?}`. There is deliberately **no** `url`, `file`, `richText`, or
`computed` type in v1.

**Core clamps for `safetyDefaults`** (illustrative bounds; core team sets final
numbers, packs never widen them):

| Setting | Pack may propose | Core clamp |
|---|---|---|
| Session default length | 15 min – 8 h | 10 min – 12 h |
| Missed check-out grace | 2 – 30 min | 1 – 60 min, never `0`/off |
| Periodic check-in cadence | 10 – 120 min | 5 – 240 min, never off in-session |
| Silence-escalation re-alert | on (variant A/B) | always on |
| Dead-man's switch window | 2 – 24 h | 2 – 24 h (existing range) |
| Fake-call lead time | 0 – 60 min | 0 – 120 min |

### Worked example (abridged) — Real Estate & Showings

```json
{
  "schemaVersion": 1,
  "id": "studio.blacklisted.guardian.pack.realestate",
  "version": "1.0.0",
  "publisher": { "name": "Blacklisted Binary Labs", "keyId": "bbl-2026-01" },
  "minAppVersion": "1.0.0",
  "display": {
    "name": "Real Estate & Showings",
    "tagline": "Your safety net for showings, open houses and first meetings.",
    "missionNoun": "showing"
  },
  "locales": ["en", "es"],
  "terminology": {
    "session": "Showing", "sessionPlural": "Showings",
    "counterpart": "Prospect", "location": "Property",
    "startAction": "Start showing", "endAction": "End showing",
    "discreet": { "session": "Appointment", "counterpart": "Contact" }
  },
  "navigation": {
    "homeOrder": ["session", "bookings", "clientLog", "circle", "ledger"],
    "hidden": ["payments"],
    "quickActions": ["startSession", "fakeCall", "codedOk", "safePlaces"]
  },
  "theme": {
    "accent": "#1F4E79", "fontScale": "standard", "shape": "rounded",
    "iconSet": "core-professional", "callThemeDefault": "auto"
  },
  "sessionProfile": {
    "fields": [
      { "key": "propertyAddress", "label": "Property address", "type": "address", "required": true, "sensitive": true },
      { "key": "prospectSource", "label": "How did they find you?", "type": "select",
        "options": ["Portal enquiry", "Sign call", "Referral", "Open house", "Social media", "Unknown"] },
      { "key": "idSighted", "label": "Photo ID sighted", "type": "boolean" },
      { "key": "lockboxCode", "label": "Lockbox / access notes", "type": "shortText", "sensitive": true },
      { "key": "colleagueNotified", "label": "Office/buddy told the address", "type": "boolean" }
    ]
  },
  "checklists": {
    "pre": [
      { "id": "screen", "text": "Run the prospect through your screening log", "required": true },
      { "id": "share", "text": "Share the property address with your circle/buddy", "required": true },
      { "id": "park", "text": "Park where you cannot be blocked in" }
    ],
    "arrival": [
      { "id": "photo", "text": "Note/photo the prospect's vehicle and plate" },
      { "id": "exit", "text": "Walk the property and clock your exit route" }
    ],
    "wrap": [
      { "id": "lockup", "text": "Property locked, lockbox replaced" },
      { "id": "log", "text": "Log outcome + mileage for expenses" }
    ]
  },
  "templates": {
    "circle": [
      { "id": "runningLate", "text": "Showing at {addressLocality} is running over — still with my prospect, will re-check in by {time}." }
    ],
    "coded": [
      { "id": "callMe", "emoji": "📞", "text": "Call me about the offer paperwork — now if you can." }
    ]
  },
  "personas": [
    { "id": "officeManager", "name": "Office manager",
      "pretext": "A buyer is waiting at the office / a lockbox fault needs you back now.",
      "intents": { "agree": ["…"], "stall": ["…"], "question": ["…"], "distress": ["…"], "goodbye": ["…"] } }
  ],
  "ai": {
    "intentLexicon": { "startSession": ["start a showing", "I'm at a viewing", "open house starting"] },
    "slots": { "propertyType": ["condo", "townhouse", "duplex", "land", "rental"] },
    "suggestedSafewords": ["blue folder", "comparables"],
    "soundProfileId": "indoor-quiet"
  },
  "safetyDefaults": { "sessionMinutes": 45, "graceMinutes": 10, "checkInMinutes": 30, "fakeCallLeadMinutes": 5 },
  "onboarding": {
    "questions": [
      { "id": "workStyle", "type": "singleChoice", "text": "Where do you meet prospects most?",
        "options": ["Vacant properties", "Occupied homes", "Open houses", "My office first"] }
    ],
    "recommendedCircleRoles": ["Office buddy", "Partner/family", "Team lead"]
  },
  "dataHandling": { "sensitiveFields": ["propertyAddress", "lockboxCode"] },
  "entitlements": { "tier": "pro" }
}
```

Note what the example *doesn't* do: no background-check integration, no claim
to verify a prospect's criminal record. Guardian's screening stays the user's
own on-device log (the v0.6 screening pack). Packs that promise database
lookups would change the app's data practices, its FCRA-adjacent risk, and its
Play declarations — that is a core-product decision, not pack content (§3.3).


## 1.4 Settings layering & precedence

Four layers, resolved top-down; a lower layer can be *displayed* but never
silently wins:

1. **Core invariants** (panic behaviour, encryption, mandatory check-out,
   never-synced data classes) — not data, not overridable by anything.
2. **User's explicit settings** (their PINs, circle membership, chosen grace
   period, chosen alarm sound) — a pack activation must never reset these;
   if a pack default conflicts, the user is shown "Pack suggests 10 min —
   you have 5 min set. Keep yours?" once, defaulting to *keep yours*.
3. **Active pack defaults** (terminology, timers, fields, theme).
4. **Pack suggestions** (recommended circle roles, safewords, checklist
   additions) — inert until accepted.

Every resolved value carries provenance ("from Real Estate pack" / "your
setting") shown in Settings. Debugging "why did it do that?" is a trust
feature in a safety app.

## 1.5 Mission switching — one person, several gigs

The design assumption: the same user is a cleaner in the morning, a pet
sitter in the evening, and a photographer on Saturday. Gig-stacking is the
norm in the independent workforce, not an edge case.

**Model: one identity, many mission overlays.**

- **Shared across all missions (the identity core):** account + entitlement,
  PINs (main/duress/decoy), biometric, the person-level safety circle,
  safe places, alarm sound, language, the device identity keys. Switching
  packs never touches these — re-doing safety setup per gig would guarantee
  users skip it for gig #2.
- **Per-mission (namespaced by pack id):** terminology/theme, session fields
  and their data, client/regulars log partition, checklists, templates,
  personas in the fake-call picker, per-mission circle *subset* (roles the
  pack recommends are mapped by the user to real people — e.g. office buddy
  for showings, sister for everything), timer defaults, onboarding answers.
- **Ledger stays unified, tagged by mission:** earnings/expenses/mileage
  carry `packId`; the tax CSV export is one file with a mission column.
  Separate books per gig would defeat the ledger's purpose.

**Switching rules:**

1. One active pack at a time in v1. (Parallel live sessions under two packs
   is a v2 question; the safety core runs one session at a time today.)
2. **No switching during a live session, a pending check-out grace window,
   or an active dead-man's-switch countdown.** The switcher is disabled with
   the reason shown. Terminology, timers and fields are frozen into the
   session at start.
3. **Sessions snapshot their pack:** a session record stores `packId`,
   `packVersion`, and a copy of the field schema + terminology it ran under.
   History, journal export and watch pages therefore render correctly after
   the pack is updated or uninstalled. Never resolve historical data against
   the *current* pack.
4. **Switch UX:** persistent mission chip on Home ("Today: Pet Sitting ▾"),
   one-tap switcher with recents, and an onboarding question per pack
   ("What are you doing next?") rather than a settings spelunk. Switching is
   a <5-second, no-network action; packs are fully cached on-device.
5. **Cross-mission leakage is opt-in and off by default:** the client log
   search defaults to the active mission's partition (a provider's
   entertainment clients and her cleaning clients must never surface in each
   other's contexts — this separation is a *selling point* for multi-gig
   users); a deliberate "search all missions" toggle exists in the log only.
6. **Circle subsets, not separate circles:** watch links are issued per
   session and carry that session's watcher set = identity circle ∩/+
   the mission subset the user picked at session start (defaulting to the
   pack's recommended roles as mapped).
7. **Uninstall/downgrade:** uninstalling a pack archives its namespace
   (data retained on-device, export offered); downgrading below a session's
   snapshot version never rewrites the snapshot.

**Worked day:** 09:00 Field Services mission — cleaning session, fields =
access code + alarm notes, circle subset = business partner. 14:00 switch
(two taps, no setup) → Pet Sitting mission — drop-in visits, fields = pet
name/species + vet, checklist = meds/water/plants, persona = "the pet's
owner" checking in. 20:00 switch → flagship Entertainment mission for an
outcall, full screening log and discreet terminology restored exactly as
left. One PIN set, one circle, three professions' worth of fit.

## 1.6 Versioning, validation, and the bad-pack playbook

- **Install pipeline:** fetch → verify signature → verify asset hashes →
  closed-schema validation → clamp safety defaults → contrast-check theme
  tokens → stage → atomic activate (never half-installed).
- **Compatibility:** `minAppVersion`/`maxAppVersion` + `schemaVersion` gate
  every activation, not just install (an app downgrade must not resurrect
  an incompatible pack).
- **Updates:** pack updates are data downloads through the same pipeline;
  a failed validation keeps the previous version live. Users can pin a
  pack version; automatic update is per-pack opt-in during beta.
- **Revocation:** a signed revocation list (pack id + version range) is
  checked at activation; a revoked pack disables to the generic base with
  a plain-language notice. This is the recall mechanism Play reviewers will
  ask about — document it in the Play listing review notes.
- **QA gate per pack release:** validator suite + the core's existing Vitest
  persona/intent tests parameterised by the pack's personas and lexicon +
  a scripted golden session (start → check-in → fake call → check-out →
  missed check-out escalation) rendered in the pack's terminology, in every
  locale the pack claims. A pack that fails any intent bucket or leaves a
  safety string untranslated does not ship.

---

# 2. Launch-pack ordering

## 2.1 Scoring method

Each candidate scored 1–5 on the three mandated criteria, plus a reality
discount applied in prose (headline workforce numbers always overstate the
*solo, self-employed, meeting-strangers* subset Guardian actually serves):

- **(a) Market size** — US workforce in the segment, evidenced below.
- **(b) Feature closeness** — how much of the pack is terminology/fields/
  checklists over the *existing* feature set (5 = almost no new core asks).
- **(c) Play-policy safety** — mainstream profession, no adult/minor/
  regulated-data complications in listing, declarations, or target audience.

## 2.2 The ranking

| # | Pack | (a) Market | (b) Fit | (c) Play safety | Total |
|---|---|---|---|---|---|
| — | **Flagship: In-Person Entertainment** (already built) | — | 5 (it *is* the app) | 2 (never the storefront face) | — |
| 1 | **Real Estate & Showings** | 4 | 5 | 5 | **14** |
| 2 | **Field & In-Home Services** | 5 | 4 | 5 | **14** |
| 3 | **Pet & Home Sitting** | 3 | 5 | 5 | **13** |
| 4 | **Mobile Notary, Signing & Mobile Professionals** | 3* | 5 | 5 | **13** |
| Deferred | Gig Driver & Delivery | 5 | 2 | 4 | 11 |
| Deferred | In-Home Care & Babysitting | 4 | 4 | 2 | 10 |
| Not a pack | Dating & Personal (incl. students 18+) | — | 5 | 3 | ships as a base mode |

*Tie broken by channel, not score: real estate first because associations/
brokerages are a proven bulk-distribution channel for exactly this category
(§3.3), field services second because its market is bigger but fragmented
across a dozen trades with no single gatekeeper.*

## 2.3 The four launch packs, with evidence

### Pack 1 — Real Estate & Showings

- **Market:** NAR membership stood at **1,439,163** as of June 2026 (NAR's own
  2026 Member Profile release) — and that excludes non-NAR licensees.
  https://www.nar.realtor/news/real-estate-news/even-in-a-tougher-market-realtors-are-holding-their-ground
- **Documented danger, in the industry's own words:** NAR reports **22% of
  residential agents** have experienced a situation that made them fear for
  their personal safety, and frames the core gap as tools that stop at
  pre-screening while agents are "most vulnerable at showings, open houses
  or when meeting someone new in a vacant property."
  https://www.nar.realtor/news/real-estate-news/technology/tackling-the-safety-gap-in-real-estate-showings
- **Fit (5/5):** a showing *is* a Guardian session with renamed nouns —
  prospect screening = client log, property = session location, proximity/
  showing timer = session timer, mileage = ledger (already built), office
  buddy = circle subset. §1.3's worked example is this pack.
- **Channel:** associations and MLSs already bulk-buy agent safety (Tether RE
  via Bright MLS covered 100,000+ agents; MetroTex made it a member benefit —
  §3.3). One association deal out-distributes a year of consumer marketing.

### Pack 2 — Field & In-Home Services
*(handymen, cleaners, landscapers, locksmiths, appliance/pest techs,
interior designers, photographers on location — one pack, per-trade
terminology variants inside it, not one pack per trade)*

- **Market:** BLS counts **2,432,600 janitor/building-cleaner jobs (2025)**
  and **1,299,200 grounds-maintenance jobs (2025)** before adding trades,
  construction-adjacent solo operators, and house cleaners — the largest
  combined pool of any candidate, and heavily solo/self-employed at the
  residential end.
  http://www.bls.gov/ooh/building-and-grounds-cleaning/janitors-and-building-cleaners.htm
  Https://www.bls.gov/OOH/building-and-grounds-cleaning/grounds-maintenance-workers.htm
- **Fit (4/5):** entering strangers' homes and vacant properties alone is
  the flagship's incall/outcall pattern mirrored. Fields (access codes,
  alarm notes, job scope), arrival/departure proof, mileage + earnings
  ledger all exist. The one-point deduction: some trades work in pairs/
  crews and outdoors, so checklists and the "session" framing need the
  most editorial work of the four.
- **Play safety (5/5):** unimpeachably mainstream; also the pack whose
  screenshots can front the Play listing.

### Pack 3 — Pet & Home Sitting
*(pet sitters, dog walkers, drop-in carers, house sitters)*

- **Market:** Rover — the category marketplace — advertises **200,000+ pet
  sitters and dog walkers in the US and Canada** on its own app listing,
  and one market analysis puts US pet-sitting services at **$4.5B in 2025**
  growing ~8.5%/yr; the independent (non-Rover) long tail is larger than
  the platform count.
  https://iphone.apkpure.com/app/roverdog-sitters-walkers/com.rover.rover-com
  https://pmarketresearch.com/it/pet-sitting-services-market/
- **Fit (5/5):** overnight stays alone in a client's empty home, meeting
  new owners, holding keys/alarm codes — the existing safe-places, session
  timer, access-notes fields, and checklists map 1:1; pet fields (species,
  meds, vet) are pure `sessionProfile` data. Dog walking adds a route/
  en-route session variant the GPS engine already supports.
- **Play safety (5/5)** and a demographic gift: a young, phone-native,
  heavily female, heavily multi-gig workforce — the exact users who will
  also adopt packs 1, 2, and the flagship, proving mission-switching in
  public reviews.

### Pack 4 — Mobile Notary, Signing & Mobile Professionals
*(mobile notaries + loan-signing agents as the anchor; interpreters,
bookkeepers/tax preparers, field reporters/interviewers as terminology
variants inside the same pack)*

- **Market, with the discount applied honestly:** the National Notary
  Association serves **"the nation's 4.4 million notaries"** — but most
  commissioned notaries are bank/office employees who never travel.
  https://www.nationalnotary.org/press-center/nna-press-releases/nna-publishes-what-businesses-need-to-know-about-enotarization-report-focused-on-efficiency-cost-saving
  The addressable slice is mobile notaries and signing agents who drive to
  strangers' homes with identity documents — uncounted in the sources
  above, plausibly low-six-figures nationally, hence (a)=3 not 5. Score
  the headline and this pack looks like #1; score the *reachable* market
  and it is #4. That discipline is the point of the discount.
- **Fit (5/5):** an appointment at an unfamiliar address, ID sighted,
  documents in hand, a second party expected — the session/screening/
  checklist model verbatim, with the most distinctive terminology set of
  any pack (signer, journal entry, commission), which makes it the best
  *demonstration* that packs are deep, not reskins.
- **Channel:** the NNA and state associations are a single, reachable
  gatekeeper, like real estate's.

## 2.4 Deferred — and why (this section is a decision, not a backlog)

- **Gig Driver & Delivery (biggest market, wrong first wave).** The
  independent workforce is enormous — **72.9M US independent workers (MBO
  Partners 2025)**, with ~9% of adults doing short-term gig work in 2024
  per Federal Reserve data — but the work pattern is a *shift of brief
  doorstep/road encounters*, not a 1-on-1 session at a place.
  https://shifttrackerapp.com/research/gig-economy-statistics-2026
  https://www.investopedia.com/how-much-gig-workers-earn-per-hour-and-how-wages-compare-across-apps-11927475
  Guardian's session/screening/ledger core fits badly (b=2); the platforms
  already ship in-app emergency buttons and crash detection owns the
  in-vehicle use case (Life360, §3.1). A credible driver pack needs a
  shift-mode core feature first — an app release, not a pack. Revisit
  after launch packs prove the model.
- **In-Home Care & Babysitting.** Real market — BLS counts **1,010,300
  childcare-worker jobs (2025)** — and real solo risk.
  https://www.bls.gov/ooh/personal-care-and-service/print/childcare-workers.htm
  Deferred because the pack's *subject* is a worker alone with minors:
  safeguarding expectations, background-check assumptions Guardian does
  not meet (its log is private and self-kept, by design), and Play target-
  audience/families scrutiny if any listing copy implies child-facing use.
  Shipping this carelessly risks the whole account, not just the pack.
  It returns only with a safeguarding review and association partner.
- **Students / teens / blind dates.** Blind dates and 18+ students are
  served by **Dating & Personal as a base mode** (terminology + personas
  already exist), not a paid pack — charging for the most universal use
  case would be both a growth and a PR error. **Under-18s are out of
  scope entirely:** no pack, mode, or marketing may target minors; doing
  so would change the app's target-audience declaration and child-safety
  obligations wholesale. If Rob later wants a campus product, it is a
  separate decision with separate counsel — not a pack.
- **Photographers, reporters, driving instructors, interpreters, tour
  guides…** — deliberately *inside* packs 2 and 4 as terminology variants
  rather than standalone packs. Each is real; none alone clears the depth
  bar in §2.5 at launch; all benefit when their umbrella pack matures.

## 2.5 ⚠️ The shallow-pack warning (read before approving any pack #5)

- **The QA matrix explodes multiplicatively.** Every core release must
  re-run the golden-session suite per pack × per locale × per persona set.
  5 packs is a discipline; 12 packs is a second product team.
- **Shallow packs are detectable in one session.** A "pack" that renames
  fields but keeps entertainment-shaped checklists, personas, and follow-up
  templates insults professionals in their own vocabulary — and these
  trades talk to each other through the very associations Guardian needs
  as channels. One mocked pack costs more than three unbuilt ones.
- **Depth bar (a pack does not ship without all of it):** ≥40 terminology
  entries incl. a full discreet set; ≥3 phase checklists written from that
  trade's real workflow; ≥8 templates; ≥3 personas with complete intent
  scripts; session fields a practitioner recognises as *theirs*; a named
  practitioner reviewer from the trade; ≥10 beta users from the trade
  completing real sessions; complete ES strings for safety surfaces.
- **Store-surface risk:** each pack is listing copy, screenshots, and
  review surface. Ten pack names in a listing reads as keyword stuffing
  and invites "what does this app actually do?" from reviewers and users
  alike. The listing sells *one* generic safety app; packs are discovered
  in-app and in trade channels.


---

# 3. Competitor scan — who already does this, and where the gap is

## 3.1 Consumer personal-safety apps (one generic UX each)

| App | Model | What it does well | Vertical packs/profiles? |
|---|---|---|---|
| **Noonlight** | Hold-button silent alarm → **professional monitoring centre dispatches emergency services**; integrations with platforms/wearables | The monitoring centre is the product: a human answers. Automated incident documentation; subtle interface | **No.** One flow for everyone; its "verticals" are B2B integrations (rideshare etc.), not user-facing packs |
| **bSafe** | SOS to *your* contacts: live GPS, follow-me timer, fake call, voice-activated SOS, SOS-triggered audio/video recording/streaming | Closest feature-for-feature analogue to Guardian's core — proof that fake call + timer + voice SOS is table stakes, not a moat | **No.** One generic configuration; no profession terminology, intake, screening, bookings, or ledger |
| **Life360** | Always-on family location: Circles, place alerts, SOS, crash detection, driving reports | Distribution and habit; crash/driving is genuinely strong | **No — and the opposite model.** Circles are *relationship* groups under persistent mutual visibility. Guardian is session-scoped, one-way, encrypted sharing that turns off. No work sessions at all |
| **Citizen** (adjacent) | Location-based incident awareness/alerts | Situational awareness at city scale | No — not a solo-session tool |

Sources: feature round-ups describing Noonlight's hold-and-release silent
dispatch and device integrations, bSafe's timer/fake call/recording, and
Life360's Circles/crash detection:
https://www.budgetandthebees.com/6-safety-apps-that-women-overlook-on-their-phones/
https://we3travel.com/14-apps-that-make-traveling-solo-safer-in-2026/

**Read:** the consumer category converged on *alerting*. None of them knows
what a "session" is, none screens the person you're meeting, none keeps your
bookings/earnings, and none speaks any profession's language. Their generic
UX is exactly the gap a pack system attacks — but note Noonlight's warning
in reverse: in the generic market, some users will expect a monitoring
centre. Guardian alerts **the user's own circle** and is not a dispatch
service; the generic positioning must say so as plainly as the current app
does, or the first bad review writes itself.

## 3.2 Lone-worker platforms (vertical adaptation exists — as B2B configuration)

SHEQSY (SafetyCulture), StaySafe (EcoOnline), Ok Alone, Peoplesafe,
SafetyLine, SoloProtect and peers sell **per-user/month subscriptions to
employers**: supervisor dashboards, automated check-ins, duress/QuickPanic
and shake-to-panic, overtime alerts, man-down detection, 24/7 monitoring
centres, compliance reporting.
https://www.lilachbullock.com/best-lone-worker-apps/
https://mitti.com/apps/remote-worker-app

Crucially, SHEQSY *does* market per-industry: its lone-worker guidance
names healthcare, energy/utilities, government, property & maintenance,
construction, social services and retail as distinct risk contexts.
https://mitti.com/topics/lone-worker-monitoring?linkedin=p4fgpx%24%7B6*6%7Dpxendp4fgpx%25%7B6*6%7Dpxendp4fgpx%7B3%7D%7B*123*%7D%7B6%7Dpxend

**But that adaptation is deployment configuration sold to an employer** —
the worker is the *monitored party*, the dashboard belongs to the boss, and
nobody switches industries at 2pm. It validates the demand ("different
trades, different risk language") while occupying a different product:
employer-owned, employee-surveilled, procurement-sold. Guardian's inversion
— the worker owns the app, the data, and the circle — is precisely what a
self-employed cleaner or signing agent cannot buy from this category, and
what an employee-side user would not trust an employer tool to give her
about her *other* gigs.

## 3.3 Vertical single-purpose apps (depth proven, breadth impossible)

**Real estate is the proof case.** NAR's own safety-resources page lists a
whole vertical stack: **FOREWARN** (instant prospect identity/risk
verification from a phone number), **SafeShowings** (captures/validates the
person being shown around; alerts contacts + 911), and SentriLock's
**SentriKey Agent Safety** (a check-in timer bolted onto the lockbox app).
https://www.nar.realtor/safety/resources-for-personal-protection?random=3712932

**Tether RE** then bundled the whole vertical: prospect screening + reverse
lookups, SOS, proximity timers tied to showings, impact/struggle detection,
plus mileage/expense and showing management — and grew through association/
MLS distribution (Bright MLS: 100,000+ agents; MetroTex member benefit;
NAR REACH cohort).
https://www.inman.com/2026/09/03/real-estate-safety-resources/
https://www.nar.realtor/news/real-estate-news/technology/tackling-the-safety-gap-in-real-estate-showings

**Read, carefully — this is the strongest evidence *for* packs and the
sharpest competitive warning in this doc:**

- *For:* a single vertical's terminology + intake + workflow (not generic
  SOS) supports a company and association-scale distribution. Guardian's
  Pack 1 must be at least this fluent in real-estate language, minus the
  database-screening claims (Guardian's log is private and self-kept —
  a privacy differentiator to state, not a gap to apologise for).
- *Warning:* Tether RE is a native incumbent with a head start, live
  monitoring, and channel deals in Pack 1's exact market. Guardian does
  not out-Tether Tether on day one; it wins the agent who *also* cleans
  houses, sits pets, or provides on weekends — the multi-mission user no
  single-vertical app can follow — plus users who refuse a monitoring
  company's custody of their client data.

**Other verticals are thinner:** notary tooling is transaction/accounting
software with no safety layer; Rover/Wag give *pet owners* GPS walk
 tracking while the sitter's own safety is unaddressed; rideshare/delivery
platforms ship in-app emergency features that work only on-platform, only
mid-trip, and alert the platform — not the driver's own people, and never
across her three apps. Each is a silo; none can follow a worker across gigs.

## 3.4 The gap Guardian fills (the pack thesis in five claims)

1. **The buyer is the worker herself.** Every serious incumbent sells to
   families, employers, platforms, or associations. The self-employed
   person stacking gigs has no incumbent — she is Guardian's user.
2. **Session-scoped privacy as architecture, not policy.** E2E-encrypted
   shares, per-session keys in URL fragments, on-device client log, no
   central database of her customers — a claim neither monitoring-centre
   nor employer-dashboard models can copy without ceasing to be themselves.
3. **Safety + the business of the visit in one place.** Screening log,
   bookings, regulars, earnings/mileage ledger, evidence vault — the moat
   features of v0.6–v0.9 — are what packs re-tune per trade. Alerting
   alone is a commodity (bSafe); alerting wired into *her* workflow is not.
4. **Multi-mission switching.** The only "verticalisation" in the market
   is one-app-per-vertical or employer configuration. A signed, data-only
   pack that re-fits the same trusted core in two taps — several times a
   day, with data partitioned per mission — has no direct competitor in
   the sources surveyed.
5. **AI that speaks the trade.** Pack lexicons + personas make voice
   control and the fake-call exit plausible *in context* ("call me about
   the lockbox", not a generic "your friend is calling") — the detail
   users repeat to colleagues, which is the channel that matters.

**Honest limits of the thesis:** terminology is copyable — if packs
succeed, bSafe-class apps can add "profiles" within a release cycle. The
defensible layers are (2) and (3) plus switching (4) done with data
partitioning; the pack system must therefore ship *with* those, not as a
skin store bolted onto a generic SOS button. And a pack system does not
fix Guardian's known expectation gap vs Noonlight (no dispatch centre) —
positioning, not packs, carries that.

---

# 4. Open questions for Rob / next research

1. **Pack pricing:** included-in-Pro vs per-pack Play Billing products —
   needs the Phase 6 Stripe/Play billing decision first; manifest supports
   both (`entitlements.tier`).
2. **Pack authorship v2:** practitioner-authored packs (submitted, reviewed,
   signed by Guardian) would scale depth without a bigger core team — but
   opens a review/quality operation. Not in launch scope.
3. **Association partnerships** for packs 1 and 4 should be sounded out
   *before* those packs' terminology is frozen — Tether's channel lesson
   (§3.3) cuts both ways: an association's vocabulary feedback is free
   practitioner review.
4. **Driver shift-mode** is the largest deferred prize; it needs a core
   design spike (shift vs session), not a manifest.
5. **Care/babysitting** returns only with a safeguarding review — owner:
   product, not packs.

## Sources (all URLs as retrieved 2026-11-02)

- Google Play, Device and Network Abuse policy (official):
  https://support.google.com/googleplay/android-developer/answer/9888379?authuser=4
- NAR membership 1,439,163 (June 2026):
  https://www.nar.realtor/news/real-estate-news/even-in-a-tougher-market-realtors-are-holding-their-ground
- NAR on the realtor safety gap (22% feared for safety; Tether RE):
  https://www.nar.realtor/news/real-estate-news/technology/tackling-the-safety-gap-in-real-estate-showings
- NAR safety resources (FOREWARN, SafeShowings, SentriKey):
  https://www.nar.realtor/safety/resources-for-personal-protection?random=3712932
- Inman, real-estate safety tools (Tether RE / Bright MLS scale):
  https://www.inman.com/2026/09/03/real-estate-safety-resources/
- BLS, janitors & building cleaners — 2,432,600 jobs (2025):
  http://www.bls.gov/ooh/building-and-grounds-cleaning/janitors-and-building-cleaners.htm
- BLS, grounds maintenance workers — 1,299,200 jobs (2025):
  Https://www.bls.gov/OOH/building-and-grounds-cleaning/grounds-maintenance-workers.htm
- BLS, childcare workers — 1,010,300 jobs (2025):
  https://www.bls.gov/ooh/personal-care-and-service/print/childcare-workers.htm
- National Notary Association — 4.4 million US notaries:
  https://www.nationalnotary.org/press-center/nna-press-releases/nna-publishes-what-businesses-need-to-know-about-enotarization-report-focused-on-efficiency-cost-saving
- Rover listing — 200,000+ sitters/walkers (US & Canada):
  https://iphone.apkpure.com/app/roverdog-sitters-walkers/com.rover.rover-com
- Pet-sitting services market — $4.5B (2025), ~8.5% CAGR:
  https://pmarketresearch.com/it/pet-sitting-services-market/
- Independent workforce — 72.9M (MBO Partners 2025, via ShiftTracker):
  https://shifttrackerapp.com/research/gig-economy-statistics-2026
- Federal Reserve gig-work share (via Investopedia/Gridwise):
  https://www.investopedia.com/how-much-gig-workers-earn-per-hour-and-how-wages-compare-across-apps-11927475
- Consumer safety apps (Noonlight / bSafe / Life360 features):
  https://www.budgetandthebees.com/6-safety-apps-that-women-overlook-on-their-phones/
  https://we3travel.com/14-apps-that-make-traveling-solo-safer-in-2026/
- Lone-worker apps compared (SHEQSY / StaySafe / Ok Alone et al.):
  https://www.lilachbullock.com/best-lone-worker-apps/
  https://mitti.com/apps/remote-worker-app
- SHEQSY per-industry lone-worker guidance:
  https://mitti.com/topics/lone-worker-monitoring?linkedin=p4fgpx%24%7B6*6%7Dpxendp4fgpx%25%7B6*6%7Dpxendp4fgpx%7B3%7D%7B*123*%7D%7B6%7Dpxend

*Internal sources: `README.md` (feature history v0.5–v0.11.1) and
`BLUEPRINT_V2.md` in this repo — the current feature set packs configure.*
