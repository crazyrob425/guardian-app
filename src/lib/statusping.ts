// Phase 8 — the full-status ping bundle.
//
// When a circle member requests a full status update, Guardian answers
// with a bundle about the current date. Rob's rule is structural, not
// cosmetic: the dossier fields (notes, ratings, visit history) are only
// included when the user has toggled sharing ON for that client — the
// toggles live on the client record and default OFF. The builder is a
// pure function over facts, and it reports what it WITHHELD, so Command
// & Control can show "this is exactly what your circle would receive".

import { db, type BookingRow, type ClientRow } from "./db";
import { store, type ActiveSession } from "./store";
import { getEscalation } from "./escalation";
import { lastCheckInAt, sessionEvents } from "./events";
import { distanceM } from "./geo";

export interface StatusFacts {
  alias: string;
  busyStatus: string; // "On a date until 9:30 PM" / "Free"
  startedAt: number | null;
  endsAt: number | null;
  deposit: number | null; // booking's recorded deposit (C&C display; never in the bundle text)
  nextBookingToday: { alias: string; ts: number } | null;
  lastCheckInAt: number | null;
  locationText: string | null;
  locationMatches: boolean | null;
  clientName: string | null;
  clientIsNew: boolean | null;
  clientDatesDone: number | null;
  notes: string | null;
  ratings: { ts: number; rating: number }[];
  share: { notes: boolean; ratings: boolean; history: boolean };
  escalationLevel: number;
  escalationLabel: string;
  escalationReasons: string[];
  circleCommands: string[];
}

export interface StatusBundle {
  text: string;
  included: string[];
  withheld: string[];
}

const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const fmtWhen = (ts: number) =>
  `${new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" })} ${fmtTime(ts)}`;

/** Pure bundle builder — the share toggles are enforced HERE. */
export function buildStatusBundle(f: StatusFacts): StatusBundle {
  const lines: string[] = [];
  const included: string[] = [];
  const withheld: string[] = [];

  lines.push(`Guardian status — ${f.alias || "current date"}`);
  lines.push(`Status: ${f.busyStatus}`);
  included.push("busy status");
  if (f.startedAt) { lines.push(`Date started: ${fmtTime(f.startedAt)}`); }
  if (f.endsAt) { lines.push(`Scheduled end: ${fmtTime(f.endsAt)}`); included.push("date times"); }
  if (f.nextBookingToday) {
    lines.push(`Next booking today: ${fmtTime(f.nextBookingToday.ts)} (${f.nextBookingToday.alias})`);
    included.push("next booking today");
  }
  if (f.lastCheckInAt) {
    lines.push(`Last check-in: ${fmtWhen(f.lastCheckInAt)}`);
    included.push("last check-in");
  }
  if (f.locationText) {
    lines.push(`Location: ${f.locationText}${f.locationMatches == null ? "" : f.locationMatches ? " — matches the booked location" : " — does NOT match the booked location"}`);
    included.push("current location + match");
  }
  if (f.clientName) lines.push(`Client: ${f.clientName}`);

  if (f.share.history && f.clientDatesDone != null) {
    lines.push(`Client history: ${f.clientIsNew ? "NEW client (first date)" : `returning — ${f.clientDatesDone} completed date${f.clientDatesDone === 1 ? "" : "s"} before this one`}`);
    included.push("client new/returning + total dates");
  } else if (f.clientDatesDone != null) {
    withheld.push("client new/returning + total dates (sharing off for this client)");
  }

  if (f.share.notes && f.notes) {
    lines.push(`Her notes on this client: ${f.notes}`);
    included.push("dossier notes");
  } else {
    withheld.push("dossier notes (sharing off for this client)");
  }

  if (f.share.ratings && f.ratings.length) {
    lines.push(`Her ratings after past dates: ${f.ratings.map((r) => `${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)} (${fmtWhen(r.ts)})`).join(", ")}`);
    included.push("date ratings");
  } else {
    withheld.push("date ratings (sharing off for this client)");
  }

  lines.push(`Escalation: ${f.escalationLabel}${f.escalationReasons.length ? ` — ${f.escalationReasons.join("; ")}` : ""}`);
  included.push("escalation level");
  if (f.circleCommands.length) {
    lines.push(`Circle commands so far: ${f.circleCommands.slice(0, 6).join("; ")}`);
    included.push("circle-executed commands");
  }
  return { text: lines.join("\n"), included, withheld };
}

