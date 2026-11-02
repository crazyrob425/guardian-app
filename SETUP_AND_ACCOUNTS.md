# Guardian — First-Run Setup Wizard + Free Accounts + Pro Subscriptions

Research + architecture, 2026-11-01 (all repo stats verified live via the GitHub API
on this date). Companion to BLUEPRINT_V2.md / RESEARCH_V2.md.

## The problem

Today Guardian has **no first-run flow**: a new user lands on Home and must discover
Settings (PINs), Circle, and the tour on her own. The safety-critical setup — PINs,
circle, test alert — is exactly the stuff a wizard exists to force-sequence.
Separately, the published beta promise ("every beta tester gets a free 1-year
Guardian Pro subscription when Pro launches") requires an **accounts system**:
identity + entitlement, so Pro can exist at all.

## Non-negotiable design constraint (from our own research)

The account database holds **identity + entitlement ONLY** — email, display name,
plan, Stripe customer id, beta-grant flag. It NEVER holds GPS, sessions, clients,
ledger, bookings, or vault data; all of that stays in on-device Dexie storage,
exactly as the beta blog promised ("no Guardian database exists" for personal data
stays true for *personal* data). Accounts answer one question — "is this person
entitled to Pro?" — and nothing else. RLS: users can read/update only their own row.

## Part 1 — Setup wizard (build natively; libraries verified)

Guardian is React + hash routes + localStorage settings. The wizard should be a
first-class flow, not a library transplant:

- **Wizard shell (ours):** full-screen stepper, `guardian.setup.v1` progress saved
  per-step so a half-finished setup resumes where she stopped. Gate: shown until
  `setupComplete` is set (PIN + ≥1 circle contact + test ping sent).
- **Step engine candidates (verified):**
  - `devrnt/react-use-wizard` ★662 MIT — tiny hook-based step manager; fine if we
    want a helper, but our needs are simple enough to hand-roll (recommended).
  - `react-hook-form/react-hook-form` ★44,898 MIT + `colinhacks/zod` ★44,244 MIT —
    form state + validation for profile/account steps (adopt).
  - `statelyai/xstate` ★30,395 MIT — state machines; powerful, overkill here (skip).
  - `surveyjs/survey-library` ★4,918 MIT — JSON-driven forms/surveys; wrong fit
    for a security setup flow (skip).
  - Tours stay `nilbuild/driver.js` ★27,007 MIT (already shipped in Phase 4) —
    the wizard *configures*, the tour *teaches*; `gilbarbara/react-joyride`
    ★7,889 MIT is the alternative if driver.js ever limits us.
- **Wizard steps:** 0 Welcome + privacy split explained (account vs on-device) →
  1 Free account (optional during beta, skippable) → 2 Profile (name, discreet
  mode, language) → 3 PINs (app PIN required; duress + decoy offered) →
  4 Circle (≥1 contact, ntfy pairing) → 5 Permissions (location, notifications,
  install/add-to-home-screen) → 6 Alarm sound + fake-call caller name →
  7 Test alert dry run → Done → hands off to the existing Home tour.

## Part 2 — Free accounts + database (adopt Supabase)

Verified backends: `supabase/supabase` ★114,423 Apache-2.0 (active) ·
`appwrite/appwrite` ★57,845 BSD-3 (active) · `pocketbase/pocketbase` ★61,613 MIT
(**repo archived — do not build on it**) · `better-auth/better-auth` ★30,545 MIT
(framework, needs own DB) · `keycloak` ★37,642 / `logto` ★14,837 / `zitadel`
★15,493 (enterprise IdPs — overkill).

**Recommendation: Supabase** — because Rob already runs it (wa-trust-studio:
magic-link auth, RLS own-row tables, in production). New project
`guardian-accounts`:
- Auth: magic link (same pattern as WA Trust) + optional password; passkeys later.
- Tables: `profiles` (id=auth uid, email, display_name, plan
  `beta|free|pro`, pro_source `beta_grant|stripe|btcpay`, pro_expires_at,
  stripe_customer_id, created_at), `beta_claims` (email, claimed_at, note).
- RLS own-row policies, mirroring the wa-trust-studio setup.
- App integration: a small `src/lib/account.ts` — sign in/out, fetch own plan,
  cache a 30-day offline entitlement grace locally (a safety app must never lock
  a user out of Pro safety features mid-date because a token expired).

## Part 3 — Pro subscriptions (Stripe first, MoR evaluated, OSS engines deferred)

- **Stripe Billing + Customer Portal** — Guardian already has Stripe plumbing
  (deposit payment links). A tiny Cloudflare Worker (same pattern as
  guardian-sync) receives Stripe webhooks and mirrors subscription status into
  Supabase `profiles`. Beta testers: `pro_source=beta_grant`,
  `pro_expires_at = Pro launch + 1 year` — the published promise, kept in data.
- **Category-risk hedge (our own stat: 63% of workers have lost a payment
  account):** evaluate Lemon Squeezy / Paddle (merchant-of-record, they carry
  the tax + account risk) as alternate checkout; BTCPay (already integrated for
  deposits) as the uncancellable rail for Pro.
- **OSS billing engines — verified but deferred:** `getlago/lago` ★10,747
  AGPL-3.0, `killbill/killbill` ★5,835 Apache-2.0, `openmeterio/openmeter`
  ★2,432 Apache-2.0, `flexprice/flexprice` ★6,874 AGPL-3.0. All solve
  usage-based metering Guardian doesn't have; revisit only if Pro goes
  metered. SaaS-starter wiring references: `nextjs/saas-starter` ★16,245 MIT
  (Stripe + Postgres patterns), `mickasmt/next-saas-stripe-starter` ★3,011 MIT
  (Better Auth + Stripe). `vercel/nextjs-subscription-payments` is **archived**
  — patterns only, don't clone-and-go.

## Build order (proposed Phase 6)

1. Wizard shell + steps 2–7 against existing local settings (no account needed).
2. Supabase `guardian-accounts` project + `account.ts` + wizard step 1 +
   Settings account card ("You're on Beta — everything's free").
3. Entitlement plumbing (plan fetch + offline grace; nothing paywalled yet).
4. When Pro launches: Stripe Billing products + webhook Worker + Customer
   Portal link + beta-grant backfill from `beta_claims`.

*Generated 2026-11-01. Verify stars/licenses again before adopting anything new.*
