# Guardian Phase 7 — Google Play Policy Research (Primary Sources Only)

Researched 2026-11-02. Every claim below is sourced to a Google Play policy page
(support.google.com/googleplay/android-developer) or an Android Developers page
(developer.android.com), except §3.3, which cites the affected companies' own
official pages/listings (Tinder Help, bSafe's own Play listing). No blogs,
no marketing summaries.

## Verdict table

| # | Item | Verdict |
|---|------|---------|
| 1.1 | Standalone "Personal Safety / emergency apps" Play policy | OK — none exists; governed by the named policies below |
| 1.2 | Safety/emergency claims in listing ("guaranteed rescue" etc.) | RISK if overclaimed (Deceptive Behavior) |
| 1.3 | Background location (`ACCESS_BACKGROUND_LOCATION`) | OK-with-declaration |
| 1.4 | Foreground services: `location`, `microphone`, `dataSync` (Android 14+) | OK-with-declaration |
| 1.5 | Background / session audio monitoring + detection | RISK (mitigable — see conditions) |
| 1.6 | Location/audio sharing with the user's own circle (Stalkerware adjacency) | RISK if framed as "monitoring"; OK as self-protection with persistent notification |
| 1.7 | Data Safety section — on-device-only audio/location processing | OK-with-declaration |
| 1.8 | `SEND_SMS` for emergency alerts | OK-with-declaration (named exception) |
| 2.1 | Pack system downloading executable code (dex/JAR/.so) from our server | **BLOCKER** |
| 2.2 | Code-bearing packs via Play Feature Delivery (dynamic feature modules) | OK |
| 2.3 | Non-code packs (JSON, themes, assets, terminology, workflows) from our server | OK-with-conditions |
| 2.4 | On-device LLM model files downloaded from our server | OK-with-conditions |
| 2.5 | Interpreted code (JS in WebView/interpreter) loaded at runtime | OK-with-conditions |
| 3.1 | Generic safety listing copy (gig workers, solo meetings) | OK |
| 3.2 | Adult in-person entertainer pack inside the Play build | RISK, bordering BLOCKER; hiding it from review = **BLOCKER** |
| 3.3 | Dating-safety features (blind-date / meeting-someone-new pack) | OK |
| 3.4 | Marketing/targeting to teens (under-18 target audience) while any adult pack exists | **BLOCKER** for under-18 targeting |
| 3.5 | Fake-call screens mimicking Samsung/Pixel/iPhone call UI | RISK (Deceptive Behavior — mimicry) |

---

## 1. Policies governing a personal-safety app

### 1.1 There is NO standalone Play policy named "Personal Safety" or "emergency apps" — OK

The Play Policy Center index lists the policy families as: Restricted Content;
Intellectual Property; Privacy, Deception and Device Abuse (User Data;
Permissions and APIs that Access Sensitive Information; Device and Network
Abuse; Deceptive Behavior; Misrepresentation; Target API Level); Use of SDKs;
Mobile Unwanted Software; Monetization/Ads; Store Listing. No policy named
"Personal Safety," "emergency apps," or similar appears.
Source: https://support.google.com/googleplay/android-developer/topic/9858052

Guardian is therefore governed by the named policies in §§1.2–1.8 below. There
is no special safety-app approval track and no safety-app exemption from them.

### 1.2 Emergency/safety claims — Deceptive Behavior policy — RISK if overclaimed

- Policy name: **Deceptive Behavior**, §1 "Misleading Claims" and intro.
- "Developers must not attempt to deceive users… including but not limited to
  publishing apps which are determined to be functionally impossible. Apps must
  provide an accurate disclosure, description and images/video of their
  functionality in all parts of the metadata."
- Common violations include apps that "claim functionalities that are not
  possible to implement" and apps that misrepresent functionality in
  description/title/icon/screenshots.
Source: https://support.google.com/googleplay/android-developer/answer/17006354

Implication: listing copy may promise alerts to the user's own circle,
check-in escalation, and location sharing (all real). It may NOT promise
guaranteed rescue, guaranteed response times, or a connection to emergency
services/dispatch that the app does not actually have. Guardian's existing
honest limit ("alerts your circle; not a substitute for emergency services")
is the compliant posture.

### 1.3 Background location — OK-with-declaration

Governing policies: **Permissions and APIs that Access Sensitive Information**
(Location Permissions section) and the **Background Location policy**, plus the
**User Data** policy (device location is expressly "personal and sensitive
user data").

- "Background location may only be used to provide features beneficial to the
  user and relevant to the core functionality of the app."
- "Apps should request the minimum scope necessary (for example, coarse
  instead of fine, and foreground instead of background)… we may reject apps
  that request or access background location without compelling justification."
- Location-via-foreground-service is allowed only if "initiated as a
  continuation of an in-app user-initiated action" and "terminated immediately
  after the intended use case… is completed."
Source: https://support.google.com/googleplay/android-developer/answer/9888170

Declaration process (Play Console → App content → Sensitive app permissions →
Location permissions), all four items mandatory:
1. **Permissions Declaration Form** — describe ONE location-based feature only;
   "We can only evaluate one feature at a time. The inclusion of multiple
   features will result in an app's rejection." Approval covers the whole app.
2. **Video demonstration** (≤30s recommended) showing the declared feature,
   the prominent disclosure dialog, and the runtime prompt.
3. **Prominent in-app disclosure** — inside the app, in normal usage flow (not
   buried in a menu), describing data accessed/collected, how it is used/shared;
   cannot live only in the privacy policy.
4. **Privacy policy** posted both in Play Console and within the app.
Source: https://support.google.com/googleplay/android-developer/answer/9799150

The same page's approval considerations work in Guardian's favour — verbatim:
"Significant user benefits include **physical safety, perceived safety**, and
health/fitness" (contrasted with "minimal" benefits: ads, analytics,
personalization, entertainment, convenience). A session-safety tracker is the
use case this policy was written to allow.
Source: https://support.google.com/googleplay/android-developer/answer/9799150

