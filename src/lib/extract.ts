// Conversation extraction (2026-11-05) — the "intelligence" half of the
// client dossier. A pasted/imported message thread is parsed ENTIRELY on
// this device (regex + heuristics, no network, no AI service) into
// candidate facts. Each candidate carries its source snippet and a
// confidence score; regex-exact identifiers (phone, email) arrive
// pre-checked, everything inferred arrives UNCHECKED. Nothing is written
// to a dossier until the user confirms it on the extraction-review
// screen — that rule is structural: this module only proposes.
//
// The same review flow also fronts the older screenshot OCR path and
// vCard / Contact Picker imports, so every road into the dossier gets
// the same human confirmation gate.

import type { ClientRow } from "./db";
import { emptyReference, uid, type ProviderReference } from "./dossier";
import { extractIdentifiers, phoneIntel, emailIntel } from "./screening";

export type FactKind =
  | "phone" | "email" | "handle" | "url" | "name" | "alias"
  | "datetime" | "location" | "deposit" | "reference" | "verification";

export interface CandidateFact {
  id: string;
  kind: FactKind;
  label: string; // "Phone number", "Reference — Dana", ...
  value: string; // display / primary value
  snippet: string; // the source text this came from (trimmed line)
  confidence: number; // 0..1
  preChecked: boolean;
  // structured payloads for the richer kinds
  deposit?: { amount: number | null; required: boolean };
  reference?: ProviderReference;
  ts?: number; // datetime kind: parsed absolute time, when one exists
}

const snippetOf = (text: string, idx: number, len: number): string => {
  const start = text.lastIndexOf("\n", Math.max(0, idx - 1)) + 1;
  let end = text.indexOf("\n", idx + len);
  if (end === -1) end = text.length;
  const line = text.slice(start, end).trim();
  return line.length > 110 ? line.slice(0, 107) + "…" : line;
};

const push = (arr: CandidateFact[], seen: Set<string>, f: Omit<CandidateFact, "id">) => {
  const key = `${f.kind}:${f.value.toLowerCase()}`;
  if (seen.has(key)) return;
  seen.add(key);
  arr.push({ ...f, id: uid("f") });
};

const MONEY = /\$\s?(\d{1,5}(?:,\d{3})*(?:\.\d{2})?)/g;
const SERVICE_WORDS = /\b(incall|outcall)\b/i;

