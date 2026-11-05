// Client dossier / contact manager (2026-11-05).
//
// Rob's rules, enforced structurally:
//  - The ONLY required facts are a name and at least one contact channel
//    (phone / email / handle / any other channel). Everything else is
//    optional-but-available; completeness is encouraged by a strength
//    meter, never by required-field walls.
//  - Rollups (dates, deposits, ratings) are ALWAYS computed from booking
//    records — never hand-entered, so they can't drift from reality.
//  - Everything lives on-device. This module makes no network calls.
//
// The dossier summary exported at the bottom is the contract the Command
// & Control screen consumes: basics + rollups + a references summary +
// the share-toggle-respecting fields (notes / ratings / history ride
// along ONLY when the user toggled sharing on for that client).

import { db, type BookingRow, type ClientRow } from "./db";
import { phoneIntel } from "./screening";

// ---- types -----------------------------------------------------------------

export type VerifiedStatus = "yes" | "no" | "in-progress";
export type ServicePref = "" | "incall" | "outcall" | "both";
export type RefSentiment = "positive" | "neutral" | "negative";

export interface ContactChannel {
  id: string;
  kind: "phone" | "email" | "handle" | "other";
  label: string; // platform / carrier / free label, e.g. "P411", "TextNow"
  value: string;
}

export interface ProviderReference {
  name: string;
  contact: string;
  sentiment: RefSentiment;
  confirmed: boolean;
}

export interface ScreenDetails {
  age?: string;
  occupation?: string;
  vehicle?: string;
  socials?: string;
  idChecked?: boolean;
}

export interface IncidentEntry {
  id: string;
  ts: number;
  severity: "note" | "caution" | "serious";
  text: string;
}

export interface CommsEntry {
  id: string;
  ts: number;
  channel: string; // "imported conversation", "note", ...
  text: string;
}

export const MAX_REFERENCES = 3;

export function emptyReference(): ProviderReference {
  return { name: "", contact: "", sentiment: "neutral", confirmed: false };
}

