import { describe, it, expect } from "vitest";
import { cborDecode, derToRaw } from "../passkey";
import { hashPin, verifyPin, isArgon2idHash } from "../pin";
import { sha256Hex } from "../crypto";

describe("cborDecode", () => {
  it("decodes a map with int keys and byte-string values (COSE-like)", () => {
    // hand-built CBOR: {1: 2, -2: h'ABCD'}  => A2 01 02 22 42 ABCD
    const bytes = new Uint8Array([0xa2, 0x01, 0x02, 0x21, 0x42, 0xab, 0xcd]);
    const { value } = cborDecode(bytes);
    const m = value as Map<unknown, unknown>;
    expect(m.get(1)).toBe(2);
    expect(Array.from(m.get(-2) as Uint8Array)).toEqual([0xab, 0xcd]);
  });
  it("decodes text and arrays", () => {
    // ["webauthn.get", 42] => 82 6C 776562617574686E2E676574 18 2A
    const enc = new TextEncoder().encode("webauthn.get");
    const bytes = new Uint8Array([0x82, 0x60 + enc.length, ...enc, 0x18, 0x2a]);
    const { value } = cborDecode(bytes);
    expect(value).toEqual(["webauthn.get", 42]);
  });
});

describe("derToRaw", () => {
  it("converts a padded DER signature to raw r||s", () => {
    // DER: SEQ( INT(0x00||r[31..]) , INT(s) ) with r top bit set (padded)
    const r = new Uint8Array(32).fill(0x11); r[0] = 0x80;
    const s = new Uint8Array(32).fill(0x22);
    const der = new Uint8Array([0x30, 0x46, 0x02, 0x21, 0x00, ...r, 0x02, 0x20, ...s]);
    const raw = derToRaw(der);
    expect(raw.length).toBe(64);
    expect(Array.from(raw.slice(0, 32))).toEqual(Array.from(r));
    expect(Array.from(raw.slice(32))).toEqual(Array.from(s));
  });
});

describe("pin (Argon2id + legacy migration)", () => {
  it("hashes with Argon2id and verifies", async () => {
    const h = await hashPin("1357");
    expect(isArgon2idHash(h)).toBe(true);
    expect(await verifyPin("1357", h)).toBe(true);
    expect(await verifyPin("9999", h)).toBe(false);
  });
  it("still verifies legacy SHA-256 hashes", async () => {
    const legacy = await sha256Hex("2468");
    expect(isArgon2idHash(legacy)).toBe(false);
    expect(await verifyPin("2468", legacy)).toBe(true);
    expect(await verifyPin("0000", legacy)).toBe(false);
  });
});
