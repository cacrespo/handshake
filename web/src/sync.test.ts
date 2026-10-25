import { describe, it, expect } from "vitest";
import {
  filterSignaturesByGeohash,
  diffInventory,
  findGraffitisBySignatures,
  processIncomingGraffitis,
  isValidInventoryMessage,
  isValidRequestMissingMessage,
  type InventoryMessage,
  type RequestMissingMessage,
  type SyncResponseMessage,
} from "./sync";
import { signMessage, loadKeyPair, toHex } from "./utils";

describe("P2P Inventory-First Sync (Pillar 5 Alignment)", () => {
  const seedHexA = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const seedHexB = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

  const makeGraffiti = (text: string, geohash: string, timestamp: number, seedHex: string) => {
    const kp = loadKeyPair(seedHex);
    const pub = toHex(kp.publicKey);
    const unsigned = {
      version: "1.0",
      header: {
        author_pk: pub,
        parent_signature: null,
      },
      anchor: {
        timestamp,
        geohash,
        coordinates: { lat: -34.6037, lon: -58.3816 },
      },
      content: { text },
    };
    const signature = signMessage(unsigned, seedHex);
    return {
      ...unsigned,
      header: {
        ...unsigned.header,
        signature,
      },
    };
  };

  const graf1 = makeGraffiti("Graffiti 1 at Obelisk", "69y7pba", 1700000001, seedHexA);
  const graf2 = makeGraffiti("Graffiti 2 at Obelisk", "69y7pff", 1700000002, seedHexA);
  const graf3 = makeGraffiti("Graffiti 3 in Palermo", "69y7r12", 1700000003, seedHexB);
  const grafOtherZone = makeGraffiti("Graffiti 4 in Cordoba", "6dn1234", 1700000004, seedHexB);

  describe("filterSignaturesByGeohash", () => {
    it("extracts unique signatures for graffitis matching prefix", () => {
      const all = [graf1, graf2, graf3, grafOtherZone];
      // Target prefix '69y7p' (5 chars)
      const sigs = filterSignaturesByGeohash(all, "69y7pba", 5);
      expect(sigs).toHaveLength(2);
      expect(sigs).toContain(graf1.header.signature);
      expect(sigs).toContain(graf2.header.signature);
      expect(sigs).not.toContain(graf3.header.signature);
      expect(sigs).not.toContain(grafOtherZone.header.signature);
    });

    it("handles duplicates and preserves uniqueness", () => {
      const all = [graf1, graf1, graf2];
      const sigs = filterSignaturesByGeohash(all, "69y7pba", 5);
      expect(sigs).toHaveLength(2);
      expect(sigs).toEqual([graf1.header.signature, graf2.header.signature]);
    });

    it("returns empty array for invalid inputs or non-matching geohash", () => {
      expect(filterSignaturesByGeohash([], "69y7p", 5)).toEqual([]);
      expect(filterSignaturesByGeohash(null as any, "69y7p", 5)).toEqual([]);
      expect(filterSignaturesByGeohash([graf1], "", 5)).toEqual([]);
      expect(filterSignaturesByGeohash([graf1], null as any, 5)).toEqual([]);
      expect(filterSignaturesByGeohash([{}], "69y7p", 5)).toEqual([]);
      expect(filterSignaturesByGeohash([grafOtherZone], "69y7p", 5)).toEqual([]);
    });
  });

  describe("diffInventory (Demand-Driven Negotiation)", () => {
    it("returns only missing signatures when remote has items local lacks", () => {
      const remoteSigs = [graf1.header.signature, graf2.header.signature, graf3.header.signature];
      const localSigs = new Set([graf1.header.signature]);

      const missing = diffInventory(remoteSigs, localSigs);
      expect(missing).toEqual([graf2.header.signature, graf3.header.signature]);
    });

    it("returns empty array when local collection already has all remote signatures", () => {
      const remoteSigs = [graf1.header.signature, graf2.header.signature];
      const localSigs = new Set([
        graf1.header.signature,
        graf2.header.signature,
        graf3.header.signature,
      ]);

      const missing = diffInventory(remoteSigs, localSigs);
      expect(missing).toEqual([]);
    });

    it("works identically with string array or Set for local signatures", () => {
      const remoteSigs = [graf1.header.signature, graf2.header.signature];
      const localArray = [graf1.header.signature];

      const missing = diffInventory(remoteSigs, localArray);
      expect(missing).toEqual([graf2.header.signature]);
    });

    it("safely handles empty or non-array remote signatures", () => {
      expect(diffInventory([], new Set([graf1.header.signature]))).toEqual([]);
      expect(diffInventory(null as any, new Set([graf1.header.signature]))).toEqual([]);
      expect(diffInventory([""], new Set())).toEqual([]);
    });
  });

  describe("findGraffitisBySignatures", () => {
    it("resolves exact graffitis requested by signatures", () => {
      const graffitis = [graf1, graf2, graf3];
      const requested = [graf2.header.signature];

      const result = findGraffitisBySignatures(graffitis, requested);
      expect(result).toHaveLength(1);
      expect(result[0].header.signature).toBe(graf2.header.signature);
      expect(result[0].content.text).toBe("Graffiti 2 at Obelisk");
    });

    it("returns empty array when none match or requested list is empty", () => {
      expect(findGraffitisBySignatures([graf1], ["nonexistent-signature"])).toEqual([]);
      expect(findGraffitisBySignatures([graf1], [])).toEqual([]);
      expect(findGraffitisBySignatures([], [graf1.header.signature])).toEqual([]);
      expect(findGraffitisBySignatures(null as any, [graf1.header.signature])).toEqual([]);
    });

    it("avoids duplicate entries in result if store contains duplicates", () => {
      const graffitis = [graf1, graf1, graf2];
      const requested = [graf1.header.signature, graf2.header.signature];

      const result = findGraffitisBySignatures(graffitis, requested);
      expect(result).toHaveLength(2);
      expect(result.map(g => g.header.signature)).toEqual([graf1.header.signature, graf2.header.signature]);
    });
  });

  describe("processIncomingGraffitis (Zero-Trust Cryptographic Ingestion)", () => {
    it("verifies signatures and accepts new valid graffitis", () => {
      const incoming = [graf1, graf2];
      const existing = new Set<string>();

      const accepted = processIncomingGraffitis(incoming, existing);
      expect(accepted).toHaveLength(2);
    });

    it("discards graffitis that already exist locally", () => {
      const incoming = [graf1, graf2];
      const existing = new Set([graf1.header.signature]);

      const accepted = processIncomingGraffitis(incoming, existing);
      expect(accepted).toHaveLength(1);
      expect(accepted[0].header.signature).toBe(graf2.header.signature);
    });

    it("discards tampered or forged graffitis (Zero-Trust verification)", () => {
      const tampered = {
        ...graf1,
        content: { text: "Hacked content without resigning!" },
      };
      const incoming = [tampered, graf2];
      const existing = new Set<string>();

      const accepted = processIncomingGraffitis(incoming, existing);
      expect(accepted).toHaveLength(1);
      expect(accepted[0].header.signature).toBe(graf2.header.signature);
    });

    it("discards null, non-objects, and invalid shapes safely", () => {
      const incoming = [null, undefined, "not-a-graffiti", {}, graf1];
      const accepted = processIncomingGraffitis(incoming, new Set());
      expect(accepted).toHaveLength(1);
      expect(accepted[0].header.signature).toBe(graf1.header.signature);
    });
  });

  describe("Validation Helpers", () => {
    it("validates inventory messages", () => {
      const valid: InventoryMessage = {
        type: "inventory",
        geohash: "69y7pba",
        signatures: ["sig1", "sig2"],
      };
      expect(isValidInventoryMessage(valid)).toBe(true);
      expect(isValidInventoryMessage({ type: "inventory", geohash: "", signatures: [] })).toBe(false);
      expect(isValidInventoryMessage({ type: "inventory", geohash: "69y7p" })).toBe(false);
      expect(isValidInventoryMessage({ type: "inventory", geohash: "69y7p", signatures: [123] })).toBe(false);
      expect(isValidInventoryMessage({ type: "other", geohash: "69y7p", signatures: [] })).toBe(false);
      expect(isValidInventoryMessage(null)).toBe(false);
    });

    it("validates request_missing messages", () => {
      const valid: RequestMissingMessage = {
        type: "request_missing",
        signatures: ["sig1", "sig2"],
      };
      expect(isValidRequestMissingMessage(valid)).toBe(true);
      expect(isValidRequestMissingMessage({ type: "request_missing", signatures: [] })).toBe(true);
      expect(isValidRequestMissingMessage({ type: "request_missing" })).toBe(false);
      expect(isValidRequestMissingMessage({ type: "request_missing", signatures: "not-array" })).toBe(false);
      expect(isValidRequestMissingMessage({ type: "request_missing", signatures: [null] })).toBe(false);
      expect(isValidRequestMissingMessage(null)).toBe(false);
    });
  });

  describe("End-to-End 3-Step Wire Negotiation Simulation", () => {
    it("negotiates inventory, diffs missing, and transfers only missing messages without redundant payloads", () => {
      // Setup:
      // Peer A has: graf1, graf2
      // Peer B has: graf2, graf3
      const peerA_storage = [graf1, graf2];
      const peerB_storage = [graf2, graf3];

      // === Step 1: Peer A sends Inventory for viewport "69y7pba" ===
      const peerA_inventory_signatures = filterSignaturesByGeohash(peerA_storage, "69y7pba", 5);
      expect(peerA_inventory_signatures).toEqual([graf1.header.signature, graf2.header.signature]);

      const step1_packet: InventoryMessage = {
        type: "inventory",
        geohash: "69y7pba",
        signatures: peerA_inventory_signatures,
      };

      // === Step 2: Peer B receives Inventory, diffs against local collection ===
      const peerB_existing_sigs = new Set(peerB_storage.map(g => g.header.signature));
      const peerB_missing_sigs = diffInventory(step1_packet.signatures, peerB_existing_sigs);

      // graf2 is already known by Peer B! Only graf1 is missing.
      expect(peerB_missing_sigs).toEqual([graf1.header.signature]);

      const step2_packet: RequestMissingMessage = {
        type: "request_missing",
        signatures: peerB_missing_sigs,
      };

      // === Step 3: Peer A receives request_missing, sends sync_response with ONLY requested graffitis ===
      const toSend = findGraffitisBySignatures(peerA_storage, step2_packet.signatures);
      expect(toSend).toHaveLength(1);
      expect(toSend[0].header.signature).toBe(graf1.header.signature);

      const step3_packet: SyncResponseMessage = {
        type: "sync_response",
        messages: toSend,
      };

      // === Peer B receives sync_response and processes it ===
      const newlyIngested = processIncomingGraffitis(step3_packet.messages, peerB_existing_sigs);
      expect(newlyIngested).toHaveLength(1);
      expect(newlyIngested[0].header.signature).toBe(graf1.header.signature);

      // Verify Pillar 5 Invariant: graf2 was NEVER transmitted or requested!
      expect(step3_packet.messages.some(g => g.header.signature === graf2.header.signature)).toBe(false);
    });
  });
});
