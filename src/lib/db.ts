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

class GuardianDB extends Dexie {
  outbox!: Table<OutboxRow, number>;
  trail!: Table<TrailRow, number>;
  diagnostics!: Table<DiagRow, number>;

  constructor() {
    super("guardian-db");
    this.version(1).stores({
      outbox: "++id, sessionId, ts",
      trail: "++id, sessionId, ts",
      diagnostics: "++id, ts",
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