let uidCounter = 0;
export function uid(prefix = "x"): string {
  uidCounter += 1;
  return `${prefix}${Date.now().toString(36)}${uidCounter.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

// ---- contact channels --------------------------------------------------------

/** Every channel on a dossier, primary fields first, normalized shape. */
export function contactChannelsOf(c: Partial<ClientRow>): ContactChannel[] {
  const out: ContactChannel[] = [];
  if (c.phone?.trim()) out.push({ id: "primary-phone", kind: "phone", label: "Phone", value: c.phone.trim() });
  if (c.email?.trim()) out.push({ id: "primary-email", kind: "email", label: "Email", value: c.email.trim() });
  if (c.handle?.trim()) out.push({ id: "primary-handle", kind: "handle", label: "Booking handle", value: c.handle.trim() });
  for (const ch of c.extraChannels ?? []) {
    if (ch.value?.trim()) out.push({ ...ch, value: ch.value.trim() });
  }
  return out;
}

export function hasAnyContact(c: Partial<ClientRow>): boolean {
  return contactChannelsOf(c).length > 0;
}

// ---- validation ---------------------------------------------------------------

export interface DossierValidation {
  ok: boolean;
  errors: string[];
}

/** The whole validation contract: name + one contact channel. That's it. */
export function validateDossier(c: Partial<ClientRow>): DossierValidation {
  const errors: string[] = [];
  if (!c.name?.trim()) errors.push("A name is required — even just the name he gave you.");
  if (!hasAnyContact(c)) errors.push("At least one way to reach him is required: a phone, email, handle, or other contact.");
  return { ok: errors.length === 0, errors };
}

// ---- dossier strength (the nudge, not a wall) ---------------------------------

export interface DossierStrength {
  pct: number; // 0–100
  filled: string[];
  missing: string[]; // human hints, most valuable first
}

export function dossierStrength(c: ClientRow, rollups?: DossierRollups): DossierStrength {
  const items: { label: string; done: boolean }[] = [
    { label: "Name", done: !!c.name?.trim() },
    { label: "Contact channel", done: hasAnyContact(c) },
    { label: "A second contact channel", done: contactChannelsOf(c).length >= 2 },
    { label: "Aliases / other names", done: (c.aliases ?? []).some((a) => a.trim()) },
    { label: "Where you met (source)", done: !!c.source?.trim() },
    { label: "Verification status decided", done: !!c.verifiedStatus },
    { label: "Verified: yes", done: c.verifiedStatus === "yes" },
    { label: "Deposit policy set", done: typeof c.depositRequired === "boolean" },
    { label: "Incall / outcall preference", done: !!c.servicePref },
    { label: "At least one provider reference", done: (c.references ?? []).some((r) => r.name.trim() || r.contact.trim()) },
    { label: "A confirmed reference", done: (c.references ?? []).some((r) => r.confirmed && (r.name.trim() || r.contact.trim())) },
    { label: "Screening details (age / job / vehicle / socials)", done: !!c.screenDetails && Object.values(c.screenDetails).some((v) => v === true || (typeof v === "string" && v.trim())) },
    { label: "Screening checklist started", done: Object.values(c.checks ?? {}).some(Boolean) },
    { label: "Preferences noted", done: !!c.preferences?.trim() },
    { label: "Boundaries noted", done: !!c.boundaries?.trim() },
    { label: "Private notes", done: !!c.notes?.trim() },
    { label: "Tags", done: (c.tags ?? []).some((t) => t.trim()) },
    { label: "First-contact date", done: !!c.firstContactAt },
  ];
  if (rollups) items.push({ label: "At least one completed date", done: rollups.totalDates > 0 });
  const filled = items.filter((i) => i.done).map((i) => i.label);
  const missing = items.filter((i) => !i.done).map((i) => i.label);
  return { pct: Math.round((filled.length / items.length) * 100), filled, missing };
}

// ---- rollups (computed, never hand-entered) ------------------------------------

export interface DossierRollups {
  totalDates: number; // completed ("done") bookings
  firstDateAt: number | null;
  lastDateAt: number | null;
  noShows: number;
  upcoming: number;
  depositsTaken: number; // deposits on completed + no-show bookings (money in hand)
  depositsOnCancelled: number;
  depositsUpcoming: number;
  ratings: { ts: number; rating: number; bookingId?: number }[];
  averageRating: number | null;
}

export function computeRollups(client: ClientRow, bookings: BookingRow[]): DossierRollups {
  const mine = bookings.filter((b) => b.clientId != null && b.clientId === client.id);
  const done = mine.filter((b) => b.status === "done").sort((a, b) => a.ts - b.ts);
  const noshowBookings = mine.filter((b) => b.status === "noshow");
  const ratings = done
    .filter((b) => typeof b.rating === "number")
    .map((b) => ({ ts: b.ts, rating: b.rating as number, bookingId: b.id }));
  return {
    totalDates: done.length,
    firstDateAt: done.length ? done[0].ts : null,
    lastDateAt: done.length ? done[done.length - 1].ts : (client.lastSeenAt ?? null),
    // booking-linked count wins; fall back to the legacy counter for
    // clients whose no-shows predate booking links.
    noShows: noshowBookings.length || (client.noShows ?? 0),
    upcoming: mine.filter((b) => b.status === "booked").length,
    depositsTaken: mine.filter((b) => b.status === "done" || b.status === "noshow").reduce((s, b) => s + (b.deposit || 0), 0),
    depositsOnCancelled: mine.filter((b) => b.status === "cancelled").reduce((s, b) => s + (b.deposit || 0), 0),
    depositsUpcoming: mine.filter((b) => b.status === "booked").reduce((s, b) => s + (b.deposit || 0), 0),
    ratings,
    averageRating: ratings.length ? ratings.reduce((s, r) => s + r.rating, 0) / ratings.length : null,
  };
}

// ---- duplicate detection --------------------------------------------------------

const digitsOf = (s: string) => s.replace(/\D/g, "");
const normEmail = (s: string) => s.trim().toLowerCase();
const normHandle = (s: string) => s.trim().toLowerCase().replace(/^@+/, "");

/** All normalized reach-keys on a record, for duplicate matching. */
export function reachKeys(c: Partial<ClientRow>): { kind: string; key: string; display: string }[] {
  const out: { kind: string; key: string; display: string }[] = [];
  const addPhone = (v: string) => {
    const d = digitsOf(v);
    if (d.length >= 7) out.push({ kind: "phone", key: `p:${d.slice(-10)}`, display: v });
    const e = phoneIntel(v).e164;
    if (e) out.push({ kind: "phone", key: `p:${digitsOf(e).slice(-10)}`, display: v });
  };
  const addEmail = (v: string) => { if (v.trim()) out.push({ kind: "email", key: `e:${normEmail(v)}`, display: v }); };
  const addHandle = (v: string) => { if (v.trim()) out.push({ kind: "handle", key: `h:${normHandle(v)}`, display: v }); };
  if (c.phone) addPhone(c.phone);
  if (c.email) addEmail(c.email);
  if (c.handle) addHandle(c.handle);
  for (const ch of c.extraChannels ?? []) {
    if (ch.kind === "phone") addPhone(ch.value);
    else if (ch.kind === "email") addEmail(ch.value);
    else if (ch.kind === "handle") addHandle(ch.value);
  }
  // dedupe identical keys
  const seen = new Set<string>();
  return out.filter((k) => (seen.has(k.key) ? false : (seen.add(k.key), true)));
}

export interface DuplicateMatch {
  client: ClientRow;
  matchedOn: { kind: string; display: string }[];
}

/** Find existing clients sharing a phone/email/handle with the draft. */
export function findDuplicates(draft: Partial<ClientRow>, all: ClientRow[]): DuplicateMatch[] {
  const keys = new Set(reachKeys(draft).map((k) => k.key));
  if (!keys.size) return [];
  const out: DuplicateMatch[] = [];
  for (const c of all) {
    if (draft.id != null && c.id === draft.id) continue;
    const matchedOn = reachKeys(c).filter((k) => keys.has(k.key)).map((k) => ({ kind: k.kind, display: k.display }));
    if (matchedOn.length) out.push({ client: c, matchedOn });
  }
  return out;
}

// ---- merge ------------------------------------------------------------------------

export type MergePick = "keep" | "incoming";

/**
 * Merge `incoming` into `keep`. Scalar conflicts resolve via `picks`
 * (default: keep wins). List-like data (aliases, extra channels, tags,
 * incidents, comms log, follow-ups) always unions. References fill empty
 * slots first, then union non-identical entries up to the 3-slot cap.
 * Pure — the caller persists the result and deletes the loser.
 */
export function mergeClients(keep: ClientRow, incoming: ClientRow, picks: Partial<Record<string, MergePick>> = {}): ClientRow {
  const pick = <T,>(field: string, a: T, b: T): T => (picks[field] === "incoming" ? b : a);
  const union = <T,>(a: T[] | undefined, b: T[] | undefined, key: (x: T) => string): T[] => {
    const out = [...(a ?? [])];
    const seen = new Set(out.map(key));
    for (const x of b ?? []) if (!seen.has(key(x))) { out.push(x); seen.add(key(x)); }
    return out;
  };
  const refs: ProviderReference[] = [...(keep.references ?? [])];
  for (const r of incoming.references ?? []) {
    if (!r.name.trim() && !r.contact.trim()) continue;
    const dup = refs.some((x) => normHandle(x.contact || x.name) === normHandle(r.contact || r.name) && (r.contact || r.name));
    if (!dup && refs.length < MAX_REFERENCES) refs.push(r);
  }
  const checks: Record<string, boolean> = { ...(keep.checks ?? {}) };
  for (const [k, v] of Object.entries(incoming.checks ?? {})) checks[k] = !!(checks[k] || v);
  return {
    ...keep,
    name: pick("name", keep.name, incoming.name),
    phone: pick("phone", keep.phone, incoming.phone),
    email: pick("email", keep.email, incoming.email),
    handle: pick("handle", keep.handle, incoming.handle),
    verdict: pick("verdict", keep.verdict, incoming.verdict),
    notes: pick("notes", keep.notes, incoming.notes),
    source: keep.source?.trim() ? keep.source : incoming.source,
    verifiedStatus: keep.verifiedStatus ?? incoming.verifiedStatus,
    depositRequired: keep.depositRequired ?? incoming.depositRequired,
    servicePref: keep.servicePref || incoming.servicePref,
    regular: keep.regular || incoming.regular,
    rebook: keep.rebook && keep.rebook !== "unknown" ? keep.rebook : incoming.rebook,
    noShows: Math.max(keep.noShows ?? 0, incoming.noShows ?? 0),
    firstContactAt: Math.min(keep.firstContactAt ?? Infinity, incoming.firstContactAt ?? Infinity) === Infinity ? null : Math.min(keep.firstContactAt ?? Infinity, incoming.firstContactAt ?? Infinity),
    lastSeenAt: Math.max(keep.lastSeenAt ?? 0, incoming.lastSeenAt ?? 0) || null,
    aliases: union(keep.aliases, incoming.aliases, (s) => s.toLowerCase()),
    extraChannels: union(keep.extraChannels, incoming.extraChannels, (ch) => `${ch.kind}:${ch.value.toLowerCase()}`),
    tags: union(keep.tags, incoming.tags, (s) => s.toLowerCase()),
    incidents: union(keep.incidents, incoming.incidents, (i) => i.id),
    commsLog: union(keep.commsLog, incoming.commsLog, (i) => i.id),
    references: refs,
    checks,
    screenDetails: { ...(incoming.screenDetails ?? {}), ...(keep.screenDetails ?? {}) },
    preferences: keep.preferences?.trim() ? keep.preferences : incoming.preferences,
    boundaries: keep.boundaries?.trim() ? keep.boundaries : incoming.boundaries,
    shareNotes: keep.shareNotes || incoming.shareNotes,
    shareRatings: keep.shareRatings || incoming.shareRatings,
    shareHistory: keep.shareHistory || incoming.shareHistory,
    updatedAt: Date.now(),
  };
}

// ---- C&C contract: the dossier summary ---------------------------------------------

export interface DossierSummary {
  clientId: number;
  name: string;
  isNew: boolean;
  verifiedStatus: VerifiedStatus | null;
  depositRequired: boolean | null;
  servicePref: ServicePref;
  regular: boolean;
  verdict: ClientRow["verdict"];
  primaryContact: string; // first channel, for display
  references: {
    total: number;
    confirmed: number;
    sentiments: RefSentiment[];
    summary: string; // "2 references · 1 confirmed · mostly positive"
  };
  rollups: DossierRollups;
  strengthPct: number;
  // Share-gated: populated ONLY when the matching toggle is on for this
  // client — the same rule statusping.ts enforces for the bundle text.
  shared: {
    notes: string | null;
    ratings: { ts: number; rating: number }[] | null;
    history: { totalDates: number; lastDateAt: number | null } | null;
  };
}

/** Pure summary builder (testable without IndexedDB). */
export function buildDossierSummary(client: ClientRow, bookings: BookingRow[]): DossierSummary {
  const rollups = computeRollups(client, bookings);
  const refs = (client.references ?? []).filter((r) => r.name.trim() || r.contact.trim());
  const confirmed = refs.filter((r) => r.confirmed).length;
  const sentiments = refs.map((r) => r.sentiment);
  const mood = sentiments.length
    ? sentiments.every((s) => s === "positive") ? "all positive"
      : sentiments.some((s) => s === "negative") ? "includes a negative"
      : sentiments.some((s) => s === "positive") ? "mostly positive" : "neutral so far"
    : "";
  return {
    clientId: client.id ?? 0,
    name: client.name,
    isNew: rollups.totalDates === 0,
    verifiedStatus: client.verifiedStatus ?? null,
    depositRequired: client.depositRequired ?? null,
    servicePref: client.servicePref ?? "",
    regular: !!client.regular,
    verdict: client.verdict,
    primaryContact: contactChannelsOf(client)[0]?.value ?? "",
    references: {
      total: refs.length,
      confirmed,
      sentiments,
      summary: refs.length ? `${refs.length} reference${refs.length === 1 ? "" : "s"} · ${confirmed} confirmed${mood ? ` · ${mood}` : ""}` : "No references recorded",
    },
    rollups,
    strengthPct: dossierStrength(client, rollups).pct,
    shared: {
      notes: client.shareNotes ? (client.notes || null) : null,
      ratings: client.shareRatings ? rollups.ratings : null,
      history: client.shareHistory ? { totalDates: rollups.totalDates, lastDateAt: rollups.lastDateAt } : null,
    },
  };
}

/** Async wrapper for screens (Command & Control consumes this). */
export async function getDossierSummary(clientId: number): Promise<DossierSummary | null> {
  const client = await db.clients.get(clientId).catch(() => undefined);
  if (!client) return null;
  const bookings = await db.bookings.where("clientId").equals(clientId).toArray().catch(() => [] as BookingRow[]);
  return buildDossierSummary(client, bookings);
}

/** Stable deep link to a client's full dossier. */
export function dossierRoute(clientId: number | "new"): string {
  return clientId === "new" ? "#/dossier/new" : `#/dossier/${clientId}`;
}