Design note from the same sources: if Guardian only ever tracks during a
user-started session, a `location` foreground service started from that
in-app action may avoid `ACCESS_BACKGROUND_LOCATION` entirely; but Google
warns FGS use "equivalent to ACCESS_BACKGROUND_LOCATION… will be subject to
location in the background permissions requirements," so do not treat FGS as
a loophole — file the declaration anyway if tracking continues with the app
closed/screen off beyond the session FGS.
Sources: https://support.google.com/googleplay/android-developer/answer/9799150 ,
https://support.google.com/googleplay/android-developer/answer/9888170

### 1.4 Foreground services (Android 14+) — OK-with-declaration

Two layers, both mandatory:

**Android platform (developer.android.com), "Foreground service types are required":**
Apps targeting Android 14 (API 34) must declare `android:foregroundServiceType`
per service and the matching permission, or the system throws
`MissingForegroundServiceTypeException`. Guardian's types:

| Type | Manifest permission | Runtime prerequisite (per Android docs) |
|------|--------------------|------------------------------------------|
| `location` | `FOREGROUND_SERVICE_LOCATION` | Location services on + `ACCESS_COARSE_LOCATION` or `ACCESS_FINE_LOCATION` granted |
| `microphone` | `FOREGROUND_SERVICE_MICROPHONE` | `RECORD_AUDIO` runtime permission granted. Description: "Continue microphone capture from the background, such as voice recorders or communication apps." |
| `dataSync` | `FOREGROUND_SERVICE_DATA_SYNC` | None. Covers upload/download, backup/restore, import/export, local file processing |

Also documented: `specialUse` exists for cases no other type fits; its use
cases are declared in the manifest `<property>` element and "are reviewed when
you submit your app in the Google Play Console."
Source: https://developer.android.com/about/versions/14/changes/fgs-types-required

