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

