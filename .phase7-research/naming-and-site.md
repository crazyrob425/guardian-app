# Guardian Phase 7 — Generic-Brand Naming Audit & Second-Website Requirements

*Researched 2026-11-02. Companion to NATIVE_AND_AI.md §1–2 (vision,
dual-flavor distribution) and §8 (Play compliance checklist), and to
`.phase7-research/play-policy.md`. Methods: Google Play listings found
via web search (install counts from the Play listing text itself or
chrome-stats / AppBrain / AndroidRank snapshots dated Oct 2026);
company/product collisions via web search; domain status via Google
DNS-over-HTTPS (`dns.google/resolve`, NS + A records) — this VM's local
resolver is a fake-IP proxy that "resolves" everything and public
resolvers refuse it, so DoH was the only trustworthy DNS path.*

***Trademark sections are a high-level screening only. They are NOT
legal advice, not a clearance search, and not a substitute for a
trademark attorney running USPTO/EUIPO records (esp. Class 9
downloadable software, Class 42 SaaS, Class 45 personal-safety
services) before any name is adopted.***

---

## 1. The "Guardian" collision audit

Rob's assumption is correct, and if anything understated. "Guardian"
is not merely competitive — in the exact Play category Guardian is
entering, **the bare name is already taken by a near-identical app.**

### 1.1 Play-store collisions (personal safety / locator / lone-worker)

| App | Who | Scale | Why it hurts |
|---|---|---|---|
| **Guardian – Personal Safety** (`app.nedze`) | "Guardian LLC" / Andrey Yegorov | **~103,000 downloads**, 3.8★, ~596 reviews (chrome-stats, 2026-10-13) | **The worst collision on the list.** SOS/panic button, Safety Check timer with auto-escalation, live location sharing, fake call, anti-theft triggers — a feature list that reads like a paraphrase of ours, under the *exact same name*. Its top reviews say it doesn't work and demand refunds. Name-confusion means its reputation bleeds onto us and some of our users will install the wrong app. |
| **OnStar Guardian: Safety App** (GM) | OnStar LLC | **1M+ downloads**, ~12K reviews, 4.3★ | A registered-mark (Guardian®) family-locator/emergency-services app from General Motors, marketed on TV for years. Owns the "Guardian + safety app" association for mainstream US consumers. |
| **Rave Guardian** | Rave Mobile Safety (Motorola Solutions) | Play range 100K+; ~187K–280K estimated installs; on Play since 2014 | The default campus-safety app at hundreds of US universities (Cornell, IU, Sonoma State…). Owns "Guardian" for the entire adult-student segment we list as users. |
| **Guardian Angel** | Coccinelle Media | Small (count not shown) | Personal-safety monitoring + emergency-contact alerts; adds one more "Guardian*" safety result to scroll past. |
| **GuardianWatch** | — | Count not shown | Personal-safety utility: live trip tracking to "your Guardians," shake alerts, media vault. Same shelf, same naming stem. |
| **AngelSense Guardian** | AngelSense Inc. | Established wearable business | "Guardian" as product name in child/special-needs location safety. |
| **FamGuard** and the family-locator "guard" cluster | various | — | The whole family-locator category leans on guard/guardian naming (FamGuard, Guardio, etc.), so even category-adjacent searches are saturated. |
| **Guardian Seg** (Segware, Brazil), **GUARDIAN® Producer Access / Accounts** (Guardian Life) | — | — | Alarm-system monitoring and insurance apps: not competitors, but more same-name results diluting every search. |

