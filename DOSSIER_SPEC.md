# Client Dossier / Contact Manager — Spec (2026-11-05)

Rob's brief: build the client dossier / contact manager page, make it as
intelligent as possible — scan messages to auto-populate matching info —
with standard dossier fields where ~99% of the form is optional. The ONLY
required data: a name, and contact access info (phone/email/etc.).
Toggleable options include deposit required, incall/outcall, verified
yes/no/in-progress. Provider references in his exact structure:
name / number / positive-neutral-negative / ref confirmed — three slots.

Status: BUILT (this pass), pending the combined deploy with the Low
Signal / C&C build. This file is the spec text intended for
NATIVE_AND_AI.md; the blueprint commit is held for the parent to sequence.

## 1. Data model

The dossier EXTENDS the Phase 2 `ClientRow` (Dexie `clients` table). All
dossier fields are optional and NON-indexed, so no Dexie version bump was
needed and existing records upgrade in place (absent field = empty).

Existing (Phase 2/5/8): `name`, `phone` (+ `phoneE164`), `email`,
`handle`, `verdict` (ok/caution/avoid/unknown), `flags` (computed
screening hints), `checks` (screening checklist), `notes`, `regular`,
`rebook`, `followUps`, `noShows`, `lastSeenAt`, and the Phase 8
circle-share toggles `shareNotes` / `shareRatings` / `shareHistory`.

Added (2026-11-05, marked block in `src/lib/db.ts`):

| Field | Shape | Notes |
|---|---|---|
| `aliases` | `string[]` | other names he uses |
| `extraChannels` | `{id, kind: phone/email/handle/other, label, value}[]` | every channel beyond the primary three |
| `source` | `string` | platform / where first contact happened |
| `firstContactAt` | `number \| null` | |
| `depositRequired` | `boolean` | Rob's toggle |
| `servicePref` | `"" \| incall \| outcall \| both` | Rob's toggle |
| `verifiedStatus` | `yes \| no \| in-progress` | Rob's three-way toggle |
| `references` | `ProviderReference[≤3]` | see §3 |
| `screenDetails` | `{age?, occupation?, vehicle?, socials?, idChecked?}` | descriptive screening facts; the pass/fail checklist stays in `checks` |
| `preferences` / `boundaries` | `string` | |
| `incidents` | `{id, ts, severity: note/caution/serious, text}[]` | safety flags log |
| `tags` | `string[]` | |
| `commsLog` | `{id, ts, channel, text}[]` | imported conversations — ONLY when the user explicitly opts to save the raw text during review |

## 2. Validation contract

`validateDossier()` (`src/lib/dossier.ts`) is the entire gate:

1. `name` non-empty.
2. At least one contact channel among phone / email / handle /
   extraChannels.

Nothing else can block a save. Completeness is encouraged by
`dossierStrength()` (0–100% over ~19 weighted facts + a "still empty"
hint list) rendered as a meter in the manager list, on the list cards,
and at the top of the dossier page. The nudge is informational only.

## 3. Provider references

Exactly Rob's structure, three slots, first-class UI (not notes):

```ts
interface ProviderReference {
  name: string;        // who vouched
  contact: string;     // her number / contact
  sentiment: "positive" | "neutral" | "negative";
  confirmed: boolean;  // the USER confirmed it herself — extraction never sets this
}
```

Forward path (Phase 8 reference network): this is the local half of the
network design from the adoption study (OpenMined PSI lane). When the
network ships, a reference check becomes a keyed-hash comparison — the
app hashes the client's phone/contact keys with a user-held key and
compares against other providers' hashed reference entries; a match
reveals only sentiment + confirmed state, never the underlying contact
book, and enumeration guards (rate limits, salt rotation, opt-in only)
apply. Until then: on-device only, zero network surface.

## 4. Rollups — computed, never hand-entered

`computeRollups(client, bookings)` derives everything from `BookingRow`
records linked by `clientId`: total completed dates, first/last date,
no-shows (booking count, with the legacy `ClientRow.noShows` counter as
fallback for pre-link records), deposits taken (done + no-show),
deposits on cancelled, deposits upcoming, per-date ratings and their
average. Payments read from bookings because `LedgerRow` carries no
client link; if the ledger gains `clientId` later, fold it into the same
function. Ratings are written on bookings (tap-the-stars in the dossier's
history section, as before).