**While-in-use restriction (hard technical constraint on the AI-monitoring design):**
`RECORD_AUDIO` and location are "while-in-use" permissions — an app **cannot
create** a `microphone`/`camera`/`location` foreground service while the app is
in the background (few exceptions; `ACCESS_BACKGROUND_LOCATION` is the named
exception for the `location` type). Android 12+ also bars starting FGS from the
background generally, throwing `ForegroundServiceStartNotAllowedException`.
Consequence: audio monitoring and session tracking must be **armed by the user
while the app is in the foreground** (Guardian's session-start flow already
does this); the app cannot silently self-start listening later.
Source: https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start
(also stated per-type in https://developer.android.com/about/versions/14/changes/fgs-types-required)

**Play policy (Permissions for Foreground Services (FGS), inside the Device
and Network Abuse policy page):** for Android 14+ targets you must "declare
valid Foreground Service (FGS) types in the manifest **and Play Console**,
providing descriptions, user impact, and a demo video justifying their use
based on user-initiated, perceptible actions." A type may be declared only if
the use: (a) is beneficial and relevant to core functionality; (b) is initiated
by the user or user-perceptible; (c) can be terminated/stopped by the user;
(d) cannot be deferred/interrupted by the system without harming the feature;
(e) runs only as long as necessary. Exempt: `systemExempted`, `shortService`,
and `dataSync` only when using Play Asset Delivery.
The Android docs add the Console mechanics: declare types on the App content
page (Policy > App content).
Sources: https://support.google.com/googleplay/android-developer/answer/16559646 ,
https://developer.android.com/about/versions/14/changes/fgs-types-required

Note: the `systemExempted` type lists "Safety Apps that have the
`ROLE_EMERGENCY` role" among its eligible holders (Android docs, same page) —
a possible future avenue, not required for the design above.

### 1.5 Microphone / background audio monitoring — RISK (mitigable)

Three policies converge on Guardian's audio-detection feature:

1. **User Data policy — "Personal and Sensitive User Data" + "Prominent
   Disclosure & Consent Requirement."** Microphone data is expressly listed as
   personal and sensitive user data. Where access "may not be within the
   reasonable expectation of the user (for example, if data collection occurs
   in the background when the user is not engaging with your app)," the app
   must show a prominent in-app disclosure (in the app, in normal usage flow,
   naming the data and how it is used/shared, not only in a privacy policy),
   immediately before the consent/runtime-permission request; consent must be
   a clear affirmative action, granted before collection begins.
   Source: https://support.google.com/googleplay/android-developer/answer/10144311

2. **Malware policy — "Spyware."** Spyware is defined as code that "collects,
   exfiltrates, or shares user or device data that is not related to policy
   compliant functionality," or that spies "without adequate notice or
   consent." The policy's own examples of spyware violations include, verbatim:
   "**Recording audio or recording calls made to the phone**." The mitigations
   in the same section: clear notice + explicit consent before any collection
   or transmission, collection limited to the stated function, no hidden data
   collection.
   Source: https://support.google.com/googleplay/android-developer/answer/9888380

3. FGS `microphone` declaration + while-in-use start restriction (§1.4) —
   monitoring can only run inside a user-armed session, with the mandatory
   persistent FGS notification visible.

Verdict reasoning: continuous or covert background listening, or recording
phone calls, lands squarely in the Spyware example list = rejection/removal
risk. Session-only, user-started, persistent-notification, on-device-only
processing (features never leave the phone unless the user triggers an alert)
fits the same pages' stated mitigations and the `microphone` type's own
documented use case ("voice recorders or communication apps"). Ship it only
in that shape.

### 1.6 Sharing location/audio with the user's circle — Stalkerware adjacency — RISK if framed as monitoring

- Policy name: **Malware — "Stalkerware."** "Code that collects personal or
  sensitive user data from a device and transmits the data to a third party
  (enterprise or another individual) for monitoring purposes." The ONLY
  acceptable monitoring apps are those "exclusively designed and marketed for"
  parents monitoring their children or enterprise management of employees —
  "These apps cannot be used to track anyone else (a spouse, for example) even
  with their knowledge and permission." Monitoring apps must: not present as
  spying/secret surveillance, not hide/cloak tracking, show a persistent
  notification with a unique identifying icon at all times while running,
  disclose monitoring/tracking in the Play store description, and use the
  `IsMonitoringTool` manifest flag. Listings also "must not provide any means
  to activate or access functionality that violate these terms, such as
  linking to a non-compliant APK hosted outside Google Play."
  Source: https://support.google.com/googleplay/android-developer/answer/9888380

Guardian is the inverse pattern (the device owner shares her OWN location
with her OWN chosen contacts, for her own protection), which is the standard
safety-app model — but the defence is framing + behaviour, and it must be
airtight: never market any feature as tracking/monitoring another person;
tracking is always of the signed-in user; persistent notification while a
session runs (the FGS notification already satisfies the visibility pattern);
store description discloses the sharing plainly. Any future "watch your
partner/client" feature would be a BLOCKER under this section.

### 1.7 Data Safety section — on-device processing — OK-with-declaration

- Google Play Help, "Understand app privacy & security practices with Google
  Play's Data safety section": "Data is generally considered 'collected' when
  the developer uses their app to retrieve data off your device." And,
  verbatim: "Developers do not need to disclose data accessed by an app as
  'collected' in the Data safety section if: **An app accesses the data only
  on your device and it is not sent off your device.** For example, if you
  provide an app permission to access your location, but it only uses that
  data to provide app functionality on your device and does not send it to
  its server, it does not need to disclose that data as collected." A second
  exclusion covers data "sent off the device but only processed ephemerally"
  (in-memory only, retained no longer than needed to service the request).
  Source: https://support.google.com/googleplay/answer/11416267

Application to Guardian:
- Audio that is captured and analysed **on-device only** (safeword/distress
  detection, on-device transcription) and never transmitted → NOT "collected"
  for Data Safety purposes, by Google's own location example. This is the
  single strongest policy argument for the on-device-LLM architecture.
- Anything that DOES leave the device must be declared accurately: precise
  location transmitted to the user's circle/relay during sessions, account
  identifiers (Supabase account), and any alert payloads. Declaring "no data
  collected" while location leaves the phone would be a Data Safety mismatch
  (and a User Data violation).
- **User Data policy** also requires: a privacy policy in the store listing
  AND in the app; secure transmission (modern cryptography/HTTPS); no sale of
  personal/sensitive data; and, because Guardian has accounts, account
  deletion available in-app and via an external web resource (account
  freezing is not a substitute).
  Source: https://support.google.com/googleplay/android-developer/answer/10144311

### 1.8 SEND_SMS for emergency alerts — OK-with-declaration (bonus find)

- Policy name: **SMS and Call Log Permissions**; the permitted-uses page lists
  an explicit exception: "**Physical safety/emergency alerts to send SMS** —
  Apps that send SMS alerts in emergency situations" are eligible for
  `SEND_SMS`, subject to Google Play review and approval via the Permissions
  Declaration Form. (Without an exception, SMS permissions are restricted to
  default SMS/Phone/Assistant handlers.)
  Source: https://support.google.com/googleplay/android-developer/answer/10208820

---

## 2. Experience-pack download system

### 2.1 Executable code from our own server — **BLOCKER**

- Policy name: **Device and Network Abuse.** Verbatim: "An app distributed via
  Google Play may not modify, replace, or update itself using any method other
  than Google Play's update mechanism. Likewise, **an app may not download
  executable code (such as dex, JAR, .so files) from a source other than
  Google Play.**" Listed common violation: "Apps or third party code (for
  example, SDKs) that download executable code, such as dex files or native
  code, from a source other than Google Play."
  Source: https://support.google.com/googleplay/android-developer/answer/16559646
- Related: **Malware — "A Note on the Backdoor Category"**: dynamic code
  loading used to perform harmful/policy-violating actions is classified as
  backdoor malware; arbitrary code execution will at minimum be treated as a
  vulnerability to patch.
  Source: https://support.google.com/googleplay/android-developer/answer/9888380

Any pack containing dex/JAR/.so (e.g., a compiled Kotlin/Java feature, a native
ML library) served from BNE infrastructure = hard violation. No exceptions in
the policy text for first-party servers.

### 2.2 Code-bearing packs via Play Feature Delivery — OK

- Android Developers, "Overview of Play Feature Delivery": Play's app-serving
  model uses Android App Bundles; "Play Feature Delivery uses advanced
  capabilities of app bundles, allowing certain features of your app to be
  delivered conditionally or downloaded on demand" after separating them into
  **feature modules**. Documented delivery options: **install-time**,
  **on-demand** (app requests/downloads the module when needed, via the Play
  Feature Delivery Library), **conditional** (device capability, locale, min
  API), and **instant**. Modules are part of the uploaded bundle — i.e., the
  code comes **from Google Play**, satisfying §2.1.
  Source: https://developer.android.com/guide/playcore/feature-delivery
- Play Asset Delivery is the asset-only sibling: "asset packs, which are
  composed of assets (such as textures, shaders, and sounds), but **no
  executable code**," hosted and served on Google Play, with install-time /
  fast-follow / on-demand modes. (Documented primarily for games; Feature
  Delivery is the general app route.)
  Source: https://developer.android.com/guide/playcore/asset-delivery

Constraint: anything delivered this way is inside the reviewed bundle — a
pack shipped as a dynamic feature module is fully visible to Play review
(see §3.2 for what that means for the adult pack).

### 2.3 Non-code packs from our own server — OK-with-conditions

JSON configuration, theme tokens/assets, images/sounds, terminology/string
tables, and workflow definitions (screen order, field sets, checklists) are
**data, not executable code** — the §2.1 ban names dex/JAR/.so and self-update
of the app itself; it does not ban downloading content/configuration. Two
conditions from other named policies:

1. **Deceptive Behavior §3.2**: "Additional app resources (for example, game
   assets) may only be downloaded if they are necessary for the users' use of
   the app. Downloaded resources must be compliant with all Google Play
   policies, and **before beginning the download, the app should prompt users
   and clearly disclose the download size**." A listed violation: "Apps with
   content delivery network (CDN) facilitated downloads that fail to prompt
   the user and disclose the download size prior to downloading."
