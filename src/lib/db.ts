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
