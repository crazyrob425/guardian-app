import { describe, it, expect } from "vitest";
import {
  validateDossier, dossierStrength, computeRollups, findDuplicates, mergeClients,
  buildDossierSummary, contactChannelsOf,
} from "../dossier";
import { extractFacts, applyFacts, parseVCard, extractFromImport } from "../extract";
import type { BookingRow, ClientRow } from "../db";

const baseClient = (patch: Partial<ClientRow> = {}): ClientRow => ({
  name: "", phone: "", phoneE164: "", email: "", handle: "",
  verdict: "unknown", flags: [], checks: {}, notes: "",
  createdAt: 1, updatedAt: 1, lastSeenAt: null,
  ...patch,
});
const booking = (patch: Partial<BookingRow>): BookingRow => ({
  ts: 0, alias: "x", durationMin: 60, location: "", deposit: 0, status: "done", note: "", ...patch,
});

describe("validateDossier — only name + one contact are required", () => {
  it("rejects an empty dossier with exactly the two required-fact errors", () => {
    const v = validateDossier(baseClient());
    expect(v.ok).toBe(false);
    expect(v.errors).toHaveLength(2);
  });
  it("rejects a name with no way to reach him", () => {
    expect(validateDossier(baseClient({ name: "Marcus" })).ok).toBe(false);
  });
  it("accepts name + phone, everything else empty", () => {
    expect(validateDossier(baseClient({ name: "Marcus", phone: "206-555-0147" })).ok).toBe(true);
  });
  it("accepts name + a single extra channel (no primary fields at all)", () => {
    const v = validateDossier(baseClient({
      name: "Marcus",
      extraChannels: [{ id: "c1", kind: "other", label: "Signal", value: "marcus.42" }],
    }));
    expect(v.ok).toBe(true);
  });
  it("accepts name + handle only", () => {
    expect(validateDossier(baseClient({ name: "M", handle: "marcust" })).ok).toBe(true);
  });
});

describe("contactChannelsOf", () => {
  it("normalizes primaries + extras in order", () => {
    const chs = contactChannelsOf(baseClient({
      phone: " 206-555-0147 ", email: "a@b.com",
      extraChannels: [{ id: "x", kind: "handle", label: "P411", value: "mt-99" }],
    }));
    expect(chs.map((c) => c.value)).toEqual(["206-555-0147", "a@b.com", "mt-99"]);
  });
});

describe("dossierStrength", () => {
  it("is low for a bare name + number and climbs as facts land", () => {
    const bare = dossierStrength(baseClient({ name: "M", phone: "206-555-0147" }));
    expect(bare.pct).toBeLessThan(25);
    const rich = dossierStrength(baseClient({
      name: "Marcus", phone: "206-555-0147", email: "m@example.com", source: "Tryst",
      verifiedStatus: "yes", depositRequired: true, servicePref: "outcall",
      references: [{ name: "Dana", contact: "425-555-0199", sentiment: "positive", confirmed: true }],
      screenDetails: { occupation: "Pilot" }, checks: { name: true }, preferences: "x",
      boundaries: "y", notes: "z", tags: ["generous"], firstContactAt: 123,
    }), { totalDates: 2 } as never);
    expect(rich.pct).toBeGreaterThan(80);
  });
});

describe("computeRollups — computed, never hand-entered", () => {
  const client = baseClient({ id: 7, name: "Marcus" });
  const bookings = [
    booking({ id: 1, ts: 1000, clientId: 7, deposit: 50, rating: 5 }),
    booking({ id: 2, ts: 2000, clientId: 7, deposit: 50, rating: 3 }),
    booking({ id: 3, ts: 3000, clientId: 7, deposit: 0 }),
    booking({ id: 4, ts: 4000, clientId: 7, deposit: 75, status: "noshow" }),
    booking({ id: 5, ts: 5000, clientId: 7, deposit: 25, status: "cancelled" }),
    booking({ id: 6, ts: 6000, clientId: 7, deposit: 100, status: "booked" }),
    booking({ id: 7, ts: 7000, clientId: 99, deposit: 999, rating: 1 }),
  ];
  it("counts dates, no-shows, deposits and ratings from bookings only", () => {
    const r = computeRollups(client, bookings);
    expect(r.totalDates).toBe(3);
    expect(r.noShows).toBe(1);
    expect(r.depositsTaken).toBe(175); // done 50+50+0 + noshow 75
    expect(r.depositsOnCancelled).toBe(25);
    expect(r.depositsUpcoming).toBe(100);
    expect(r.ratings.map((x) => x.rating)).toEqual([5, 3]);
    expect(r.averageRating).toBe(4);
    expect(r.firstDateAt).toBe(1000);
    expect(r.lastDateAt).toBe(3000);
  });
  it("falls back to the legacy no-show counter when no bookings are linked", () => {
    const r = computeRollups(baseClient({ id: 8, noShows: 2 }), []);
    expect(r.noShows).toBe(2);
    expect(r.totalDates).toBe(0);
  });
});