2. **Deceptive Behavior §5 "Behavior Transparency" + §3 examples**: "don't
   include any hidden, dormant, or undocumented features within your app";
   a listed violation is "Apps with different core functionality based on a
   user's geography, device parameters, or other user-dependent data where
   those differences are not prominently advertised to the user in the store
   listing," and "Apps that change significantly between versions without
   alerting the user… and updating the store listing."
   Source (both): https://support.google.com/googleplay/android-developer/answer/17006354

Practical reading: the pack system itself, and the pack catalogue categories,
must be described in the Play listing ("downloadable experience packs for
different kinds of solo work"), every pack download is user-tapped with its
size shown first, and a pack may restyle/reorder/relabel the SAME reviewed
feature set — it may not switch on functionality that was nowhere in the
listing/review.

### 2.4 On-device LLM model files from our own server — OK-with-conditions

Model weights are data files executed by an inference runtime already inside
the app, not dex/JAR/.so — they fall outside the §2.1 ban's letter, and the
Device and Network Abuse policy itself carves out code "that runs in a virtual
machine or an interpreter where either provides indirect access to Android
APIs."
Source: https://support.google.com/googleplay/android-developer/answer/16559646
Conditions: the §2.3 rules apply in full (user prompt + download size
disclosed — model packs are large, so this matters; the feature must be
documented in the listing, per Behavior Transparency), and the model's
functions must stay within the disclosed safety features (a remotely
delivered model that unlocked undisclosed behaviour would re-enter Backdoor/
Behavior Transparency territory, §2.1/§2.3 sources above). Downloading the
same models via Play Asset/Feature Delivery (§2.2) removes the argument
entirely and is the lower-risk route for large weights.

### 2.5 Interpreted code at runtime (JS-driven pack logic) — OK-with-conditions

The Device and Network Abuse page exempts interpreter/VM code from the
download ban (JavaScript in a WebView is the named example) BUT adds, verbatim:
"Apps or third-party code, like SDKs, with interpreted languages (JavaScript,
Python, Lua, etc.) loaded at run time (for example, not packaged with the app)
**must not allow potential violations of Google Play policies**."
Source: https://support.google.com/googleplay/android-developer/answer/16559646
So a JS-executed workflow engine is allowed; using it to deliver, after
review, behaviour that would itself violate a policy (see §3.2) is not.