Off-Play but in-category: **Guardian24** (UK/Ireland lone-worker
protection, BS 8484-accredited, sells exactly "check in/out of tasks,
automatic call on overrun, discreet alarm" to employers),
**WorkSafe Guardian** (Australia's B2B lone-worker app, 24/7 response
centre), and **GuardianOS** (UK field-crew ops app with lone-worker
features). The B2B lone-worker shelf — a segment our generic packs
will brush against — is already Guardian-branded on two continents.

### 1.2 Web search dominance

"Guardian" on the open web belongs to giants, permanently:

- **The Guardian** (theguardian.com) — one of the world's largest news
  sites; traffic estimators put it at roughly **200–300M visits/month**
  (SimilarWeb-derived figures, Oct 2026). It owns page one for the bare
  word in every English-speaking market, plus its own Guardian apps.
- **Guardian Life Insurance Company of America** — Fortune-500-scale
  mutual insurer (founded 1860, ~$94B admitted assets), GUARDIAN® is
  its registered house mark, with its own Play apps and software-class
  filings (e.g. GUARDIAN INSIGHTS, Class 42, registered 2024).
- Then the tail: Guardian pharmacies, Guardian Glass, Guardian Angels
  (the charity and the patrol), hundreds of local "Guardian" security
  firms.

A new safety app has effectively **zero prospect of ranking for its
own name** on Google, and "Guardian app" as a query returns the news
app, the insurer, OnStar, Rave and the §1.1 clone before it returns us.

### 1.3 Trademark red flags (screening only — NOT legal advice)

- **Descriptiveness/weakness:** "Guardian" for a safety app is close
  to the descriptive end of the spectrum — it names the function. Weak
  marks are hard to register with meaningful scope and nearly
  impossible to enforce against the dozens of existing Guardian users.
- **Crowded field / prior users in the same classes:** OnStar
  Guardian® (consumer safety software — the closest legal neighbour),
  Rave Guardian (safety software since 2014), Guardian Life's software
  filings, Guardian24/WorkSafe Guardian (lone-worker services,
  international). Any USPTO application in Class 9/42/45 should expect
  §2(d) likelihood-of-confusion citations and possible oppositions —
  budget attorney time accordingly.
- **Confusion is not hypothetical:** because an identically named app
  with near-identical features already exists on Play (§1.1, row 1),
  user confusion is demonstrable today, which cuts both ways — it
  weakens any mark we might claim and exposes us to complaints meant
  for them (their reviews allege paid features that don't work).
- Nothing here says using "Guardian" in the *direct* channel is
  untenable: that audience arrives via BNE's own links, not search,
  and descriptive use among many prior users is the existing status
  quo. The finding is narrower: **"Guardian" cannot be the
  discoverability engine for a new Play brand.**

### 1.4 Verdict — how ownable is "Guardian" for the Play flavor?

| Axis | Score (10 = fully ownable) |
|---|---|
| Play search discoverability | **2/10** — exact-name incumbent + 1M-install OnStar + Rave own the query |
| Web/SEO ownability | **1/10** — a top-200 global news site and a Fortune-500 insurer own the word |
| Trademark distinctiveness/enforceability | **2/10** — descriptive, crowded register, strong prior users in-class |
| **Overall** | **2/10 — do not launch the generic Play brand as bare "Guardian"** |

**Recommended split:** keep **Guardian** where it already has equity —
the direct/provider flavor (guardian.blacklisted.studio, the promised
free year of **Guardian Pro** for beta testers, the existing user base)
— and give the Play flavor a new, ownable generic brand. The blueprint
already supports this: flavors differ by BuildConfig/display name and
pack catalogue; a per-flavor brand string is the same mechanism. The
two brands share one binary, one account system, one safety core —
which is also why the generic site's policy pages (§3) must be written
to cover the account system truthfully without ever bridging the two
storefronts.

---

## 2. Candidate names for the generic / Play brand

Screening method per candidate: (a) web search for a same/near-name app
on Play or in safety-adjacent categories; (b) web search for an
existing company/product in safety or consumer tech with that name;
(c) DNS status for `<name>.com` and `<name>.app` via Google DoH.
**Domain legend:** REG = registered (DNS exists — may be active,
parked, or for sale; only a registrar check decides purchasability).
NXDOMAIN = no DNS record exists — *likely* unregistered, but NXDOMAIN
is **not** a guarantee of availability (registries reserve/premium-list
names with no DNS); a registrar availability check is the decider, and
nobody should announce a name before that check + an attorney's
clearance search.

### 2.1 Full screened list (16)

| # | Name | Direction | App collisions | Company/product collisions | .com | .app | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | **Winghold** | Wing + hold | None found | None found (search returns unrelated "WinGold" jewellery software) | **NXDOMAIN** | **NXDOMAIN** | ⭐ **Shortlist #1** |
| 2 | **Secondwatch** | Second person | None found under the one-word form | **2nd Watch** — Seattle cloud/enterprise-security MSP (different trade, but a software-services name neighbour) | REG (parked) | REG (Wix site) | ⭐ Shortlist — domain purchase/variant needed |
| 3 | **Holdfast** | Anchor/grip | None found | **HoldFast Gear** — the leading photographer camera-harness brand (direct overlap with the photographer pack's trade!); 3M HoldFast industrial adhesive; marine suppliers | REG | REG | ⭐ Shortlist with real cautions |
| 4 | **SoloSignal** | Solo-work pride | None found | None named SoloSignal — but all search results drown in **Signal Private Messenger** | REG | REG | ⭐ Shortlist (weakest of the four — SEO fights Signal forever) |
| 5 | Wingpost | Wing + post | **WingPost** private messenger (live product) | Inactive UK Wingpost Ltd | REG | **NXDOMAIN** | Viable fallback; messenger neighbour, bland differentiation |
| 6 | Wingline | Wing + line | None found | Wingline Trucking (owns wingline.com), WingLine door hardware | REG | REG | Pass — weak meaning, taken .com in transport |
| 7 | Northmark | Beacon/bearing | Northmark CELPIP exam-prep app | Northmark Bank; **NorthMark Strategies** (software TM filings, Class 9/42); a trades-marketing firm named Northmark actively selling to handymen/landscapers | REG | REG | Reject — software-class TM neighbour + targets our own launch trades under another firm's name |
| 8 | Wingmate | Buddy/wing | **Wingmate Birds** (Play), Jayco Wingmate (RV app), WingMate dating app (live product) | Wingmate (sales CRM, wingmate.com) | REG | REG | Reject — crowded in apps, incl. dating |
| 9 | Lantern | Light/beacon | Lantern mental-health app (golantern.com) | Lantern (healthcare benefits co.), Lantern support-platform (ZA) | REG | REG | Reject — health-tech owns it |
| 10 | Alongside | Second person | Alongside AI coach app (schools) | **Alongside** — clinician AI platform, 200+ schools, acquired by TimelyCare (2026) | REG | REG | Reject — owns the student segment we're targeting |
| 11 | Sidecar | Second person | Sidecar Health app (Play) | **Sidecar Health** — health insurer, $165M Series D | REG | REG | Reject — big-company mark |
| 12 | Watchpost | Beacon/post | None under exact name | **WatchPost AI** (CCTV workplace-safety monitoring), WatchPost Inc (utility weather apps, iOS/Android), others | REG | REG | Reject — multiple safety-adjacent owners |
| 13 | PlusOne | Second person | Multiple PlusOne/Plus 1 social & dating apps | PlusOne companionship marketplace (book-a-companion, escrow) | REG | REG | Reject hard — "book a companion" semantics is exactly the baggage this brand must not carry |
| 14 | Tandem | Second person | Tandem language app; Tandem Diabetes apps | **Tandem Diabetes Care** (public co.) | REG | REG | Reject — two strong owners |
| 15 | Chaperone | Second person | **Chaperone** — a dating-safety companion app using this exact name/concept (pre-launch) | "Chaperone" features inside Muslim dating apps (Muzz) | REG | REG | Reject — direct concept collision + hard to spell |
| 16 | Keepside | Second person | None found | Keepside (NFC mixtape product, getkeepside.com) | REG | REG | Reject — taken domains, irrelevant owner |

Notes on the near-misses: **PlusOne** is the cautionary tale of this
screen — a name that sounds perfect for "a second person with you" is
already the name of a companionship-booking marketplace. **Chaperone**
fails twice: someone is already building the dating-safety version
under that name, and it is the most-misspelled word on the list.
**Alongside** was conceptually ideal and is owned outright in the
student-wellbeing segment.

### 2.2 Shortlist — best 4

**1. Winghold** — *"Your wing, holding watch."*
Coined compound: the wingman/second-person idea fused with the
product's own core verb — Guardian's panic is literally
press-and-**hold**, its check-ins are holds, its promise is "we hold
the line while you work." Zero app or company collisions found, and
both **winghold.com and winghold.app returned NXDOMAIN** — the only
candidate on the list where the exact-match domains look obtainable at
standard registration (registrar check is the decider). Spellable from
hearing ("wing-hold"), pronounceable, dignified for a notary, warm for
a student, professional for a realtor. *Risks:* coined word = zero
built-in meaning (brand must teach it — one good tagline does this:
"Solo job? Winghold's on watch."); faint aviation "holding pattern"
echo; requires the full attorney clearance search like everything else.

**2. Secondwatch** — *"A second pair of eyes on every solo job."*
The most instantly understood concept on the list: a second person,
watching, on a timer — it describes check-in escalation in two
syllables each. No app collision found. *Risks:* both domains are
registered (secondwatch.app is a live Wix site; secondwatch.com
parked) — acquisition cost/negotiation unknown, though variant domains
screened likely-free (getsecondwatch.com, secondwatchsafety.com both
NXDOMAIN); **2nd Watch**, a Seattle enterprise cloud-security firm, is
a name neighbour in software services — different buyer and trade
channel, but the attorney search must weigh it.

**3. Holdfast** — *"Holds fast when a job goes sideways."*
A real heritage word (nautical: the fitting a ship's rigging holds
to; the command "hold fast" = don't let go) — pride-forward, salty,
memorable, and it photographs well. *Risks (real ones):* **HoldFast
Gear is the best-known camera-harness brand among working
photographers** — one of our launch-pack trades — so confusion would
occur inside a target vertical, at trade shows and in search;
3M's HoldFast adhesive adds industrial noise; both domains registered
and active/held. Adopt only if Rob loves it enough to accept the
photographer-trade collision.

**4. SoloSignal** — *"Solo, never out of range."*
Function-forward and proud: names the user (solo) and the act
(signalling your circle) with no cuteness. No company carries the
name. *Risks:* "Signal" is the heaviest word in consumer tech —
Signal Private Messenger owns the search results for anything
signal-adjacent, so SEO/ASO will fight uphill permanently; both
domains registered (the .app has no live site — possibly purchasable);
reads slightly utilitarian next to Winghold/Secondwatch.

** also-ran:** Wingpost (clean-ish, .app likely free) if a fifth
option is wanted — but a live encrypted messenger already uses
WingPost, and "post" skews static/deskbound for a field-work product.

### 2.3 Naming recommendation

Adopt **Winghold** for the Play/generic flavor, pending (in order):
registrar availability check on winghold.com/.app → attorney clearance
search → Play developer-name check. Keep **Guardian / Guardian Pro**
as the direct flavor's brand, untouched, honouring the beta promise.
One binary, two storefront brands — the same split §2 of the
blueprint already enforces for content, extended to the name.

---

## 3. Second website — requirements for the Play flavor

**Short answer: yes, the Play flavor needs its own website, on its own
(fresh) domain.** Play policy technically only demands *URLs*; the
reasons those URLs cannot live on blacklisted.studio are in §3.3.

### 3.1 MUST host (policy-mandated or policy-load-bearing)

All citations trace to play-policy.md / NATIVE_AND_AI.md §8.

1. **Privacy policy page** — a public URL submitted in Play Console,
   linked in the store listing **and** in-app (User Data policy;
   play-policy §1.7, §8.1). Must truthfully describe the *generic*
   flavor: precise location shared with the user's chosen circle during
   sessions, account identifiers (Supabase), alert payloads; on-device
   audio processing described as on-device (the Data Safety
   "not collected" position depends on the policy text matching the
   binary). If one account system serves both flavors, the policy must
   remain accurate for Play users — and be written in generic-safe
   language while doing it.
2. **Account-deletion web page** — User Data policy requires deletion
   available **in-app AND via an external web resource** (freezing is
   not a substitute; play-policy §1.7, §8.1). This URL is filed in
   Play Console. It must work for someone who has already uninstalled
   the app.
3. **Developer contact surface** — Play Console listing carries a
   public **support email** and a **website URL**; the site must host
   that contact path (support/help page with the same address). The
   support email should live on the *new* domain, not
   blacklisted.studio — see §3.3.
4. **Data Safety substantiation** — the Console form is the filing, but
   the site should carry the matching plain-language data-practices
   page (what leaves the phone, what never does) so reviewers,
   journalists and association partners can verify the claims the
   listing makes (§8.1: Data Safety mismatch is itself a violation).
5. **Prominent-disclosure mirror** — the background-location and mic
   disclosures themselves are *in-app* requirements (§8.2), but the
   site should publish the same texts (feature + disclosure + how to
   stop it). Declaration reviewers follow the website link; consistency
   between site, listing, declarations and binary is what passes review
   (§8.1: one-feature location declaration form + ≤30s demo video —
   the video is Console-filed, and hosting the same demo on the site
   is cheap insurance).

Also required *adjacent* (Console-side, site-supported): content-rating
questionnaire (18+ positioning, §1.2/§8.1), target-audience declaration
18+ only, FGS declarations per type with demo videos (§8.1).

### 3.2 Must NEVER do (the bridge rules)

From NATIVE_AND_AI.md §2.1/§8.3 and play-policy §3.2/§1.6:

- **Never link to, mention, name, screenshot, QR-code, or hint at the
  direct edition, the direct APK, guardian.blacklisted.studio, the
  In-Person Entertainment pack, or any BNE adult-facing property** —
  in body copy, footer nav, meta/OG tags, SEO keywords, redirects, or
  "our other products" sections. A listing (and by extension its
  website) must not provide "any means to activate or access
  functionality" outside Play's terms (Stalkerware section's routing
  principle), and hidden/undocumented-feature rules (Deceptive
  Behavior) treat a discoverable bridge as a funnel. The firewall is
  one-directional: nothing on the Play side may point across. (The
  reverse direction — the provider site acknowledging a generic Play
  edition exists — is not a Play-policy violation, but should still be
  decided deliberately, not by accident of a shared footer.)
- **No adult/sexual keywords anywhere** — including SEO meta, alt text
  and blog tags (Sexual Content policy reaches "in the store listing
  or in-app"; the website is the listing's own URL and is read as part
  of the product's public face).
- **No overclaimed safety copy** — no guaranteed rescue, response
  times, or emergency-services/dispatch connections the app doesn't
  have (Deceptive Behavior — Misleading Claims; §8.4). The honest-limit
  line ("alerts your circle; not a substitute for emergency services")
  is the required posture, on the site as much as in the listing.
- **No monitoring-other-people framing** — never market tracking a
  partner/client/family member (Stalkerware audit, §8.2); the user
  shares *their own* location with *their own* circle, full stop.
- **No teen-directed content or marketing** — 18+ only (§1.2); copy
  about students means adult students; no school/Families surface.
- **No shared branding chrome with BNE properties** — no common
  header/footer, no "a Blacklisted Binary / BNE studio product" badge
  linking across. The developer identity presented to the generic
  market must stand on its own.

### 3.3 Fresh domain vs. blacklisted.studio subdomain

*For Play review:* a subdomain URL would technically satisfy the
Console fields (a privacy-policy URL is just a URL). But reviewers and
automated systems follow the developer website. blacklisted.studio is
an adult-entertainment agency's domain: landing a Play reviewer — or a
realtor-association partner — in that context undermines the generic
positioning, invites guilt-by-association scrutiny under the Sexual
Content policy, and makes the §3.2 bridge almost impossible to keep
clean (parent-site nav links everywhere by default). A fresh domain
makes the firewall **structural** instead of a matter of discipline.

*For generic-audience trust:* the launch channels in the blueprint
(§7.5) are associations — realtors, notaries/signing agents, sitter
networks. Those organisations link to, co-market and sometimes
whitelist vendor sites. A `*.blacklisted.studio` URL — with
"blacklisted" itself reading as a negative to corporate reviewers —
fails that room; a clean brand domain (e.g. the shortlisted name's
.com/.app) passes it. Separate domain also means separate analytics,
separate SEO equity, and a support email that doesn't route through
the adult brand.

**Recommendation: fresh standalone domain under the new generic brand**
(e.g. winghold.com/.app if §2.3 is adopted — both screened likely
available), separate lightweight site, no cross-links in either
direction by default. guardian.blacklisted.studio continues unchanged
as the provider/direct door.

### 3.4 SHOULD carry (trust & conversion)

- **Pack catalogue documentation** — required to be described in the
  listing (§8.3: the pack system and catalogue categories are
  documented features); the site is where the depth lives: one page
  per launch pack from §7.5's order — Real Estate & Showings, Field &
  In-Home Services, Pet & Home Sitting, Mobile Notary/Signing, plus
  the generic In-Person Client Sessions pack and Dating & Social base
  mode — each with its terminology, checklists and workflow story.
- **Profession landing pages** for those same trades, written for
  association sharing (downloadable one-pager, safety-statistics
  framing with disciplined claims, testimonial slots reserved for
  *generic-trade* practitioners — the Play storefront cannot borrow
  the flagship audience's testimonials, §2.4 of the blueprint).
- **How-it-works / safety-model page** — the escalation ladder,
  check-in mechanics, and the honest limits, in the §8.4 register.
- **On-device AI & privacy explainer** — the strongest trust asset the
  generic brand has: audio analysed on the phone, not collected
  (Google's own Data Safety definition), safeword mechanics, what the
  mic notification means. Written for non-technical readers.
- **Download path = Play badge only**, plus help centre/FAQ, contact,
  accessibility statement, terms of service (incl. pack/Play Billing
  terms), and a status page once the native service ships.

---

## Bottom line

1. **"Guardian" scores 2/10 as a Play brand** — an identically named,
   near-identically featured incumbent (~103K installs), OnStar
   Guardian (1M+), Rave Guardian (campuses), Guardian24/WorkSafe
   Guardian (lone-worker B2B), and web ownership by The Guardian news
   and Guardian Life make it undiscoverable and weakly ownable. Keep
   it for the direct flavor, where its equity and the Guardian Pro
   beta promise live.
2. **Rename the generic flavor.** Shortlist: **Winghold** (⭐ first
   choice — no collisions, both domains NXDOMAIN), **Secondwatch**,
   **Holdfast** (photographer-brand caution), **SoloSignal**.
3. **Yes — a second website is required in practice:** it must host
   the privacy policy, the account-deletion page, and the public
   support contact filed with Play; it must never bridge to the
   direct/adult edition in any form; and it should live on a **fresh
   domain under the new brand**, not a blacklisted.studio subdomain.

---

## ADDENDUM — DECISION (2026-11-03 ~03:49 PST, supersedes the shortlist above)

After ~67 names screened across 2026-11-02/03 (full log in `~/memory/2026-11-02.md` and `~/memory/2026-11-03.md`), Rob LOCKED the Play (generic) edition name:

**Watch My Back (W.M.B.)**

- The Winghold/Secondwatch/Holdfast/SoloSignal shortlist above is RETIRED — Winghold and WingWatch were explicitly rejected by Rob ("hated"); do not re-pitch.
- Final brand architecture: flagship/direct edition = **Renegade Guardian**; Play/generic edition = **Watch My Back (W.M.B.)**. The W.M.B. initialism is the ownable mark; the full phrase is a common idiom (accepted caveat). Rave Guardian's "Watch Your Back" is feature copy, not a product name; no owner/product collision for "Watch My Back."
- Other finalists at the lock: Quiet Guardian, Quiet Keeper (not picked).
- Next steps: registrar availability check for a fresh Watch My Back domain (this VM's DNS is synthetic — registrar is the decider; purchase needs Rob's go), then build the second website on that domain: privacy policy URL, account-deletion URL, public developer/support contact matching the Play Console listing, Data Safety substantiation page, prominent-disclosure mirror. The site must NEVER link, mention, name, QR, or hint at the direct edition, the Entertainment pack, or any BNE property.