describe("findDuplicates — phone/email/handle matching", () => {
  const existing = [
    baseClient({ id: 1, name: "Marcus", phone: "+1 206-555-0147", email: "marcus@example.com", handle: "marcus_t" }),
    baseClient({ id: 2, name: "Other", phone: "425-555-0100" }),
  ];
  it("matches a differently formatted phone number", () => {
    const m = findDuplicates(baseClient({ phone: "(206) 555-0147" }), existing);
    expect(m).toHaveLength(1);
    expect(m[0].client.id).toBe(1);
    expect(m[0].matchedOn[0].kind).toBe("phone");
  });
  it("matches email case-insensitively and handles with/without @", () => {
    expect(findDuplicates(baseClient({ email: "MARCUS@Example.com" }), existing)).toHaveLength(1);
    expect(findDuplicates(baseClient({ handle: "@Marcus_T" }), existing)).toHaveLength(1);
  });
  it("matches through extra channels too", () => {
    const m = findDuplicates(baseClient({ extraChannels: [{ id: "c", kind: "phone", label: "2nd", value: "425 555 0100" }] }), existing);
    expect(m[0].client.id).toBe(2);
  });
  it("no shared key = no match, and never matches itself", () => {
    expect(findDuplicates(baseClient({ phone: "999-555-0000" }), existing)).toHaveLength(0);
    expect(findDuplicates(baseClient({ id: 1, phone: "+1 206-555-0147" }), existing)).toHaveLength(0);
  });
});

describe("mergeClients", () => {
  it("unions lists, fills references, and honors scalar picks", () => {
    const keep = baseClient({ id: 1, name: "Marcus", phone: "111", tags: ["a"], notes: "keep notes" });
    const incoming = baseClient({
      name: "Marcus T", phone: "222", tags: ["b"],
      extraChannels: [{ id: "c1", kind: "handle", label: "P411", value: "mt" }],
      references: [{ name: "Dana", contact: "425-555-0199", sentiment: "positive", confirmed: true }],
    });
    const merged = mergeClients(keep, incoming, { phone: "incoming" });
    expect(merged.id).toBe(1);
    expect(merged.name).toBe("Marcus"); // keep wins by default
    expect(merged.phone).toBe("222"); // picked incoming
    expect(merged.tags).toEqual(["a", "b"]);
    expect(merged.extraChannels).toHaveLength(1);
    expect(merged.references?.[0].name).toBe("Dana");
    expect(merged.notes).toBe("keep notes");
  });
});

// ---- extraction -----------------------------------------------------------------

const THREAD = [
  "Hey, this is Marcus. Found you on Tryst — my number is 206-555-0147 and my email is marcus.j@example.com",
  "Looking for an outcall Friday if you're free. Does 11/14 at 8pm work?",
  "Your deposit is fine, I sent the $100 deposit through Venmo already",
  "My reference is Dana, text her at 425-555-0199 — she'll say great things about me",
  "Also I sent my ID for verification yesterday so we're good there",
].join("\n");

describe("extractFacts — from a pasted conversation", () => {
  const facts = extractFacts(THREAD);
  const byKind = (k: string) => facts.filter((f) => f.kind === k);

  it("finds the phone and email, pre-checked (regex-exact)", () => {
    const phone = byKind("phone").find((f) => f.value.includes("2065550147") || f.value.includes("206-555-0147") || f.value.includes("206"));
    expect(phone).toBeTruthy();
    expect(phone!.preChecked).toBe(true);
    const email = byKind("email")[0];
    expect(email?.value).toBe("marcus.j@example.com");
    expect(email.preChecked).toBe(true);
  });
  it("proposes the self-stated name UNCHECKED (inferred, never auto-saved)", () => {
    const name = byKind("name")[0];
    expect(name?.value).toBe("Marcus");
    expect(name.preChecked).toBe(false);
  });
  it("catches the deposit mention with its amount", () => {
    const dep = byKind("deposit")[0];
    expect(dep?.deposit?.amount).toBe(100);
    expect(dep?.deposit?.required).toBe(true);
    expect(dep.preChecked).toBe(false);
  });
  it("catches the provider reference with name + number + sentiment", () => {
    const ref = byKind("reference")[0];
    expect(ref?.reference?.name).toBe("Dana");
    expect(ref?.reference?.contact).toContain("0199");
    expect(ref?.reference?.sentiment).toBe("positive");
    expect(ref?.reference?.confirmed).toBe(false); // she confirms it herself, always
  });
  it("catches verification and outcall mentions, and the absolute date/time", () => {
    expect(byKind("verification")).toHaveLength(1);
    expect(byKind("location")[0]?.value).toBe("outcall");
    const dt = byKind("datetime").find((f) => f.ts);
    expect(dt).toBeTruthy();
    expect(new Date(dt!.ts!).getMonth()).toBe(10); // November (11/14)
    expect(new Date(dt!.ts!).getDate()).toBe(14);
  });
  it("every fact carries a source snippet", () => {
    for (const f of facts) expect(f.snippet.length).toBeGreaterThan(0);
  });
  it("empty text yields no facts", () => {
    expect(extractFacts("   ")).toEqual([]);
  });
});