/** Parse a conversation (paste, .txt, or flattened .json export) into candidate facts. */
export function extractFacts(text: string): CandidateFact[] {
  const facts: CandidateFact[] = [];
  const seen = new Set<string>();
  if (!text?.trim()) return facts;

  // --- high-precision identifiers (pre-checked) ---------------------------
  const ids = extractIdentifiers(text);
  for (const p of ids.phones) {
    const intel = phoneIntel(p);
    if (!intel.valid && !intel.e164) continue;
    push(facts, seen, {
      kind: "phone", label: "Phone number", value: intel.e164 || p,
      snippet: snippetOf(text, text.indexOf(p), p.length),
      confidence: 0.95, preChecked: true,
    });
  }
  for (const e of ids.emails) {
    if (!emailIntel(e).valid) continue;
    push(facts, seen, {
      kind: "email", label: "Email", value: e,
      snippet: snippetOf(text, text.indexOf(e), e.length),
      confidence: 0.95, preChecked: true,
    });
  }

  // --- URLs / social links (exact match, but placement is her call) -------
  for (const m of text.matchAll(/https?:\/\/[^\s<>"')]+/gi)) {
    const url = m[0].replace(/[.,;!?]+$/, "");
    push(facts, seen, {
      kind: "url", label: "Link / social profile", value: url,
      snippet: snippetOf(text, m.index ?? 0, m[0].length),
      confidence: 0.85, preChecked: false,
    });
  }

  // --- handles --------------------------------------------------------------
  for (const m of text.matchAll(/(?:^|\s)@([A-Za-z0-9_.-]{3,30})\b/g)) {
    push(facts, seen, {
      kind: "handle", label: "Handle", value: `@${m[1]}`,
      snippet: snippetOf(text, m.index ?? 0, m[0].length),
      confidence: 0.6, preChecked: false,
    });
  }
  for (const m of text.matchAll(/\bmy\s+(p411|onlyfans|twitter|x|instagram|insta|tryst|eros|skipthegames|stg|telegram|snapchat|whatsapp)\s+(?:is|:)\s*@?([A-Za-z0-9_.-]{3,30})/gi)) {
    push(facts, seen, {
      kind: "handle", label: `Handle (${m[1]})`, value: m[2],
      snippet: snippetOf(text, m.index ?? 0, m[0].length),
      confidence: 0.7, preChecked: false,
    });
  }

  // --- self-stated name -------------------------------------------------------
  for (const m of text.matchAll(/\b(?:my name is|this is|i'?m|i am)\s+([A-Z][a-z]{2,20}(?:\s[A-Z][a-z]{2,20})?)/g)) {
    const name = m[1].trim();
    if (/^(not|so|just|here|new|back|free|available|looking|interested)$/i.test(name)) continue;
    push(facts, seen, {
      kind: "name", label: "Self-stated name", value: name,
      snippet: snippetOf(text, m.index ?? 0, m[0].length),
      confidence: 0.55, preChecked: false,
    });
  }

  // --- dates / times ------------------------------------------------------------
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/gi)) {
    const [, mo, da, yr, hh, mm, ap] = m;
    const year = yr ? (yr.length === 2 ? 2000 + +yr : +yr) : new Date().getFullYear();
    let hour = +hh;
    if (ap) { if (/pm/i.test(ap) && hour < 12) hour += 12; if (/am/i.test(ap) && hour === 12) hour = 0; }
    const d = new Date(year, +mo - 1, +da, hour, +(mm ?? 0));
    if (isNaN(d.getTime())) continue;
    push(facts, seen, {
      kind: "datetime", label: "Date / time mentioned", value: d.toLocaleString(),
      snippet: snippetOf(text, m.index ?? 0, m[0].length),
      confidence: 0.5, preChecked: false, ts: d.getTime(),
    });
  }
  for (const m of text.matchAll(/\b(tonight|tomorrow(?:\s+(?:morning|afternoon|evening|night))?|next\s+(?:mon|tues|wednes|thurs|fri|satur|sun)day)\b[^.\n]{0,24}?\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi)) {
    push(facts, seen, {
      kind: "datetime", label: "Date / time mentioned", value: `${m[1]} at ${m[2]}${m[3] ? `:${m[3]}` : ""} ${m[4]}`,
      snippet: snippetOf(text, m.index ?? 0, m[0].length),
      confidence: 0.4, preChecked: false,
    });
  }

  // --- deposit / payment mentions ---------------------------------------------
  for (const m of text.matchAll(/[^.\n]*\bdeposit\b[^.\n]*/gi)) {
    const line = m[0];
    const amounts = Array.from(line.matchAll(MONEY)).map((x) => parseFloat(x[1].replace(/,/g, "")));
    push(facts, seen, {
      kind: "deposit",
      label: amounts.length ? `Deposit mentioned — $${amounts[0]}` : "Deposit mentioned",
      value: amounts.length ? `$${amounts[0]} deposit` : "deposit mentioned",
      snippet: snippetOf(text, m.index ?? 0, m[0].length),
      confidence: 0.65, preChecked: false,
      deposit: { amount: amounts[0] ?? null, required: true },
    });
  }
  for (const m of text.matchAll(/\b(?:venmo|cashapp|cash app|zelle|paypal|apple pay|btc|bitcoin)\b[^.\n]{0,30}?\$?\s?(\d{2,5})/gi)) {
    push(facts, seen, {
      kind: "deposit", label: "Payment app + amount mentioned", value: m[0].trim(),
      snippet: snippetOf(text, m.index ?? 0, m[0].length),
      confidence: 0.5, preChecked: false,
      deposit: { amount: parseFloat(m[1]) || null, required: false },
    });
  }

  // --- references -----------------------------------------------------------------
  for (const m of text.matchAll(/[^.\n]*\b(?:reference|ref)\b[^.\n]*/gi)) {
    const line = m[0];
    if (!/reference|ref\b/i.test(line)) continue;
    const phones = extractIdentifiers(line).phones;
    const nameM = /\b(?:reference|ref)(?:\s+is)?\s*(?:—|-|:)?\s*([A-Z][a-z]{2,20})/.exec(line)
      ?? /\b(?:ask|call|text)\s+([A-Z][a-z]{2,20})\b/.exec(line);
    const ref: ProviderReference = {
      ...emptyReference(),
      name: nameM?.[1] ?? "",
      contact: phones[0] ?? "",
      sentiment: /\b(great|good|positive|vouched|amazing|wonderful)\b/i.test(line) ? "positive"
        : /\b(bad|negative|avoid|careful|warning)\b/i.test(line) ? "negative" : "neutral",
      confirmed: false,
    };
    if (!ref.name && !ref.contact) continue;
    push(facts, seen, {
      kind: "reference", label: `Provider reference${ref.name ? ` — ${ref.name}` : ""}`,
      value: [ref.name, ref.contact].filter(Boolean).join(" · "),
      snippet: snippetOf(text, m.index ?? 0, m[0].length),
      confidence: ref.contact ? 0.7 : 0.5, preChecked: false, reference: ref,
    });
  }

  // --- verification -----------------------------------------------------------------
  for (const m of text.matchAll(/[^.\n]*\b(?:verified|verification|driver'?s licen[cs]e|sent (?:my |his )?(?:id|license)|id checked|screened)\b[^.\n]*/gi)) {
    push(facts, seen, {
      kind: "verification", label: "Verification mentioned",
      value: "verification in progress",
      snippet: snippetOf(text, m.index ?? 0, m[0].length),
      confidence: 0.5, preChecked: false,
    });
    break; // one verification candidate is enough
  }

  // --- incall / outcall ----------------------------------------------------------------
  const svc = SERVICE_WORDS.exec(text);
  if (svc) {
    push(facts, seen, {
      kind: "location", label: "Service style mentioned", value: svc[1].toLowerCase(),
      snippet: snippetOf(text, svc.index ?? 0, svc[0].length),
      confidence: 0.55, preChecked: false,
    });
  }

  return facts.sort((a, b) => b.confidence - a.confidence);
}

// ---- applying confirmed facts ------------------------------------------------------

/**
 * Fold the user-CONFIRMED facts into a dossier draft. Only facts the
 * review screen hands us (already filtered to the checked ones) land
 * here. Ambiguous facts append to the comms/notes trail rather than
 * overwriting anything she typed herself.
 */
export function applyFacts(draft: ClientRow, facts: CandidateFact[], opts: { rawText?: string; saveRawText?: boolean } = {}): ClientRow {
  const out: ClientRow = { ...draft, extraChannels: [...(draft.extraChannels ?? [])], references: [...(draft.references ?? [])] };
  const channels = out.extraChannels as NonNullable<ClientRow["extraChannels"]>;
  const addChannel = (kind: "phone" | "email" | "handle" | "other", label: string, value: string) => {
    const exists = [out.phone, out.email, out.handle, ...channels.map((c) => c.value)]
      .some((v) => v?.trim().toLowerCase() === value.trim().toLowerCase());
    if (!exists) channels.push({ id: uid("ch"), kind, label, value });
  };
  const noteLines: string[] = [];

  for (const f of facts) {
    switch (f.kind) {
      case "phone":
        if (!out.phone.trim()) out.phone = f.value; else addChannel("phone", "Phone (imported)", f.value);
        break;
      case "email":
        if (!out.email.trim()) out.email = f.value; else addChannel("email", "Email (imported)", f.value);
        break;
      case "handle":
        if (!out.handle.trim() && !f.label.includes("(")) out.handle = f.value.replace(/^@/, "");
        else addChannel("handle", f.label.replace("Handle", "").replace(/[()]/g, "").trim() || "Handle (imported)", f.value);
        break;
      case "url": {
        const cur = out.screenDetails ?? {};
        out.screenDetails = { ...cur, socials: [cur.socials, f.value].filter(Boolean).join("\n") };
        break;
      }
      case "name":
        if (!out.name.trim()) out.name = f.value;
        else if (!(out.aliases ?? []).includes(f.value) && out.name !== f.value) out.aliases = [...(out.aliases ?? []), f.value];
        break;
      case "alias":
        if (!(out.aliases ?? []).includes(f.value)) out.aliases = [...(out.aliases ?? []), f.value];
        break;
      case "datetime":
        if (f.ts && !out.firstContactAt) out.firstContactAt = f.ts;
        else noteLines.push(`Date/time mentioned in messages: ${f.value}`);
        break;
      case "location":
        if (!out.servicePref && (f.value === "incall" || f.value === "outcall")) out.servicePref = f.value;
        break;
      case "deposit":
        if (f.deposit?.required) out.depositRequired = true;
        noteLines.push(`From imported messages: ${f.value} — “${f.snippet}”`);
        break;
      case "reference": {
        if (!f.reference) break;
        const slots = [...(out.references ?? [])];
        while (slots.length < 3) slots.push(emptyReference());
        const empty = slots.findIndex((r) => !r.name.trim() && !r.contact.trim());
        if (empty >= 0) slots[empty] = f.reference;
        noteLines.push(`Reference mentioned in messages: ${f.value}`);
        out.references = slots.slice(0, 3);
        break;
      }
      case "verification":
        if (!out.verifiedStatus) out.verifiedStatus = "in-progress";
        break;
    }
  }
  if (noteLines.length) {
    out.notes = [out.notes?.trim(), ...noteLines].filter(Boolean).join("\n");
  }
  if (opts.saveRawText && opts.rawText?.trim()) {
    out.commsLog = [...(out.commsLog ?? []), { id: uid("cm"), ts: Date.now(), channel: "imported conversation", text: opts.rawText.trim() }];
  }
  out.updatedAt = Date.now();
  return out;
}

// ---- other import formats -------------------------------------------------------------

/** Parse a vCard (.vcf) into candidate facts (structured data: identifiers pre-checked). */
export function parseVCard(text: string): CandidateFact[] {
  const facts: CandidateFact[] = [];
  const seen = new Set<string>();
  const get = (key: string) => {
    const m = new RegExp(`^${key}(?:;[^:\\n]*)?:\\s*(.+)$`, "mi").exec(text);
    return m?.[1]?.trim() ?? "";
  };
  const fn = get("FN");
  if (fn) push(facts, seen, { kind: "name", label: "Name (contact card)", value: fn, snippet: `FN:${fn}`, confidence: 0.9, preChecked: true });
  for (const m of text.matchAll(/^TEL(?:;[^:\n]*)?:\s*(.+)$/gim)) {
    push(facts, seen, { kind: "phone", label: "Phone number", value: m[1].trim(), snippet: m[0].slice(0, 110), confidence: 0.95, preChecked: true });
  }
  for (const m of text.matchAll(/^EMAIL(?:;[^:\n]*)?:\s*(.+)$/gim)) {
    push(facts, seen, { kind: "email", label: "Email", value: m[1].trim(), snippet: m[0].slice(0, 110), confidence: 0.95, preChecked: true });
  }
  const url = get("URL");
  if (url) push(facts, seen, { kind: "url", label: "Link / social profile", value: url, snippet: `URL:${url}`, confidence: 0.85, preChecked: false });
  const note = get("NOTE");
  if (note) facts.push(...extractFacts(note));
  return facts;
}

/**
 * Flatten an imported file (.txt / .json export / .vcf) to parseable
 * text + facts. JSON exports vary by platform; the common shapes
 * ({messages:[{text|content|body}]}, arrays of same, or chat objects)
 * are flattened to one message per line so the same extractor applies.
 */
export function extractFromImport(filename: string, content: string): CandidateFact[] {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".vcf") || content.includes("BEGIN:VCARD")) return parseVCard(content);
  if (lower.endsWith(".json") || content.trim().startsWith("{") || content.trim().startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(content);
      const lines: string[] = [];
      const walk = (v: unknown, depth: number) => {
        if (depth > 6 || v == null) return;
        if (typeof v === "string") { lines.push(v); return; }
        if (Array.isArray(v)) { v.forEach((x) => walk(x, depth + 1)); return; }
        if (typeof v === "object") {
          const o = v as Record<string, unknown>;
          const msg = o.text ?? o.content ?? o.body ?? o.message;
          if (typeof msg === "string") {
            const sender = typeof o.sender === "string" ? o.sender : typeof o.from === "string" ? o.from : typeof o.author === "string" ? o.author : "";
            lines.push(sender ? `${sender}: ${msg}` : msg);
            return;
          }
          Object.values(o).forEach((x) => walk(x, depth + 1));
        }
      };
      walk(parsed, 0);
      return extractFacts(lines.join("\n"));
    } catch {
      return extractFacts(content);
    }
  }
  return extractFacts(content);
}
