import { verifyMessage, getMessageGeohash } from "./utils";

/**
 * P2P WebRTC DataChannel Message Types (Pillar 5: Inventory-First Negotiation)
 */

export interface InventoryMessage {
  type: "inventory";
  geohash: string;
  signatures: string[];
}

export interface RequestMissingMessage {
  type: "request_missing";
  signatures: string[];
}

export interface SyncResponseMessage {
  type: "sync_response";
  messages: any[];
  graffitis?: any[];
}

export interface LegacyRequestSyncMessage {
  type: "request_sync";
  geohash: string;
}

export type DataChannelSyncMessage =
  | InventoryMessage
  | RequestMissingMessage
  | SyncResponseMessage
  | LegacyRequestSyncMessage;

/**
 * Validates an incoming inventory message.
 */
export function isValidInventoryMessage(data: unknown): data is InventoryMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as any).type === "inventory" &&
    typeof (data as any).geohash === "string" &&
    (data as any).geohash.length > 0 &&
    Array.isArray((data as any).signatures) &&
    (data as any).signatures.every((sig: unknown) => typeof sig === "string")
  );
}

/**
 * Validates an incoming request_missing message.
 */
export function isValidRequestMissingMessage(data: unknown): data is RequestMissingMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as any).type === "request_missing" &&
    Array.isArray((data as any).signatures) &&
    (data as any).signatures.every((sig: unknown) => typeof sig === "string")
  );
}

/**
 * Filters messages matching a spatial geohash prefix and extracts their unique signatures.
 * Defaults to 5-character geohash prefix (~4.9 km x 4.9 km matching spatial swarms).
 */
export function filterSignaturesByGeohash(
  messages: any[],
  geohash: string,
  prefixLength: number = 5
): string[] {
  if (!geohash || typeof geohash !== "string" || !Array.isArray(messages)) {
    return [];
  }
  const prefix = geohash.substring(0, prefixLength);
  const signatures = new Set<string>();

  for (const m of messages) {
    if (
      m &&
      getMessageGeohash(m).startsWith(prefix) &&
      m.header &&
      typeof m.header.signature === "string" &&
      m.header.signature.length > 0
    ) {
      signatures.add(m.header.signature);
    }
  }

  return Array.from(signatures);
}

/**
 * Diffs incoming remote signatures against known local signatures.
 * Returns only the signatures missing from the local collection (demand-driven).
 */
export function diffInventory(
  remoteSignatures: string[],
  localSignatures: Set<string> | string[]
): string[] {
  if (!Array.isArray(remoteSignatures)) {
    return [];
  }
  const localSet = localSignatures instanceof Set ? localSignatures : new Set(localSignatures);
  const missing = new Set<string>();

  for (const sig of remoteSignatures) {
    if (typeof sig === "string" && sig.length > 0 && !localSet.has(sig)) {
      missing.add(sig);
    }
  }

  return Array.from(missing);
}

/**
 * Resolves full message payloads for a specific list of requested signatures.
 */
export function findMessagesBySignatures(
  messages: any[],
  requestedSignatures: string[]
): any[] {
  if (!Array.isArray(messages) || !Array.isArray(requestedSignatures)) {
    return [];
  }
  const reqSet = new Set(requestedSignatures);
  const result: any[] = [];
  const seen = new Set<string>();

  for (const m of messages) {
    const sig = m?.header?.signature;
    if (sig && typeof sig === "string" && reqSet.has(sig) && !seen.has(sig)) {
      result.push(m);
      seen.add(sig);
    }
  }

  return result;
}

export const findGraffitisBySignatures = findMessagesBySignatures;

/**
 * Processes incoming messages from a sync_response:
 * - Verifies Ed25519 cryptographic signature (Zero-Trust Transport).
 * - Discards any items already present in the existing signatures collection.
 * Returns only verified, genuinely new messages.
 */
export function processIncomingMessages(
  incomingMessages: any[],
  existingSignatures: Set<string> | string[]
): any[] {
  if (!Array.isArray(incomingMessages)) {
    return [];
  }
  const existingSet = existingSignatures instanceof Set ? existingSignatures : new Set(existingSignatures);
  const accepted: any[] = [];
  const addedInBatch = new Set<string>();

  for (const item of incomingMessages) {
    if (item && typeof item === "object" && verifyMessage(item)) {
      const sig = item.header?.signature;
      if (sig && typeof sig === "string" && !existingSet.has(sig) && !addedInBatch.has(sig)) {
        accepted.push(item);
        addedInBatch.add(sig);
      }
    }
  }

  return accepted;
}

export const processIncomingGraffitis = processIncomingMessages;