describe("applyFacts — only confirmed facts land, raw text only on request", () => {
  const facts = extractFacts(THREAD);
  const confirmed = facts.filter((f) => ["phone", "email", "name", "deposit", "reference", "verification", "location"].includes(f.kind));
  it("fills the draft from confirmed facts", () => {
    const out = applyFacts(baseClient(), confirmed);
    expect(out.phone).toContain("206");
    expect(out.email).toBe("marcus.j@example.com");
    expect(out.name).toBe("Marcus");
    expect(out.depositRequired).toBe(true);
    expect(out.verifiedStatus).toBe("in-progress"); // never "yes" from inference
    expect(out.servicePref).toBe("outcall");
    expect(out.references?.some((r) => r.name === "Dana")).toBe(true);
    expect(out.notes).toContain("$100 deposit");
    expect(validateDossier(out).ok).toBe(true);
  });
  it("does NOT keep the conversation unless explicitly told to", () => {
    const out = applyFacts(baseClient(), confirmed, { rawText: THREAD });
    expect(out.commsLog ?? []).toHaveLength(0);
    const saved = applyFacts(baseClient(), confirmed, { rawText: THREAD, saveRawText: true });
    expect(saved.commsLog).toHaveLength(1);
    expect(saved.commsLog?.[0].text).toBe(THREAD);
  });
});

describe("parseVCard + JSON exports feed the same review flow", () => {
  it("parses a vCard into pre-checked identifiers", () => {
    const vcf = ["BEGIN:VCARD", "VERSION:3.0", "FN:Marcus T", "TEL;TYPE=CELL:+1 206-555-0147", "EMAIL:marcus.j@example.com", "END:VCARD"].join("\n");
    const facts = parseVCard(vcf);
    expect(facts.find((f) => f.kind === "name")?.value).toBe("Marcus T");
    expect(facts.find((f) => f.kind === "phone")?.preChecked).toBe(true);
    expect(facts.find((f) => f.kind === "email")?.value).toBe("marcus.j@example.com");
  });
  it("flattens a JSON message export and extracts from it", () => {
    const json = JSON.stringify({ messages: [{ sender: "Marcus", text: "hi, this is Marcus — reach me at 206-555-0147" }, { sender: "me", text: "ok!" }] });
    const facts = extractFromImport("export.json", json);
    expect(facts.some((f) => f.kind === "phone")).toBe(true);
  });
});

describe("buildDossierSummary — the C&C contract", () => {
  const client = baseClient({
    id: 7, name: "Marcus", verifiedStatus: "yes", depositRequired: true, servicePref: "outcall",
    notes: "private notes", shareNotes: false, shareRatings: true, shareHistory: false,
    references: [
      { name: "Dana", contact: "425-555-0199", sentiment: "positive", confirmed: true },
      { name: "Rae", contact: "", sentiment: "neutral", confirmed: false },
      { name: "", contact: "", sentiment: "neutral", confirmed: false },
    ],
  });
  const bookings = [booking({ id: 1, ts: 1000, clientId: 7, rating: 5 }), booking({ id: 2, ts: 2000, clientId: 7 })];
  it("summarizes references and rollups", () => {
    const s = buildDossierSummary(client, bookings);
    expect(s.references.total).toBe(2);
    expect(s.references.confirmed).toBe(1);
    expect(s.references.summary).toContain("2 references · 1 confirmed");
    expect(s.rollups.totalDates).toBe(2);
    expect(s.isNew).toBe(false);
  });
  it("withholds share-gated fields whose toggles are OFF, includes the ones ON", () => {
    const s = buildDossierSummary(client, bookings);
    expect(s.shared.notes).toBeNull(); // shareNotes off
    expect(s.shared.history).toBeNull(); // shareHistory off
    expect(s.shared.ratings).toHaveLength(1); // shareRatings on
    const open = buildDossierSummary({ ...client, shareNotes: true, shareHistory: true }, bookings);
    expect(open.shared.notes).toBe("private notes");
    expect(open.shared.history?.totalDates).toBe(2);
  });
});