---

## 3. Generic listing + an adult in-person entertainer pack

### 3.1 Generic safety listing — OK

Nothing in the policies restricts marketing a safety app to gig workers,
delivery drivers, real-estate agents, photographers, babysitters, etc. The
constraints are the general ones already covered: listing must accurately
describe functionality (Deceptive Behavior, §1.2), permissions must match
features "promoted in your Google Play listing" (Permissions policy: you may
only request sensitive permissions "necessary to implement current features or
services in your app that are promoted in your Google Play listing," and never
for "undisclosed, unimplemented, or disallowed features").
Source: https://support.google.com/googleplay/android-developer/answer/9888170

### 3.2 Adult in-person entertainer pack — RISK, bordering BLOCKER; concealing it = BLOCKER

- Policy name: **Inappropriate Content — "Sexual Content and Profanity."**
  Verbatim full policy: "We don't allow apps that contain or promote sexual
  content or profanity, including pornography, or any content or services
  intended to be sexually gratifying. **We don't allow apps or app content
  that appear to promote or solicit a sexual act in exchange for
  compensation.**"
  Verbatim common violations include:
  - "**Apps that promote sex-related entertainment, escort services, or other
    services that may be interpreted as providing or soliciting sexual acts
    in exchange for compensation**, including, but not limited to compensated
    dating or sexual arrangements… ('sugar dating')."
  - "Content that is lewd or profane – including but not limited to content
    which may contain profanity, slurs, **explicit text, or adult/sexual
    keywords in the store listing or in-app**."
  Source: https://support.google.com/googleplay/android-developer/answer/9878810