## 5. Intelligence — extraction with a human gate

`src/lib/extract.ts` + `src/components/ExtractionReview.tsx`.

- **Inputs:** pasted conversation text; file import (.txt, .json chat
  exports — common shapes flattened to lines, .vcf vCard); Contact
  Picker API where the platform offers it; screenshot OCR (tesseract.js,
  the existing Phase 2 path) — OCR text now goes through the SAME
  extractor + review instead of only filling phone/email.
- **Extractor (pure regex/heuristics, on-device):** phones + emails
  (via the existing screening extractors + libphonenumber validation),
  URLs, @handles and platform-handle statements, self-stated names,
  absolute and relative date/time mentions, deposit/payment mentions
  with amounts, reference mentions (name + number near "reference",
  sentiment guessed from wording, confirmed always false), verification
  mentions, incall/outcall mentions.
- **The gate:** every candidate carries `{kind, value, snippet,
  confidence, preChecked}`. Phone/email (regex-exact) arrive
  pre-checked; EVERYTHING inferred arrives unchecked. The review screen
  shows each fact with its source snippet and a confidence chip ("exact
  match" / "likely" / "guess — check it"). Only checked facts are folded
  in by `applyFacts()`, and ambiguous facts (deposits, dates,
  extra references) append to notes with their snippet instead of
  overwriting anything typed by hand. Inference can set
  `verifiedStatus` only to `in-progress`, never `yes`; it can never set
  a reference `confirmed`.
- **Raw text:** discarded after review by default. Saving it to the
  dossier's comms log is an explicit, default-off checkbox.
- **Duplicate detection:** `findDuplicates()` matches normalized
  reach-keys (phone last-10 digits / E.164, lowercased email,
  @-stripped handle — across primary AND extra channels) on save and on
  import. The save flow offers merge with per-field winner picks for
  scalar conflicts; lists always union; references fill empty slots then
  union to the 3-cap. Import at the manager level auto-merges into an
  existing match (facts were already user-confirmed at review), saves a
  new record when valid, or hands a prefilled draft to the new-dossier
  page when the one required fact (a name) is still missing.

## 6. Pages

- **Contact manager** (`#/clients`, `src/screens/ClientsScreen.tsx`):
  search across name/aliases/all channels; filters All / Regulars /
  Avoid / Verified / Unverified / Has references; per-card dossier
  strength bar, screening progress, dates-done, refs count, no-shows;
  quick actions Start date (booking-board prefill contract), + Booking,
  Message (sms:/mailto: on the primary channel), Dossier →. Import
  conversation / file / screenshot entry points at the top.
- **Dossier** (`#/dossier/<id>` and `#/dossier/new`,
  `src/screens/DossierScreen.tsx`): sections Identity & contacts ·
  Status toggles · Provider references · Screening (checklist +
  details) · Dates, ratings & payments (computed rollups + star rating)
  · Notes, preferences, boundaries & incidents · Communications log ·
  Circle-share toggles (ported from the C&C crew's card — same fields,
  same copy) · duplicate/merge gate on save. The old inline ClientEditor
  was retired into this page; all of its features (follow-up flow,
  share toggles, ratings) live here now.
- **C&C contract:** `getDossierSummary(clientId)` /
  `buildDossierSummary(client, bookings)` (`src/lib/dossier.ts`) return
  basics + rollups + a references summary + strength, with notes /
  ratings / history populated ONLY when the matching share toggle is on
  — the same rule `statusping.ts` enforces. Deep link:
  `dossierRoute(id)` → `#/dossier/<id>` (route added in App.tsx).
  CommandScreen's "Open full dossier" still lands on `#/clients`;
  switching it to the deep link is a one-line change for the parent.

## 7. Privacy

Everything on-device; no network calls carry dossier data; extraction
is local regex; the OCR engine script is the only external load and the
image never uploads (pre-existing Phase 2 behavior, unchanged). UI copy
keeps the established language: "lives only on this phone — never
uploaded, never synced, never shared."
