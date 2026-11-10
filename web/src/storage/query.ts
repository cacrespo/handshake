import { getMessageGeohash, getMessageTimestamp, decodeGeohash } from "../utils";

export type TemporalDimension = "all" | "past" | "present" | "future" | "epoch" | "custom";

export interface TemporalFilter {
  dimension: TemporalDimension;
  epoch?: string; // e.g. "2026-11"
  dayOffset?: number; // slider offset relative to today
  customStart?: number; // unix timestamp in seconds
  customEnd?: number; // unix timestamp in seconds
  label?: string;
}

export interface SpatialCluster {
  geohash: string;
  count: number;
  lat: number;
  lon: number;
  latestTimestamp: number;
}

export interface TemporalDistribution {
  pastCount: number;
  presentCount: number;
  futureCount: number;
  total: number;
  epochs: {
    epoch: string;
    count: number;
    category: "past" | "present" | "future";
  }[];
}

export interface FilterOptions {
  selectedGeohash?: string | null;
  temporalFilter?: TemporalFilter;
  searchQuery?: string;
  categoryFilter?: "all" | "trusted" | "local" | "pinned" | "mine";
  userPublicKey?: string;
  trustedAuthors?: string[];
  pinnedSignatures?: Set<string>;
  userCoords?: [number, number];
  visibilityRadius?: number; // in meters, defaults to 0 (no radius filter)
}

/**
 * Returns the start and end unix timestamps (in seconds) for today in local time.
 */
export function getTodayBounds(): { start: number; end: number } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return {
    start: Math.floor(start.getTime() / 1000),
    end: Math.floor(end.getTime() / 1000),
  };
}

/**
 * Categorizes a timestamp into past, present (today), or future.
 */
export function categorizeTimestamp(ts: number): "past" | "present" | "future" {
  const { start, end } = getTodayBounds();
  if (ts < start) return "past";
  if (ts > end) return "future";
  return "present";
}

/**
 * Formats epoch string (YYYY-MM) from timestamp.
 */