Application, bluntly:
- The LISTING is safe only if it contains zero sexual keywords, imagery, or
  entertainer/escort framing (§3.1's generic copy does this).
- A pack **named or described** for adult entertainers/escorts, or whose
  in-app copy speaks to incall/outcall entertainment work, matches the
  enumerated violation language ("promote sex-related entertainment, escort
  services") as a reviewer/automated scan will read it — even though the
  pack's actual functions are safety functions. In the Play build that is a
  removal-and-strike exposure, not a mere rejection risk.
- Hiding the pack from review is worse, and separately prohibited:
  Deceptive Behavior bans "misleading reviewers as to the purpose and
  functionality of your apps" and lists "Apps that attempt to modify or
  obfuscate behavior during review" as violations; Behavior Transparency
  bans "hidden, dormant, or undocumented features… designed to be activated
  remotely" (§2.3 source). A server-flag unlock for the adult pack after
  approval = textbook violation of both.
  Source: https://support.google.com/googleplay/android-developer/answer/17006354
- The Stalkerware section adds a distribution tripwire: app listings "must
  not provide any means to activate or access functionality that violate
  these terms, such as linking to a non-compliant APK hosted outside Google
  Play" (stated there for monitoring functionality; the same
  listing-must-not-route-around-policy principle is what review applies).
  Source: https://support.google.com/googleplay/android-developer/answer/9888380

Viable shape (the only one these texts support): in the Play build, the pack
is a genuinely generic **"In-Person Client Sessions"** pack — client,
appointment, address, deposit-received, check-in/out terminology shared by
notaries, photographers, cleaners, tutors — documented in the listing like
every other pack, containing no adult keywords or entertainer-specific copy
anywhere in the binary, listing, or Play-delivered modules. Adult-specific
branding/terminology, if it ever ships, belongs to the direct/web channel
outside Play, and the Play listing/app must not link to or unlock it.

### 3.3 How mainstream apps handle dating — the compliant pattern — OK

- **Tinder (official Tinder Help)**: its Noonlight integration is framed
  purely as safety backup for meeting in person — "Share where, when and who
  you're meeting IRL via Noonlight's Timeline feature," "Discreetly trigger
  emergency services if you're feeling uneasy," and "The only data shared
  with Noonlight is data that you choose to share… only used in case of
  emergency, and with your permission." No facilitation of the date itself;
  safety layer only, neutral language.
  Source: https://www.help.tinder.com/hc/en-us/articles/360039260031-Noonlight
- **bSafe (its own Google Play listing)**: a mainstream personal-safety app
  whose listing openly includes voice-activated SOS, live streaming,
  automatic audio/video recording on SOS, fake call, and GPS "Follow Me" —
  i.e., Guardian's core feature set is precedented in a live Play listing.
  Source: https://play.google.com/store/apps/details?id=com.bipper.app.bsafe&hl=en

Pattern: "meeting someone new / first date" safety language is fine;
matchmaking, client booking, or anything that facilitates the underlying
encounter is where §3.2's language bites. A blind-date pack written in the
Tinder/Noonlight register (share plans with your circle, check-in timer,
fake call, SOS) is OK.

### 3.4 Teens in the target audience — **BLOCKER** as proposed

Rob's audience list includes "students / teens." Policy name: **Google Play
Families Policies.** If the app's declared target audience includes children
(Play's target-audience age groups under 18), Families requirements attach,
including: disclosure of collection of personal/sensitive information from
children "including… microphone and camera sensor data"; legal compliance
with COPPA/GDPR; and "Social apps where the main focus of the app is to chat
with people that they do not know… must not target children" (dating apps are
a named example). Combined with §3.2 (an app ecosystem containing an adult
pack) and the Sexual Content policy's minor-protection stance, selecting any
under-18 target-audience group is untenable.
Source: https://support.google.com/googleplay/android-developer/answer/9893335
Recommendation: declare target audience **18+ only**; "students" in copy
means adult students. Do not market the Play listing to teens.

### 3.5 Fake-call UI mimicry — RISK (flagged for the native build)

Guardian's fake-call feature replicates Samsung One UI / Pixel / iPhone
incoming-call screens. **Deceptive Behavior**: "Apps must not attempt to mimic
functionality or warnings from the operating system or other apps," and its
intro repeats that apps are "prohibited from mimicking other apps or OS
warnings."
Source: https://support.google.com/googleplay/android-developer/answer/17006354
A pixel-faithful clone of another OS/phone app's call screen is exactly what
this text describes. Lower-risk Play shape: a convincing but generic
incoming-call screen (own layout/branding details), keeping the
device-matched skins for the direct channel. Reviewer discretion makes this
RISK rather than a certain BLOCKER.

---

## Bottom line for Phase 7 architecture

1. Native Android on Play is viable: every sensitive capability Guardian
   needs (background location, mic FGS, location FGS, emergency SMS) has a
   named, documented declaration path, and Play's own background-location
   guidance names **physical safety** as a significant user benefit.
2. The price is declarations + evidence: background-location declaration
   (one feature, ≤30s video, prominent disclosure, privacy policy in app +
   listing), FGS declaration per type (description, user impact, demo
   video), Data Safety accuracy, prominent disclosure/consent before any
   background mic/location use.
3. Packs: data/config/theme packs from our server = OK (prompt + size
   disclosure, catalogue documented in listing). Code = Play Feature
   Delivery only. Executable code from our server = BLOCKER, no workaround.
4. The adult entertainer pack cannot exist, named as such, in the Play
   build, and cannot be hidden from review. Generic "In-Person Client
   Sessions" pack in Play; adult-specific edition stays outside Play, with
   no links/unlocks from the Play app or listing.
5. Launch 18+ target audience only.