// ---- assembling facts from the real stores ---------------------------------

/** The booking a session fulfils: explicit link first, else the booking
 *  whose window contains the session start. */
export function matchBooking(session: ActiveSession, bookings: BookingRow[]): BookingRow | null {
  if (session.bookingId) {
    const b = bookings.find((x) => x.id === session.bookingId);
    if (b) return b;
  }
  const inWindow = bookings
    .filter((b) => b.status !== "cancelled" && session.startedAt >= b.ts - 30 * 60000 && session.startedAt <= b.ts + b.durationMin * 60000)
    .sort((a, b2) => Math.abs(a.ts - session.startedAt) - Math.abs(b2.ts - session.startedAt));
  return inWindow[0] ?? null;
}

export async function assembleStatusFacts(session: ActiveSession): Promise<{ facts: StatusFacts; client: ClientRow | null; booking: BookingRow | null }> {
  const settings = store.getSettings();
  const bookings = await db.bookings.orderBy("ts").toArray().catch(() => [] as BookingRow[]);
  const booking = matchBooking(session, bookings);

  let client: ClientRow | null = null;
  const clientId = session.clientId ?? booking?.clientId;
  if (clientId) client = (await db.clients.get(clientId).catch(() => undefined)) ?? null;

  const doneWithClient = client?.id
    ? bookings.filter((b) => b.clientId === client.id && b.status === "done" && b.id !== booking?.id)
    : [];
  const ratings = doneWithClient
    .filter((b) => typeof b.rating === "number")
    .sort((a, b) => a.ts - b.ts)
    .map((b) => ({ ts: b.ts, rating: b.rating as number }));

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const nextToday = bookings
    .filter((b) => b.status === "booked" && b.ts > Date.now() && b.ts <= endOfToday.getTime() && b.id !== booking?.id)
    .sort((a, b) => a.ts - b.ts)[0];

  // Location: freshest trail fix for this session vs the pinned date location.
  let locationText: string | null = booking?.location || null;
  let locationMatches: boolean | null = null;
  try {
    const trail = await db.trail.where("sessionId").equals(session.id).toArray();
    const last = trail.sort((a, b) => b.ts - a.ts)[0];
    if (last) {
      locationText = `${last.lat.toFixed(5)}, ${last.lng.toFixed(5)}${booking?.location ? ` (booked: ${booking.location})` : ""}`;
      if (session.incall) {
        locationMatches = distanceM({ lat: last.lat, lng: last.lng }, session.incall) <= settings.arrivalRadiusM;
      }
    }
  } catch { /* trail unavailable — booking text only */ }

  const esc = getEscalation(session.id);
  const circleEvents = await sessionEvents(session.id, ["circle"], 8).catch(() => []);
  const checkIn = await lastCheckInAt(session.id).catch(() => null);

  const facts: StatusFacts = {
    alias: session.alias,
    busyStatus: session.state === "panic" ? "EMERGENCY — panic active" : `On a date until ${fmtTime(session.startedAt + session.expectedMin * 60000)}`,
    startedAt: session.startedAt,
    endsAt: session.startedAt + session.expectedMin * 60000,
    deposit: booking ? booking.deposit : null,
    nextBookingToday: nextToday ? { alias: nextToday.alias, ts: nextToday.ts } : null,
    lastCheckInAt: checkIn ?? session.startedAt,
    locationText,
    locationMatches,
    clientName: client?.name || booking?.alias || session.alias || null,
    clientIsNew: client ? doneWithClient.length === 0 : null,
    clientDatesDone: client ? doneWithClient.length : null,
    notes: client?.notes || null,
    ratings,
    share: {
      notes: !!client?.shareNotes,
      ratings: !!client?.shareRatings,
      history: !!client?.shareHistory,
    },
    escalationLevel: esc.level,
    escalationLabel: esc.level === 3 ? "Level 3 — Emergency" : esc.lowSignal ? "Level 2 — Low Signal Mode" : esc.level === 2 ? "Level 2 — Heightened" : "Level 1 — Normal",
    escalationReasons: esc.conditions.map((c) => c.reason),
    circleCommands: circleEvents.map((e) => e.text),
  };
  return { facts, client, booking };
}
