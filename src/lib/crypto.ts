// AES-GCM helpers + random IDs. Keys travel only in URL fragments (never sent to any server).

const te = new TextEncoder();
const td = new TextDecoder();

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomId(bytes = 16): string {
  const b = new Uint8Array(new ArrayBuffer(bytes)) as Uint8Array<ArrayBuffer>;
  crypto.getRandomValues(b);
  return b64urlEncode(b);
}

export async function genKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return b64urlEncode(new Uint8Array(raw));
}

export async function importKey(b64: string): Promise<CryptoKey> {
  const raw = b64urlDecode(b64);
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

/** Encrypt any JSON-serializable value -> base64url(iv + ciphertext) */
export async function encrypt(key: CryptoKey, value: unknown): Promise<string> {
  const iv = new Uint8Array(new ArrayBuffer(12)) as unknown as Uint8Array<ArrayBuffer>;
  crypto.getRandomValues(iv);
  const data = te.encode(JSON.stringify(value));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), 12);
  return b64urlEncode(out);
}

/** Decrypt a payload produced by encrypt() */
export async function decrypt<T = any>(key: CryptoKey, payload: string): Promise<T> {
  const bytes = b64urlDecode(payload);
  const iv = bytes.slice(0, 12);
  const ct = bytes.slice(12);
  const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return JSON.parse(td.decode(data));
}

/** SHA-256 hex digest (for PIN storage — device-local) */
export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", te.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
