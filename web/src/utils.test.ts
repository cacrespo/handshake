import { describe, it, expect } from "vitest";
import {
  toHex,
  fromHex,
  canonicalStringify,
  getSigningData,
  verifyMessage,
  signMessage,
  loadKeyPair,
  getSeedFromKeyPair,
  exportKeyData,
  signTrackerRegistration,
  verifyTrackerRegistration,
  isValidSyncRequest,
  isValidSyncResponse,
  isValidDataChannelMessage,
} from "./utils";

describe("Key Format & TweetNaCl Compatibility (SEC-03)", () => {
  const seedHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const seedBytes = fromHex(seedHex);
  const expectedPubHex = "207a067892821e25d770f1fba0c47c11ff4b813e54162ece9eb839e076231ab6";

  it("loads a keypair from a 32-byte seed (Uint8Array)", () => {
    const kp = loadKeyPair(seedBytes);
    expect(toHex(kp.publicKey)).toBe(expectedPubHex);
    expect(kp.secretKey.length).toBe(64);
    expect(toHex(getSeedFromKeyPair(kp))).toBe(seedHex);
  });

  it("loads a keypair from a 32-byte seed hex string (64 hex characters)", () => {
    const kp = loadKeyPair(seedHex);
    expect(toHex(kp.publicKey)).toBe(expectedPubHex);
    expect(kp.secretKey.length).toBe(64);
  });

  it("loads a keypair from a legacy 64-byte secret key (128 hex characters)", () => {
    const kpFromSeed = loadKeyPair(seedBytes);
    const legacySecretKey = kpFromSeed.secretKey;
    expect(legacySecretKey.length).toBe(64);

    const kpFromLegacyBytes = loadKeyPair(legacySecretKey);
    expect(toHex(kpFromLegacyBytes.publicKey)).toBe(expectedPubHex);
    expect(toHex(getSeedFromKeyPair(kpFromLegacyBytes))).toBe(seedHex);

    const legacyHex = toHex(legacySecretKey);
    const kpFromLegacyHex = loadKeyPair(legacyHex);
    expect(toHex(kpFromLegacyHex.publicKey)).toBe(expectedPubHex);
    expect(toHex(getSeedFromKeyPair(kpFromLegacyHex))).toBe(seedHex);
  });

  it("throws an error for invalid key lengths", () => {
    expect(() => loadKeyPair(new Uint8Array(16))).toThrow(/Invalid private key length/);
    expect(() => loadKeyPair(new Uint8Array(48))).toThrow(/Invalid private key length/);
    expect(() => loadKeyPair("deadbeef")).toThrow(/Invalid private key length/);
  });

  it("exports key data standardized to 32-byte private seed", () => {
    const kp = loadKeyPair(seedBytes);
    const exported = exportKeyData(kp);
    expect(exported.public_key).toBe(expectedPubHex);
    expect(exported.private_key).toBe(seedHex);
    expect(exported.private_key.length).toBe(64);
  });
});

describe("Canonical Stringification & Signing Data (SEC-01)", () => {
  it("formats JSON recursively without whitespace after colons and commas", () => {
    const obj = {
      b: 2,
      a: {
        d: [3, 2, 1],
        c: "hello",
      },
    };
    const canonical = canonicalStringify(obj);
    expect(canonical).toBe('{"a":{"c":"hello","d":[3,2,1]},"b":2}');
  });

  it("getSigningData excludes header.signature and leaves original unmodified", () => {
    const msg = {
      version: "1.0",
      header: {
        author_pk: "207a067892821e25d770f1fba0c47c11ff4b813e54162ece9eb839e076231ab6",
        timestamp: 1700000000,
        type: "PUBLIC",
        owner_pk: null,
        parent_signature: null,
        signature: "abcdef0123456789",
      },
      location: {
        geohash: "6g3qc",
        proof: { type: "NONE", data: null },
      },
      content: { text: "Hello Strata from Web!" },
    };

    const signingData = getSigningData(msg);
    expect(signingData).not.toContain('"signature":');
    expect(msg.header.signature).toBe("abcdef0123456789");

    const parsed = JSON.parse(signingData);
    expect(parsed.header.signature).toBeUndefined();
    expect(parsed.content.text).toBe("Hello Strata from Web!");
  });
});

