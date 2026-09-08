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

// Canonical JSON stringify matching Python sort_keys=True recursively
export function canonicalStringify(obj: any): string {
  if (obj === null) return "null";
  if (typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalStringify).join(",") + "]";
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map((k) => JSON.stringify(k) + ":" + canonicalStringify(obj[k]));
  return "{" + pairs.join(",") + "}";
}
