// Passkeys as a LOCAL unlock factor (Phase 3). Guardian has no accounts and
// no server to verify assertions — so verification happens entirely on this
// device: registration stores the credential's public key locally, and an
// unlock assertion's signature is verified in-browser with WebCrypto.
// The private key never leaves the platform authenticator (fingerprint /
// Face ID / device PIN). This is an ADDITIONAL factor alongside the PIN —
// the PIN (and its panic-lock semantics) always remains available.

const K = "guardian.passkey.v1";

export interface StoredPasskey {
  credIdB64: string;
  xB64: string; // COSE EC2 public key coordinates
  yB64: string;
  createdAt: number;
}

// ---------- small helpers (exported for tests) ----------

function b64(buf: ArrayBuffer | Uint8Array): string {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  u.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

/** Minimal CBOR decoder — enough for attestation objects and COSE keys. */
export function cborDecode(buf: Uint8Array, offset = 0): { value: unknown; next: number } {
  const b0 = buf[offset];
  const major = b0 >> 5;
  const ai = b0 & 0x1f;
  let len = 0;
  let i = offset + 1;
  if (ai < 24) len = ai;
  else if (ai === 24) { len = buf[i]; i += 1; }
  else if (ai === 25) { len = (buf[i] << 8) | buf[i + 1]; i += 2; }
  else if (ai === 26) { len = ((buf[i] << 24) | (buf[i + 1] << 16) | (buf[i + 2] << 8) | buf[i + 3]) >>> 0; i += 4; }
  else if (ai === 27) { len = Number(new DataView(buf.buffer, buf.byteOffset + i, 8).getBigUint64(0)); i += 8; }
  switch (major) {
    case 0: return { value: len, next: i };
    case 1: return { value: -1 - len, next: i };
    case 2: return { value: buf.slice(i, i + len), next: i + len };
    case 3: return { value: new TextDecoder().decode(buf.slice(i, i + len)), next: i + len };
    case 4: {
      const arr: unknown[] = [];
      let p = i;
      for (let n = 0; n < len; n++) { const r = cborDecode(buf, p); arr.push(r.value); p = r.next; }
      return { value: arr, next: p };
    }
    case 5: {
      const map = new Map<unknown, unknown>();
      let p = i;
      for (let n = 0; n < len; n++) {
        const k = cborDecode(buf, p); const v = cborDecode(buf, k.next);
        map.set(k.value, v.value); p = v.next;
      }
      return { value: map, next: p };
    }
    case 7: return { value: ai === 21 ? true : ai === 20 ? false : null, next: i };
    default: return { value: null, next: i };
  }
}

/** Convert an ASN.1 DER ECDSA signature to the raw r||s form WebCrypto wants. */
export function derToRaw(der: Uint8Array, size = 32): Uint8Array {
  let i = 0;
  if (der[i++] !== 0x30) throw new Error("bad DER");
  i++; // sequence length (short form assumed for P-256)
  if (der[i] === 0x81) i++;
  const readInt = (): Uint8Array => {
    if (der[i++] !== 0x02) throw new Error("bad DER int");
    const l = der[i++];
    let v = der.slice(i, i + l); i += l;
    while (v.length > 0 && v[0] === 0) v = v.slice(1);
    const out = new Uint8Array(size);
    out.set(v.slice(-size), size - Math.min(v.length, size));
    return out;
  };
  const r = readInt();
  const s = readInt();
  const raw = new Uint8Array(size * 2);
  raw.set(r, 0); raw.set(s, size);
  return raw;
}

// ---------- storage ----------

export function getPasskey(): StoredPasskey | null {
  try {
    const raw = localStorage.getItem(K);
    return raw ? (JSON.parse(raw) as StoredPasskey) : null;
  } catch { return null; }
}
export function hasPasskey(): boolean { return getPasskey() !== null; }
export function removePasskey() { try { localStorage.removeItem(K); } catch { /* noop */ } }

export function passkeySupported(): boolean {
  return typeof window !== "undefined" && !!window.PublicKeyCredential && !!navigator.credentials;
}

// ---------- ceremonies ----------

export async function registerPasskey(): Promise<void> {
  if (!passkeySupported()) throw new Error("Passkeys aren't supported on this device/browser.");
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  let userId: Uint8Array;
  try {
    userId = unb64(localStorage.getItem("guardian.passkeyUser") || "");
    if (userId.length !== 16) throw new Error("regen");
  } catch {
    userId = crypto.getRandomValues(new Uint8Array(16));
    try { localStorage.setItem("guardian.passkeyUser", b64(userId)); } catch { /* noop */ }
  }
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: challenge as BufferSource,
      rp: { id: window.location.hostname, name: "Guardian" },
      user: { id: userId as BufferSource, name: "guardian-user", displayName: "Guardian user" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      authenticatorSelection: { userVerification: "required", residentKey: "preferred" },
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Passkey registration was cancelled.");
  const resp = cred.response as AuthenticatorAttestationResponse;
  const att = cborDecode(new Uint8Array(resp.attestationObject)).value as Map<unknown, unknown>;
  const authData = att.get("authData") as Uint8Array;
  // authData: rpIdHash(32) flags(1) signCount(4) aaguid(16) credIdLen(2) credId COSE
  let p = 32 + 1 + 4 + 16;
  const credIdLen = (authData[p] << 8) | authData[p + 1]; p += 2;
  const credId = authData.slice(p, p + credIdLen); p += credIdLen;
  const cose = cborDecode(authData, p).value as Map<unknown, unknown>;
  const x = cose.get(-2) as Uint8Array;
  const y = cose.get(-3) as Uint8Array;
  const stored: StoredPasskey = { credIdB64: b64(credId), xB64: b64(x), yB64: b64(y), createdAt: Date.now() };
  localStorage.setItem(K, JSON.stringify(stored));
}

/** Prompt for the passkey and verify the assertion locally. */
export async function verifyPasskey(): Promise<boolean> {
  const stored = getPasskey();
  if (!stored || !passkeySupported()) return false;
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: challenge as BufferSource,
      rpId: window.location.hostname,
      allowCredentials: [{ type: "public-key", id: unb64(stored.credIdB64) as BufferSource }],
      userVerification: "required",
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) return false;
  const resp = cred.response as AuthenticatorAssertionResponse;

  // clientData must be our challenge, type webauthn.get
  const clientData = JSON.parse(new TextDecoder().decode(resp.clientDataJSON)) as { type: string; challenge: string };
  const expectedChallenge = b64(challenge).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  if (clientData.type !== "webauthn.get" || clientData.challenge !== expectedChallenge) return false;

  const clientHash = new Uint8Array(await crypto.subtle.digest("SHA-256", resp.clientDataJSON));
  const authData = new Uint8Array(resp.authenticatorData);
  const signed = new Uint8Array(authData.length + clientHash.length);
  signed.set(authData, 0);
  signed.set(clientHash, authData.length);

  const rawKey = new Uint8Array(65);
  rawKey[0] = 0x04;
  rawKey.set(unb64(stored.xB64), 1);
  rawKey.set(unb64(stored.yB64), 33);
  const pub = await crypto.subtle.importKey("raw", rawKey as BufferSource, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const rawSig = derToRaw(new Uint8Array(resp.signature));
  return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, rawSig as BufferSource, signed as BufferSource);
}
