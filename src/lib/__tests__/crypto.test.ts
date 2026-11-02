import { describe, it, expect } from "vitest";
import { genKey, exportKey, importKey, encrypt, decrypt, randomId } from "../crypto";

describe("session key link round-trip", () => {
  it("exports a 43-char base64url key that re-imports and decrypts", async () => {
    const key = await genKey();
    const b64 = await exportKey(key);
    expect(b64.length).toBe(43); // 32 bytes → 43 base64url chars, no padding
    expect(/^[A-Za-z0-9_-]+$/.test(b64)).toBe(true);
    const re = await importKey(b64);
    const ct = await encrypt(key, { hello: "watcher" });
    const pt = await decrypt<{ hello: string }>(re, ct);
    expect(pt.hello).toBe("watcher");
  });
  it("session ids are 16-char base64url (12 bytes)", () => {
    expect(randomId(12).length).toBe(16);
  });
  it("rejects a truncated key (what a mistyped link would produce)", async () => {
    const b64 = await exportKey(await genKey());
    await expect(importKey(b64.slice(0, 34))).rejects.toThrow();
  });
});
