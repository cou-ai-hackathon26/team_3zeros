/**
 * FRONTEND §9.2 & SECURITY §6.3 (Q-09):
 * Non-extractable WebCrypto AES-GCM 256-bit key used to encrypt offline emergency
 * referral payloads in IndexedDB.
 */

export interface EncryptedEnvelope {
  iv: number[];
  ciphertext: number[];
}

export async function generateNonExtractableAesKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false, // non-extractable (SECURITY §6.3)
    ["encrypt", "decrypt"]
  );
}

export async function encryptPayload(
  key: CryptoKey,
  plaintextObject: unknown
): Promise<EncryptedEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(plaintextObject));
  const encryptedBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  return {
    iv: Array.from(iv),
    ciphertext: Array.from(new Uint8Array(encryptedBuf)),
  };
}

export async function decryptPayload<T = unknown>(
  key: CryptoKey,
  envelope: EncryptedEnvelope
): Promise<T> {
  const iv = new Uint8Array(envelope.iv);
  const cipher = new Uint8Array(envelope.ciphertext);
  const decryptedBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    cipher
  );
  const json = new TextDecoder().decode(decryptedBuf);
  return JSON.parse(json) as T;
}