describe("Message Signing & Verification", () => {
  const seedHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const pubHex = "207a067892821e25d770f1fba0c47c11ff4b813e54162ece9eb839e076231ab6";

  it("signs and verifies messages using 32-byte seed", () => {
    const msg = {
      version: "1.0",
      header: {
        author_pk: pubHex,
        owner_pk: null,
        parent_signature: null,
        timestamp: 1700000000,
        type: "PUBLIC",
      },
      location: {
        geohash: "6g3qc",
        proof: { data: null, type: "NONE" },
      },
      content: { text: "Cross language test message" },
    };

    const sigHex = signMessage(msg, seedHex);
    expect(sigHex.length).toBe(128);

    const signedMsg = {
      ...msg,
      header: {
        ...msg.header,
        signature: sigHex,
      },
    };

    expect(verifyMessage(signedMsg)).toBe(true);

    // Tampering content should fail verification
    const tamperedContent = {
      ...signedMsg,
      content: { text: "Tampered message!" },
    };
    expect(verifyMessage(tamperedContent)).toBe(false);

    // Tampering timestamp should fail verification
    const tamperedTimestamp = {
      ...signedMsg,
      header: { ...signedMsg.header, timestamp: 1700000001 },
    };
    expect(verifyMessage(tamperedTimestamp)).toBe(false);
  });

  it("signs and verifies messages using legacy 64-byte secret key", () => {
    const kp = loadKeyPair(seedHex);
    const msg = {
      version: "1.0",
      header: {
        author_pk: pubHex,
        owner_pk: null,
        parent_signature: null,
        timestamp: 1700000000,
        type: "PUBLIC",
      },
      location: {
        geohash: "6g3qc",
        proof: { data: null, type: "NONE" },
      },
      content: { text: "Legacy key signing test" },
    };

    const sigHex = signMessage(msg, kp.secretKey);
    const signedMsg = {
      ...msg,
      header: {
        ...msg.header,
        signature: sigHex,
      },
    };

    expect(verifyMessage(signedMsg)).toBe(true);
  });
});

describe("Tracker Registration Authentication (SEC-02)", () => {
  const seedHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const pubHex = "207a067892821e25d770f1fba0c47c11ff4b813e54162ece9eb839e076231ab6";
  const geohash = "69y7pg3";
  const timestamp = 1712345678;

  it("generates a valid Ed25519 signature for the registration challenge", () => {
    const sigHex = signTrackerRegistration(pubHex, geohash, timestamp, seedHex);
    expect(sigHex.length).toBe(128); // 64 bytes = 128 hex chars

    const valid = verifyTrackerRegistration(pubHex, geohash, timestamp, sigHex);
    expect(valid).toBe(true);
  });

  it("fails verification if geohash is altered", () => {
    const sigHex = signTrackerRegistration(pubHex, geohash, timestamp, seedHex);
    const valid = verifyTrackerRegistration(pubHex, "69y7pba", timestamp, sigHex);
    expect(valid).toBe(false);
  });

  it("fails verification if timestamp is altered", () => {
    const sigHex = signTrackerRegistration(pubHex, geohash, timestamp, seedHex);
    const valid = verifyTrackerRegistration(pubHex, geohash, timestamp + 1, sigHex);
    expect(valid).toBe(false);
  });

  it("fails verification if peerId is altered (spoofing)", () => {
    const sigHex = signTrackerRegistration(pubHex, geohash, timestamp, seedHex);
    const spoofedPubHex = "1111111111111111111111111111111111111111111111111111111111111111";
    const valid = verifyTrackerRegistration(spoofedPubHex, geohash, timestamp, sigHex);
    expect(valid).toBe(false);
  });
});

