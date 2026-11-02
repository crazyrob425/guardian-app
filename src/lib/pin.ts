// PIN hashing (Phase 3): Argon2id via libsodium for new PINs — the modern,
// memory-hard standard — with transparent support for legacy SHA-256 hashes
// (any PIN set before v0.7 still unlocks; it migrates to Argon2id the next
// time it's set). PINs never leave the device either way.

import sodium from "libsodium-wrappers-sumo";
import { sha256Hex } from "./crypto";

let ready: Promise<void> | null = null;
function sodiumReady(): Promise<void> {
  if (!ready) ready = sodium.ready;
  return ready;
}

export function isArgon2idHash(stored: string): boolean {
  return stored.startsWith("$argon2id$");
}

/** Hash a PIN for storage (Argon2id, libsodium interactive limits). */
export async function hashPin(pin: string): Promise<string> {
  await sodiumReady();
  return sodium.crypto_pwhash_str(
    pin,
    sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE
  );
}

/** Verify a PIN against a stored hash of either generation. */
export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  if (isArgon2idHash(stored)) {
    await sodiumReady();
    try {
      return sodium.crypto_pwhash_str_verify(stored, pin);
    } catch {
      return false;
    }
  }
  // Legacy SHA-256 (pre-Phase-3) hashes.
  return (await sha256Hex(pin)) === stored;
}