export function timestampToEpoch(ts: number): string {
  const d = new Date(ts * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Great-circle distance between two coordinates in meters.
 */
export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Primary spatial-temporal query function that evaluates messages against triad filters.
 */
export function queryMessages(messages: any[], options: FilterOptions = {}): any[] {
  const {
    selectedGeohash,
    temporalFilter = { dimension: "all" },
    searchQuery = "",
    categoryFilter = "all",
    userPublicKey = "",
    trustedAuthors = [],
    pinnedSignatures = new Set(),
    userCoords,
    visibilityRadius = 0,
  } = options;

  const queryNormalized = searchQuery.trim().toLowerCase();
  const { start: todayStart, end: todayEnd } = getTodayBounds();

  return messages.filter((msg) => {
    if (!msg) return false;

    const sig = msg.header?.signature || msg.signature;
    const author = msg.header?.author_pk || msg.author_pk || "";
    const msgGh = getMessageGeohash(msg);
    const msgTs = getMessageTimestamp(msg);
    const text = msg.content?.text || "";

    // 1. Spatial Filtering
    if (selectedGeohash) {
      if (!msgGh || !msgGh.toLowerCase().startsWith(selectedGeohash.toLowerCase())) {
        return false;
      }
    } else if (visibilityRadius > 0 && userCoords) {
      // Proximity visibility fallback if no specific geohash filter
      const isMine = author === userPublicKey;
      const isPinned = pinnedSignatures.has(sig) || msg.is_pinned === 1;
      if (!isMine && !isPinned) {
        try {
          const coords = decodeGeohash(msgGh);
          const dist = getDistance(userCoords[0], userCoords[1], coords.lat, coords.lon);
          const isTrusted = trustedAuthors.includes(author);
          const maxDist = isTrusted ? visibilityRadius * 5 : visibilityRadius;
          if (dist > maxDist) return false;
        } catch {
          return false;
        }
      }
    }

    // 2. Temporal Filtering
    if (temporalFilter.dimension === "past") {
      if (msgTs >= todayStart) return false;
    } else if (temporalFilter.dimension === "present") {
      if (msgTs < todayStart || msgTs > todayEnd) return false;
    } else if (temporalFilter.dimension === "future") {
      if (msgTs <= todayEnd) return false;
    } else if (temporalFilter.dimension === "epoch" && temporalFilter.epoch) {
      const msgEpoch = timestampToEpoch(msgTs);
      if (msgEpoch !== temporalFilter.epoch) return false;
    } else if (temporalFilter.dimension === "custom") {
      if (temporalFilter.customStart !== undefined && msgTs < temporalFilter.customStart) return false;
      if (temporalFilter.customEnd !== undefined && msgTs > temporalFilter.customEnd) return false;
    }

    // 3. Category Filtering
    if (categoryFilter === "trusted") {
      if (!trustedAuthors.includes(author)) return false;
    } else if (categoryFilter === "local") {
      if (!msg.is_local && !options.pinnedSignatures?.has(sig)) return false;
    } else if (categoryFilter === "pinned") {
      if (!pinnedSignatures.has(sig) && msg.is_pinned !== 1) return false;
    } else if (categoryFilter === "mine") {
      if (author !== userPublicKey) return false;
    }

    // 4. Text / Search Query Filtering
    if (queryNormalized.length > 0) {
      const matchesText = text.toLowerCase().includes(queryNormalized);
      const matchesAuthor = author.toLowerCase().includes(queryNormalized);
      const matchesGeohash = msgGh.toLowerCase().includes(queryNormalized);
      if (!matchesText && !matchesAuthor && !matchesGeohash) return false;
    }

    return true;
  });
}

/**
 * Builds conversational thread tree from flat message list.
 */
export function buildThreadTrees(graffitis: any[]): any[] {
  const map: { [sig: string]: any & { replies: any[] } } = {};
  graffitis.forEach((g) => {
    const sig = g.header?.signature || g.signature;
    if (sig) {
      map[sig] = { ...g, replies: [] };
    }
  });

  const roots: any[] = [];
  graffitis.forEach((g) => {
    const sig = g.header?.signature || g.signature;
    if (!sig) return;
    const mapped = map[sig];
    const parentSig = g.header?.parent_signature ?? g.parent_signature;
    if (parentSig && map[parentSig]) {
      map[parentSig].replies.push(mapped);
    } else {
      roots.push(mapped);
    }
  });

  // Sort roots by timestamp descending (newest first for hero feed) or chronological
  roots.sort((a, b) => getMessageTimestamp(b) - getMessageTimestamp(a));

  const sortReplies = (node: any) => {
    node.replies.sort((a: any, b: any) => getMessageTimestamp(a) - getMessageTimestamp(b));
    node.replies.forEach(sortReplies);
  };
  roots.forEach(sortReplies);

  return roots;
}

/**
 * Computes spatial clusters grouped by geohash prefix.
 */
export function computeSpatialClusters(messages: any[], precision = 4): SpatialCluster[] {
  const clusterMap: {
    [prefix: string]: {
      count: number;
      latSum: number;
      lonSum: number;
      latestTimestamp: number;
    };
  } = {};

  messages.forEach((msg) => {
    const gh = getMessageGeohash(msg);
    if (!gh || gh.length < precision) return;
    const prefix = gh.substring(0, precision);
    const ts = getMessageTimestamp(msg);

    try {
      const coords = decodeGeohash(gh);
      if (!clusterMap[prefix]) {
        clusterMap[prefix] = {
          count: 0,
          latSum: 0,
          lonSum: 0,
          latestTimestamp: 0,
        };
      }
      clusterMap[prefix].count++;
      clusterMap[prefix].latSum += coords.lat;
      clusterMap[prefix].lonSum += coords.lon;
      if (ts > clusterMap[prefix].latestTimestamp) {
        clusterMap[prefix].latestTimestamp = ts;
      }
    } catch {
      // ignore invalid coordinates
    }
  });

  return Object.entries(clusterMap)
    .map(([geohash, data]) => ({
      geohash,
      count: data.count,
      lat: data.latSum / data.count,
      lon: data.lonSum / data.count,
      latestTimestamp: data.latestTimestamp,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Computes temporal distribution across Past, Present, and Future.
 */
export function computeTemporalDistribution(messages: any[]): TemporalDistribution {
  const { start: todayStart, end: todayEnd } = getTodayBounds();
  let pastCount = 0;
  let presentCount = 0;
  let futureCount = 0;

  const epochMap: { [epoch: string]: number } = {};

  messages.forEach((msg) => {
    const ts = getMessageTimestamp(msg);
    if (ts < todayStart) {
      pastCount++;
    } else if (ts > todayEnd) {
      futureCount++;
    } else {
      presentCount++;
    }

    const epoch = timestampToEpoch(ts);
    epochMap[epoch] = (epochMap[epoch] || 0) + 1;
  });

  const epochs = Object.entries(epochMap)
    .map(([epoch, count]) => {
      // Sample timestamp for the middle of that epoch month
      const [year, month] = epoch.split("-").map(Number);
      const sampleTs = Math.floor(new Date(year, (month || 1) - 1, 15).getTime() / 1000);
      return {
        epoch,
        count,
        category: categorizeTimestamp(sampleTs),
      };
    })
    .sort((a, b) => b.epoch.localeCompare(a.epoch));

  return {
    pastCount,
    presentCount,
    futureCount,
    total: messages.length,
    epochs,
  };
}