describe("Strict Hex Validation (SEC-04 / SEC-06)", () => {
  it("converts valid hex strings correctly (lowercase, uppercase, mixed)", () => {
    expect(Array.from(fromHex("001122aabbcc"))).toEqual([0x00, 0x11, 0x22, 0xaa, 0xbb, 0xcc]);
    expect(Array.from(fromHex("AABBCCDD"))).toEqual([0xaa, 0xbb, 0xcc, 0xdd]);
    expect(Array.from(fromHex("aAbBcC01"))).toEqual([0xaa, 0xbb, 0xcc, 0x01]);
  });

  it("returns empty Uint8Array for empty string", () => {
    const res = fromHex("");
    expect(res).toBeInstanceOf(Uint8Array);
    expect(res.length).toBe(0);
  });

  it("throws descriptive error for odd-length hex strings", () => {
    expect(() => fromHex("a")).toThrow(/length must be even/i);
    expect(() => fromHex("123")).toThrow(/length must be even/i);
    expect(() => fromHex("abcde")).toThrow(/length must be even/i);
  });

  it("throws descriptive error for non-hexadecimal characters", () => {
    expect(() => fromHex("00zz")).toThrow(/non-hexadecimal/i);
    expect(() => fromHex("deadbeef!!")).toThrow(/non-hexadecimal/i);
    expect(() => fromHex("00 11 22")).toThrow(/non-hexadecimal/i);
    expect(() => fromHex("0x1234")).toThrow(/non-hexadecimal/i);
    expect(() => fromHex("ghij")).toThrow(/non-hexadecimal/i);
  });

  it("throws TypeError for non-string inputs", () => {
    expect(() => fromHex(null as any)).toThrow(TypeError);
    expect(() => fromHex(undefined as any)).toThrow(TypeError);
    expect(() => fromHex(12345 as any)).toThrow(TypeError);
  });
});

describe("WebRTC DataChannel Message Validation (SEC-06)", () => {
  describe("isValidSyncRequest", () => {
    it("accepts valid request_sync messages", () => {
      expect(isValidSyncRequest({ type: "request_sync", geohash: "6g3qc" })).toBe(true);
      expect(isValidSyncRequest({ type: "request_sync", geohash: "69y7pba" })).toBe(true);
    });

    it("rejects messages with invalid or missing geohash", () => {
      expect(isValidSyncRequest({ type: "request_sync" })).toBe(false);
      expect(isValidSyncRequest({ type: "request_sync", geohash: "" })).toBe(false);
      expect(isValidSyncRequest({ type: "request_sync", geohash: 12345 })).toBe(false);
      expect(isValidSyncRequest({ type: "request_sync", geohash: null })).toBe(false);
      expect(isValidSyncRequest({ type: "request_sync", geohash: { code: "6g3qc" } })).toBe(false);
    });

    it("rejects non-object or malformed structures", () => {
      expect(isValidSyncRequest(null)).toBe(false);
      expect(isValidSyncRequest(undefined)).toBe(false);
      expect(isValidSyncRequest("request_sync")).toBe(false);
      expect(isValidSyncRequest({ type: "other_type", geohash: "6g3qc" })).toBe(false);
    });
  });

  describe("isValidSyncResponse", () => {
    it("accepts valid sync_response messages with array of graffitis", () => {
      expect(isValidSyncResponse({ type: "sync_response", graffitis: [] })).toBe(true);
      expect(isValidSyncResponse({ type: "sync_response", graffitis: [{ id: 1 }, { id: 2 }] })).toBe(true);
    });

    it("rejects messages where graffitis is not an array", () => {
      expect(isValidSyncResponse({ type: "sync_response" })).toBe(false);
      expect(isValidSyncResponse({ type: "sync_response", graffitis: null })).toBe(false);
      expect(isValidSyncResponse({ type: "sync_response", graffitis: "not-an-array" })).toBe(false);
      expect(isValidSyncResponse({ type: "sync_response", graffitis: 42 })).toBe(false);
      expect(isValidSyncResponse({ type: "sync_response", graffitis: {} })).toBe(false);
    });

    it("rejects non-object or malformed structures", () => {
      expect(isValidSyncResponse(null)).toBe(false);
      expect(isValidSyncResponse(undefined)).toBe(false);
      expect(isValidSyncResponse("sync_response")).toBe(false);
      expect(isValidSyncResponse({ type: "unknown", graffitis: [] })).toBe(false);
    });
  });

  describe("isValidDataChannelMessage", () => {
    it("recognizes valid sync requests and responses", () => {
      expect(isValidDataChannelMessage({ type: "request_sync", geohash: "6g3qc" })).toBe(true);
      expect(isValidDataChannelMessage({ type: "sync_response", graffitis: [] })).toBe(true);
    });

    it("rejects arbitrary or malicious payloads", () => {
      expect(isValidDataChannelMessage({ type: "eval", code: "alert(1)" })).toBe(false);
      expect(isValidDataChannelMessage({ type: "request_sync", geohash: 123 })).toBe(false);
      expect(isValidDataChannelMessage({ type: "sync_response", graffitis: "bad" })).toBe(false);
      expect(isValidDataChannelMessage(null)).toBe(false);
      expect(isValidDataChannelMessage("hello")).toBe(false);
    });
  });
});


