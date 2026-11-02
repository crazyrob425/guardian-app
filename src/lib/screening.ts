// Screening pack (Phase 2). Everything in this file runs ON-DEVICE: a phone
// number or email pasted here is never sent anywhere. The hints produced are
// signals for her judgment — never verdicts — and the UI words them that way.

import { parsePhoneNumberFromString } from "libphonenumber-js";
import { DISPOSABLE_DOMAINS } from "./disposableDomains";

export interface PhoneIntel {
  input: string;
  valid: boolean;
  e164: string;
  country: string;
  typeLabel: string; // "mobile" | "landline" | "VoIP" | "unknown" | ...
  isVoip: boolean;
  flags: string[];
}

/** Analyze a phone number locally (libphonenumber-js). */
export function phoneIntel(input: string, defaultCountry: string = "US"): PhoneIntel {
  const flags: string[] = [];
  try {
    const p = parsePhoneNumberFromString(input, defaultCountry as never);
    if (!p) return { input, valid: false, e164: "", country: "", typeLabel: "unrecognized", isVoip: false, flags: ["Number not recognized — double-check it"] };
    const t = p.getType();
    const typeLabel =
      t === "MOBILE" ? "mobile" :
      t === "FIXED_LINE" ? "landline" :
      t === "FIXED_LINE_OR_MOBILE" ? "mobile or landline" :
      t === "VOIP" ? "VoIP" :
      t === "TOLL_FREE" ? "toll-free" :
      t === "PREMIUM_RATE" ? "premium-rate" :
      t === "PERSONAL_NUMBER" ? "personal number" : "unknown type";
    const isVoip = t === "VOIP";
    if (isVoip) flags.push("VoIP number — commonly used by burner/app-based phones (a hint, not proof)");
    if (t === "TOLL_FREE") flags.push("Toll-free number — unusual for a personal phone");
    if (!p.isValid()) flags.push("Number format looks invalid for its country");
    return {
      input,
      valid: p.isValid(),
      e164: p.isValid() || p.number ? p.format("E.164") : "",
      country: p.country ?? "",
      typeLabel,
      isVoip,
      flags,
    };
  } catch {
    return { input, valid: false, e164: "", country: "", typeLabel: "unrecognized", isVoip: false, flags: ["Number not recognized — double-check it"] };
  }
}

export interface EmailIntel {
  input: string;
  valid: boolean;
  disposable: boolean;
  flags: string[];
}

/** Analyze an email address locally (format + disposable-domain snapshot). */
export function emailIntel(input: string): EmailIntel {
  const flags: string[] = [];
  const m = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/.exec(input.trim());
  if (!m) return { input, valid: false, disposable: false, flags: input ? ["Email format looks off"] : [] };
  const domain = m[1].toLowerCase();
  const disposable = DISPOSABLE_DOMAINS.has(domain);
  if (disposable) flags.push("Disposable/temporary email domain — a hint to screen more carefully, not proof");
  return { input, valid: true, disposable, flags };
}

/** The standard pre-date screening checklist (community practice). */
export const SCREENING_CHECKS: { id: string; label: string }[] = [
  { id: "name", label: "Real name received" },
  { id: "number", label: "Number checked (not obviously a burner)" },
  { id: "refs", label: "References / history checked" },
  { id: "deposit", label: "Deposit received" },
  { id: "shared", label: "Date details shared with my circle" },
  { id: "session", label: "Guardian session started before the date" },
];

/** Pull likely identifiers out of OCR'd screenshot text. */
export function extractIdentifiers(text: string): { phones: string[]; emails: string[] } {
  const emails = Array.from(new Set(text.match(/[^\s@]+@[^\s@]+\.[^\s@]+/g) ?? []));
  const phones = Array.from(
    new Set(
      (text.match(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g) ?? []).map((s) => s.trim())
    )
  );
  return { phones, emails };
}
