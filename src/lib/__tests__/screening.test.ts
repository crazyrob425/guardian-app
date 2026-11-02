import { describe, it, expect } from "vitest";
import { phoneIntel, emailIntel, extractIdentifiers } from "../screening";

describe("phoneIntel", () => {
  it("parses a US mobile number to E.164", () => {
    const r = phoneIntel("(206) 555-0147");
    expect(r.e164).toBe("+12065550147");
    expect(r.country).toBe("US");
  });
  it("flags garbage as unrecognized", () => {
    const r = phoneIntel("call me maybe");
    expect(r.valid).toBe(false);
    expect(r.flags.length).toBeGreaterThan(0);
  });
  it("recognizes a toll-free number", () => {
    const r = phoneIntel("+1 800 555 0199");
    expect(r.typeLabel).toBe("toll-free");
  });
});

describe("emailIntel", () => {
  it("flags a disposable domain from the bundled snapshot", () => {
    const r = emailIntel("someone@guerrillamail.com");
    expect(r.valid).toBe(true);
    expect(r.disposable).toBe(true);
    expect(r.flags.length).toBe(1);
  });
  it("passes a normal domain", () => {
    const r = emailIntel("person@gmail.com");
    expect(r.disposable).toBe(false);
  });
  it("rejects malformed email", () => {
    expect(emailIntel("not-an-email").valid).toBe(false);
  });
});

describe("extractIdentifiers", () => {
  it("pulls phones and emails from OCR-like text", () => {
    const r = extractIdentifiers("Hey its Mike, reach me at (206) 555-0147 or mike.d@examplemail.com — sent from my phone");
    expect(r.phones).toContain("(206) 555-0147");
    expect(r.emails).toContain("mike.d@examplemail.com");
  });
});
