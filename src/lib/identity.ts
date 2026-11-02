// Guardian identity (Phase 3): a libsodium (X25519) keypair generated on
// this device and never uploaded anywhere. Today it anchors the identity
// fingerprint shown in Settings; it's the foundation for sealed-box
// session-key delivery to paired circle devices (Phase 5 moat work) —
// keys exist before features need them, not after.

import sodium from "libsodium-wrappers-sumo";

const K = "guardian.identity.v1";

export interface Identity {
  publicKeyB64: string;
  secretKeyB64: string;
  createdAt: number;
}

async function getOrCreate(): Promise<Identity> {
  await sodium.ready;
  try {
    const raw = localStorage.getItem(K);
    if (raw) return JSON.parse(raw) as Identity;
  } catch { /* create below */ }
  const kp = sodium.crypto_box_keypair();
  const id: Identity = {
    publicKeyB64: sodium.to_base64(kp.publicKey, sodium.base64_variants.ORIGINAL),
    secretKeyB64: sodium.to_base64(kp.privateKey, sodium.base64_variants.ORIGINAL),
    createdAt: Date.now(),
  };
  try {
    localStorage.setItem(K, JSON.stringify(id));
  } catch { /* storage blocked — identity will regenerate next load */ }
  return id;
}

/** Human-friendly identity fingerprint (BLAKE2b of the public key, grouped). */
export async function identityFingerprint(): Promise<string> {
  const id = await getOrCreate();
  await sodium.ready;
  const pk = sodium.from_base64(id.publicKeyB64, sodium.base64_variants.ORIGINAL);
  const h = sodium.crypto_generichash(16, pk, null as unknown as Uint8Array);
  const hex = Array.from(h as unknown as ArrayLike<number>).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return hex.replace(/(.{4})(?=.)/g, "$1 ").trim();
}

export async function getIdentity(): Promise<Identity> {
  return getOrCreate();
}

/**
 * Seal a message to a recipient's public key (anonymous sealed box) —
 * the primitive Phase 5 uses to deliver session keys to paired devices.
 */
export async function sealTo(publicKeyB64: string, message: string): Promise<string> {
  await sodium.ready;
  const pk = sodium.from_base64(publicKeyB64, sodium.base64_variants.ORIGINAL);
  const sealed = sodium.crypto_box_seal(new TextEncoder().encode(message), pk);
  return sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL);
}

/** Open a sealed box addressed to this device's identity. */
export async function openSealed(sealedB64: string): Promise<string> {
  await sodium.ready;
  const id = await getOrCreate();
  const pk = sodium.from_base64(id.publicKeyB64, sodium.base64_variants.ORIGINAL);
  const sk = sodium.from_base64(id.secretKeyB64, sodium.base64_variants.ORIGINAL);
  const sealed = sodium.from_base64(sealedB64, sodium.base64_variants.ORIGINAL);
  const plain = sodium.crypto_box_seal_open(sealed, pk, sk);
  return new TextDecoder().decode(plain);
}
