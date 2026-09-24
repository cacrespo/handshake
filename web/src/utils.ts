import nacl from "tweetnacl";

// Hex conversion helpers
export const toHex = (arr: Uint8Array): string =>
  Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

export const fromHex = (hex: string): Uint8Array => {
  const cleanHex = hex.replace(/[^a-fA-F0-9]/g, "");
  const view = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    view[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return view;
};

// UTF-8 string to Uint8Array helper ensuring local Uint8Array realm
export const utf8ToBytes = (str: string): Uint8Array => {
  const raw = new TextEncoder().encode(str);
  return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
};

// Key format management & tweetnacl compatibility helpers
export function loadKeyPair(keyData: Uint8Array | string): nacl.SignKeyPair {
  const rawBytes = typeof keyData === "string" ? fromHex(keyData) : keyData;
  if (rawBytes.length === 32) {
    return nacl.sign.keyPair.fromSeed(rawBytes);
  } else if (rawBytes.length === 64) {
    return nacl.sign.keyPair.fromSecretKey(rawBytes);
  }
  throw new Error(`Invalid private key length: ${rawBytes.length} bytes (expected 32-byte seed or 64-byte secret key)`);
}

export function getSeedFromKeyPair(keyPair: nacl.SignKeyPair): Uint8Array {
  return keyPair.secretKey.subarray(0, 32);
}

export function exportKeyData(keyPair: nacl.SignKeyPair): { public_key: string; private_key: string } {
  return {
    public_key: toHex(keyPair.publicKey),
    private_key: toHex(getSeedFromKeyPair(keyPair)),
  };
}

// Geohash helper (precision 7 for local nodes)
const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export function encodeGeohash(lat: number, lon: number, precision: number = 7): string {
  let isEven = true;
  let latMin = -90,
    latMax = 90;
  let lonMin = -180,
    lonMax = 180;
  let geohash = "";
  let bit = 0;
  let ch = 0;

  while (geohash.length < precision) {
    let mid;
    if (isEven) {
      mid = (lonMin + lonMax) / 2;
      if (lon > mid) {
        ch |= 1 << (4 - bit);
        lonMin = mid;
      } else {
        lonMax = mid;
      }
    } else {
      mid = (latMin + latMax) / 2;
      if (lat > mid) {
        ch |= 1 << (4 - bit);
        latMin = mid;
      } else {
        latMax = mid;
      }
    }

    isEven = !isEven;
    if (bit < 4) {
      bit++;
    } else {
      geohash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return geohash;
}

export function decodeGeohash(geohash: string): { lat: number; lon: number } {
  let isEven = true;
  let latMin = -90,
    latMax = 90;
  let lonMin = -180,
    lonMax = 180;

  for (let i = 0; i < geohash.length; i++) {
    const c = geohash[i];
    const cd = BASE32.indexOf(c);
    if (cd === -1) continue;
    for (let j = 0; j < 5; j++) {
      const mask = 1 << (4 - j);
      if (isEven) {
        const mid = (lonMin + lonMax) / 2;
        if (cd & mask) {
          lonMin = mid;
        } else {
          lonMax = mid;
        }
      } else {
        const mid = (latMin + latMax) / 2;
        if (cd & mask) {
          latMin = mid;
        } else {
          latMax = mid;
        }
      }
      isEven = !isEven;
    }
  }
  return {
    lat: (latMin + latMax) / 2,
    lon: (lonMin + lonMax) / 2,
  };
}

// Canonical JSON stringify matching Python sort_keys=True recursively (no whitespace)
export function canonicalStringify(obj: any): string {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalStringify).join(",") + "]";
  }
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  const pairs = keys.map((k) => JSON.stringify(k) + ":" + canonicalStringify(obj[k]));
  return "{" + pairs.join(",") + "}";
}

export function getSigningData(msg: any): string {
  // Deep clone to avoid mutating input and strip header.signature
  const data = JSON.parse(JSON.stringify(msg));
  if (data && data.header && typeof data.header === "object") {
    delete data.header.signature;
  }
  return canonicalStringify(data);
}

export function signMessage(msg: any, secretKey: Uint8Array | string): string {
  const keyPair = loadKeyPair(secretKey);
  const signingData = getSigningData(msg);
  const dataBytes = utf8ToBytes(signingData);
  const sigBytes = nacl.sign.detached(dataBytes, keyPair.secretKey);
  return toHex(sigBytes);
}

export function verifyMessage(msg: any): boolean {
  if (!msg || !msg.header || !msg.header.signature || !msg.header.author_pk) return false;
  try {
    const signingData = getSigningData(msg);
    const dataBytes = utf8ToBytes(signingData);
    const signatureBytes = fromHex(msg.header.signature);
    const publicKeyBytes = fromHex(msg.header.author_pk);
    return nacl.sign.detached.verify(dataBytes, signatureBytes, publicKeyBytes);
  } catch (e) {
    console.error("Signature verification failed:", e);
    return false;
  }
}

export function signTrackerRegistration(
  peerId: string,
  geohash: string,
  timestamp: number,
  secretKey: Uint8Array | string
): string {
  const keyPair = loadKeyPair(secretKey);
  const challenge = `REGISTER:${peerId}:${geohash}:${Math.floor(timestamp)}`;
  const dataBytes = utf8ToBytes(challenge);
  const sigBytes = nacl.sign.detached(dataBytes, keyPair.secretKey);
  return toHex(sigBytes);
}

export function verifyTrackerRegistration(
  peerId: string,
  geohash: string,
  timestamp: number,
  signature: string
): boolean {
  try {
    const challenge = `REGISTER:${peerId}:${geohash}:${Math.floor(timestamp)}`;
    const dataBytes = utf8ToBytes(challenge);
    const sigBytes = fromHex(signature);
    const pubBytes = fromHex(peerId);
    return nacl.sign.detached.verify(dataBytes, sigBytes, pubBytes);
  } catch {
    return false;
  }
}

