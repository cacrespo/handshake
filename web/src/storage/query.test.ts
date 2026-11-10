import { describe, it, expect } from "vitest";
import {
  queryMessages,
  buildThreadTrees,
  computeSpatialClusters,
  computeTemporalDistribution,
  getTodayBounds,
  categorizeTimestamp,
  timestampToEpoch,
  getDistance,
} from "./query";

describe("Space-Time Query Coordination Layer (query.ts)", () => {
  const { start: todayStart, end: todayEnd } = getTodayBounds();
  const pastTs = todayStart - 86400 * 5; // 5 days ago
  const presentTs = todayStart + 3600 * 2; // today 2 hours in
  const futureTs = todayEnd + 86400 * 10; // 10 days in future

  const sampleMessages = [
    {
      header: {
        signature: "sig_past_001",
        author_pk: "author_alice",
        parent_signature: null,
      },
      anchor: {
        geohash: "6gyf4a1",
        timestamp: pastTs,
        coordinates: { lat: -34.6037, lon: -58.3816 },
      },
      content: { text: "Historical graffiti from the past" },
      is_local: true,
    },
    {
      header: {
        signature: "sig_present_002",
        author_pk: "author_bob",
        parent_signature: "sig_past_001",
      },
      anchor: {
        geohash: "6gyf4b2",
        timestamp: presentTs,
        coordinates: { lat: -34.604, lon: -58.382 },
      },
      content: { text: "Real-time live update today" },
      is_local: false,
    },
    {
      header: {
        signature: "sig_future_003",
        author_pk: "author_charlie",
        parent_signature: null,
      },
      anchor: {
        geohash: "dr5reg1", // New York
        timestamp: futureTs,
        coordinates: { lat: 40.7128, lon: -74.006 },
      },
      content: { text: "Time capsule for the future rendezvous" },
      is_local: false,
      is_pinned: 1,
    },
  ];

  it("categorizes timestamps accurately into past, present, and future", () => {
    expect(categorizeTimestamp(pastTs)).toBe("past");
    expect(categorizeTimestamp(presentTs)).toBe("present");
    expect(categorizeTimestamp(futureTs)).toBe("future");
  });

  it("formats epoch strings correctly (YYYY-MM)", () => {
    // 1787524687 or sample timestamp
    const epoch = timestampToEpoch(new Date(2026, 10, 10).getTime() / 1000);
    expect(epoch).toBe("2026-11");
  });

  it("calculates great-circle distance accurately", () => {
    // Distance between Obelisco Buenos Aires and nearby coordinate (~100m)
    const dist = getDistance(-34.6037, -58.3816, -34.6045, -58.382);
    expect(dist).toBeGreaterThan(50);
    expect(dist).toBeLessThan(200);
  });

  it("filters messages temporally by Past, Present, and Future dimensions", () => {
    const pastOnly = queryMessages(sampleMessages, {
      temporalFilter: { dimension: "past" },
    });
    expect(pastOnly).toHaveLength(1);
    expect(pastOnly[0].header.signature).toBe("sig_past_001");

    const presentOnly = queryMessages(sampleMessages, {
      temporalFilter: { dimension: "present" },
    });
    expect(presentOnly).toHaveLength(1);
    expect(presentOnly[0].header.signature).toBe("sig_present_002");

    const futureOnly = queryMessages(sampleMessages, {
      temporalFilter: { dimension: "future" },
    });
    expect(futureOnly).toHaveLength(1);
    expect(futureOnly[0].header.signature).toBe("sig_future_003");
  });

  it("filters messages spatially by geohash prefix", () => {
    const bueOnly = queryMessages(sampleMessages, {
      selectedGeohash: "6gyf",
    });
    expect(bueOnly).toHaveLength(2);
    expect(bueOnly.map((m) => m.header.signature)).toEqual(["sig_past_001", "sig_present_002"]);

    const nyOnly = queryMessages(sampleMessages, {
      selectedGeohash: "dr5",
    });
    expect(nyOnly).toHaveLength(1);
    expect(nyOnly[0].header.signature).toBe("sig_future_003");
  });

  it("filters messages by search query text, author, and geohash", () => {
    const textSearch = queryMessages(sampleMessages, {
      searchQuery: "rendezvous",
    });
    expect(textSearch).toHaveLength(1);
    expect(textSearch[0].header.signature).toBe("sig_future_003");

    const authorSearch = queryMessages(sampleMessages, {
      searchQuery: "author_alice",
    });
    expect(authorSearch).toHaveLength(1);
    expect(authorSearch[0].header.signature).toBe("sig_past_001");
  });

  it("filters messages by category: pinned, local, trusted", () => {
    const pinned = queryMessages(sampleMessages, {
      categoryFilter: "pinned",
      pinnedSignatures: new Set(["sig_future_003"]),
    });
    expect(pinned).toHaveLength(1);
    expect(pinned[0].header.signature).toBe("sig_future_003");

    const localOnly = queryMessages(sampleMessages, {
      categoryFilter: "local",
    });
    expect(localOnly).toHaveLength(1);
    expect(localOnly[0].header.signature).toBe("sig_past_001");

    const trustedOnly = queryMessages(sampleMessages, {
      categoryFilter: "trusted",
      trustedAuthors: ["author_bob"],
    });
    expect(trustedOnly).toHaveLength(1);
    expect(trustedOnly[0].header.signature).toBe("sig_present_002");
  });

  it("builds recursive conversational thread trees with parent-reply relationships", () => {
    const trees = buildThreadTrees(sampleMessages);
    expect(trees).toHaveLength(2); // sig_past_001 (with reply) and sig_future_003 (root)

    const pastRoot = trees.find((t) => t.header.signature === "sig_past_001");
    expect(pastRoot).toBeDefined();
    expect(pastRoot.replies).toHaveLength(1);
    expect(pastRoot.replies[0].header.signature).toBe("sig_present_002");
  });

  it("computes spatial clusters correctly", () => {
    const clusters = computeSpatialClusters(sampleMessages, 4);
    expect(clusters.length).toBeGreaterThanOrEqual(2);

    const bueCluster = clusters.find((c) => c.geohash === "6gyf");
    expect(bueCluster).toBeDefined();
    expect(bueCluster?.count).toBe(2);

    const nyCluster = clusters.find((c) => c.geohash === "dr5r");
    expect(nyCluster).toBeDefined();
    expect(nyCluster?.count).toBe(1);
  });

  it("computes temporal distribution breakdown across Past, Present, and Future", () => {
    const distribution = computeTemporalDistribution(sampleMessages);
    expect(distribution.total).toBe(3);
    expect(distribution.pastCount).toBe(1);
    expect(distribution.presentCount).toBe(1);
    expect(distribution.futureCount).toBe(1);
    expect(distribution.epochs.length).toBeGreaterThan(0);
  });
});
