// Guardian local database (Dexie/IndexedDB). Everything here lives ONLY on
// this device: the offline publish outbox (so an alert composed without a
// connection is never lost), the on-device session trail, and a diagnostics
// log used when a screen crashes. Nothing in this DB is ever uploaded.

import Dexie, { type Table } from "dexie";

export interface OutboxRow {
  id?: number;
  sessionId: string;
  topic: string; // full MQTT topic
  payload: string; // already-encrypted payload
  ts: number;
}

export interface TrailRow {
  id?: number;
  sessionId: string;
  ts: number;
  lat: number;
  lng: number;
  accuracyM: number;
}

export interface DiagRow {
  id?: number;
  ts: number;
  message: string;
  where: string;
}

export type ClientVerdict = "ok" | "caution" | "avoid" | "unknown";

export interface ClientRow {
  id?: number;
  name: string;
  phone: string; // as entered
  phoneE164: string; // canonical form for matching ("" when unparseable)
  email: string;
  handle: string; // site/app username they booked under
  verdict: ClientVerdict;
  flags: string[]; // screening hints: "VoIP number", "burner email", ...
  checks: Record<string, boolean>; // screening checklist state
  notes: string;
  createdAt: number;
  updatedAt: number;
  lastSeenAt: number | null;
  // Phase 5 regulars book (optional, non-indexed)
  regular?: boolean;
  rebook?: "unknown" | "yes" | "no"; // permission to re-contact
  followUps?: { thanks?: number; review?: number; recontact?: number };
  noShows?: number;
  // Phase 8 (Low Signal / C&C): per-field circle-share consent for status
  // pings. ALL default OFF — a field is only ever sent to the circle when
  // the user has explicitly toggled it on for this client.
  shareNotes?: boolean;
  shareRatings?: boolean;
  shareHistory?: boolean;
  // Dossier / contact manager (2026-11-05): every field below is OPTIONAL
  // and non-indexed — a dossier saves with just a name + one contact
  // channel. Types live in lib/dossier.ts; they are declared structurally
  // here to keep db.ts dependency-free.
  aliases?: string[];
  extraChannels?: { id: string; kind: "phone" | "email" | "handle" | "other"; label: string; value: string }[];
  source?: string; // platform / where they first made contact
  firstContactAt?: number | null;
  depositRequired?: boolean;
  servicePref?: "" | "incall" | "outcall" | "both";
  verifiedStatus?: "yes" | "no" | "in-progress";
  references?: { name: string; contact: string; sentiment: "positive" | "neutral" | "negative"; confirmed: boolean }[];
  screenDetails?: { age?: string; occupation?: string; vehicle?: string; socials?: string; idChecked?: boolean };
  preferences?: string;
  boundaries?: string;
  incidents?: { id: string; ts: number; severity: "note" | "caution" | "serious"; text: string }[];
  tags?: string[];
  commsLog?: { id: string; ts: number; channel: string; text: string }[];
}

export interface Outbox2Row {
  id?: number;
  sessionId: string;
  kind: string; // sync topic kind (pos/alert/state/presence/signal)
  payload: string; // already-encrypted payload
  retain: boolean;
  ts: number;
}

export interface LedgerRow {
  id?: number;
  ts: number;
  kind: "income" | "expense" | "mileage";
  amount: number; // money for income/expense; miles for mileage
  category: string;
  note: string;
}

export interface BookingRow {
  id?: number;
  ts: number; // start time
  alias: string;
  durationMin: number;
  location: string;
  deposit: number;
  status: "booked" | "done" | "noshow" | "cancelled";
  clientId?: number;
  note: string;
  rating?: number; // Phase 8: user's private 1–5 rating after this date
}

/** Phase 8: the on-device event/command log behind the news ticker and
 * the Command & Control screen. Device-local only, like everything here. */
export type EventKind = "status" | "command" | "circle" | "checkin" | "request";

export interface EventRow {
  id?: number;
  sessionId: string; // "" = app-wide (no active session)
  ts: number;
  kind: EventKind;
  text: string;
}

export interface VaultRow {
  id?: number;
  ts: number;
  name: string;
  kind: string; // mime type
  size: number;
  blob: Blob;
}

export interface PlaceRow {
  id?: number;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
}

class GuardianDB extends Dexie {
  outbox!: Table<OutboxRow, number>;
  trail!: Table<TrailRow, number>;
  diagnostics!: Table<DiagRow, number>;
  clients!: Table<ClientRow, number>;
  outbox2!: Table<Outbox2Row, number>;
  ledger!: Table<LedgerRow, number>;
  bookings!: Table<BookingRow, number>;
  vault!: Table<VaultRow, number>;
  places!: Table<PlaceRow, number>;
  events!: Table<EventRow, number>;

  constructor() {
    super("guardian-db");
    this.version(1).stores({
      outbox: "++id, sessionId, ts",
      trail: "++id, sessionId, ts",
      diagnostics: "++id, ts",
    });
    // v2 (Phase 2): the private client log — on-device only, never synced.
    this.version(2).stores({
      clients: "++id, phoneE164, name, updatedAt",
    });
    // v3 (Phase 3): offline outbox for the WebSocket transport.
    this.version(3).stores({
      outbox2: "++id, sessionId, ts",
    });
    // v4 (Phase 5): earnings ledger, booking board, evidence vault, safe places.
    this.version(4).stores({
      ledger: "++id, ts, kind",
      bookings: "++id, ts, status",
      vault: "++id, ts",
      places: "++id, name",
    });
    // v5 (Phase 8): event/command log for the ticker + Command & Control;
    // bookings gain a clientId index so the dossier can list date history.
    this.version(5).stores({
      events: "++id, sessionId, ts, kind",
      bookings: "++id, ts, status, clientId",
    });
  }
}

export const db = new GuardianDB();

export async function outboxCount(sessionId: string): Promise<number> {
  try {
    return await db.outbox.where("sessionId").equals(sessionId).count();
  } catch {
    return 0;
  }
}

export async function logDiagnostic(message: string, where: string): Promise<void> {
  try {
    await db.diagnostics.add({ ts: Date.now(), message: message.slice(0, 500), where });
    // keep the log small — last 50 entries
    const count = await db.diagnostics.count();
    if (count > 50) {
      const old = await db.diagnostics.orderBy("ts").limit(count - 50).primaryKeys();
      await db.diagnostics.bulkDelete(old);
    }
  } catch {
    /* diagnostics must never crash the app */
  }
}
