/**
 * Handshake Local-First Sovereign Storage Module (Pillar 4 Alignment)
 *
 * "Clients maintain and query their own local message storage, operating completely
 * independently of centralized servers for reads, writes, and thread reconstruction."
 *
 * Uses browser native IndexedDB API (zero runtime dependencies).
 */

export const DB_NAME = "handshake_db";
export const DB_VERSION = 1;
export const STORE_MESSAGES = "messages";
export const STORE_CONTACTS = "contacts";

export interface HandshakeMessage {
  version?: string;
  signature: string;
  header: {
    type?: string;
    owner_pk?: string | null;
    author_pk: string;
    parent_signature?: string | null;
    timestamp?: number;
    signature: string;
    [key: string]: any;
  };
  anchor?: {
    geohash: string;
    timestamp: number;
    coordinates?: { lat: number; lon: number };
    [key: string]: any;
  };
  location?: {
    geohash: string;
    proof?: {
      type: string;
      data: string;
      [key: string]: any;
    };
    [key: string]: any;
  };
  content: {
    text: string;
    [key: string]: any;
  };
  geohash?: string;
  timestamp?: number;
  author_pk?: string;
  parent_signature?: string | null;
  is_pinned?: number | boolean;
  is_local?: boolean;
  [key: string]: any;
}

export interface ContactRecord {
  public_key: string;
  alias: string;
  added_at: number;
}

let dbInstance: IDBDatabase | null = null;
let currentDbName = DB_NAME;

/**
 * Normalizes a raw message object into a standardized, indexable record.
 * Guarantees top-level and nested consistency for signature, geohash, timestamp,
 * author_pk, parent_signature, and is_pinned.
 */
export function normalizeMessageRecord(msg: any): HandshakeMessage {
  if (!msg || typeof msg !== "object") {
    throw new Error("Invalid message: must be a non-null object");
  }

  const signature = msg.signature || msg.header?.signature;
  if (!signature || typeof signature !== "string") {
    throw new Error("Message missing required signature");
  }

  const geohash = msg.geohash || msg.anchor?.geohash || msg.location?.geohash || "";
  const timestamp = typeof msg.timestamp === "number"
    ? msg.timestamp
    : (typeof msg.anchor?.timestamp === "number"
      ? msg.anchor.timestamp
      : (typeof msg.header?.timestamp === "number" ? msg.header.timestamp : 0));
  const author_pk = msg.author_pk || msg.header?.author_pk || "";
  const parent_signature = msg.parent_signature !== undefined
    ? msg.parent_signature
    : (msg.header?.parent_signature ?? null);
  const is_pinned = msg.is_pinned ? 1 : 0;

  return {
    ...msg,
    signature,
    header: {
      ...(msg.header || {}),
      signature,
      author_pk: msg.header?.author_pk || author_pk,
      parent_signature: msg.header?.parent_signature !== undefined ? msg.header.parent_signature : parent_signature,
    },
    anchor: {
      ...(msg.anchor || {}),
      geohash: msg.anchor?.geohash || geohash,
      timestamp: msg.anchor?.timestamp ?? timestamp,
    },
    content: msg.content || { text: "" },
    geohash,
    timestamp,
    author_pk,
    parent_signature,
    is_pinned,
  };
}

/**
 * Initializes and upgrades the IndexedDB database instance.
 */
export async function initDB(dbName: string = DB_NAME): Promise<IDBDatabase> {
  if (dbInstance && currentDbName === dbName) {
    return dbInstance;
  }

  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not supported in this environment"));
      return;
    }

    const request = indexedDB.open(dbName, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 1. Messages Object Store
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        const messagesStore = db.createObjectStore(STORE_MESSAGES, { keyPath: "signature" });
        messagesStore.createIndex("geohash", "geohash", { unique: false });
        messagesStore.createIndex("timestamp", "timestamp", { unique: false });
        messagesStore.createIndex("author_pk", "author_pk", { unique: false });
        messagesStore.createIndex("parent_signature", "parent_signature", { unique: false });
        messagesStore.createIndex("is_pinned", "is_pinned", { unique: false });
      }

      // 2. Contacts Object Store
      if (!db.objectStoreNames.contains(STORE_CONTACTS)) {
        const contactsStore = db.createObjectStore(STORE_CONTACTS, { keyPath: "public_key" });
        contactsStore.createIndex("alias", "alias", { unique: false });
        contactsStore.createIndex("added_at", "added_at", { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      currentDbName = dbName;

      dbInstance.onversionchange = () => {
        dbInstance?.close();
        dbInstance = null;
      };

      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error || new Error("Failed to open IndexedDB"));
    };
  });
}

/**
 * Closes the active IndexedDB connection.
 */
export function closeDB(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Persists a single message to IndexedDB.
 * Preserves existing pin state if not explicitly overridden.
 */
export async function saveMessage(msg: any): Promise<void> {
  const db = await initDB(currentDbName);
  const record = normalizeMessageRecord(msg);

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_MESSAGES], "readwrite");
    const store = tx.objectStore(STORE_MESSAGES);

    const getReq = store.get(record.signature);
    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (existing && existing.is_pinned && msg.is_pinned === undefined) {
        record.is_pinned = existing.is_pinned;
      }
      store.put(record);
    };

    getReq.onerror = () => {
      store.put(record);
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Transaction error in saveMessage"));
    tx.onabort = () => reject(tx.error || new Error("Transaction aborted in saveMessage"));
  });
}

/**
 * Bulk persists multiple messages, skipping duplicates in a single transaction.
 * Returns the number of newly inserted messages.
 */
export async function saveMessages(msgs: any[]): Promise<number> {
  if (!Array.isArray(msgs) || msgs.length === 0) {
    return 0;
  }

  const db = await initDB(currentDbName);

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_MESSAGES], "readwrite");
    const store = tx.objectStore(STORE_MESSAGES);
    let insertedCount = 0;
    const seenSignatures = new Set<string>();

    for (const rawMsg of msgs) {
      if (!rawMsg) continue;
      const sig = rawMsg.signature || rawMsg.header?.signature;
      if (!sig || seenSignatures.has(sig)) continue;
      seenSignatures.add(sig);

      try {
        const record = normalizeMessageRecord(rawMsg);
        const getReq = store.get(sig);
        getReq.onsuccess = () => {
          if (!getReq.result) {
            store.put(record);
            insertedCount++;
          }
        };
      } catch (err) {
        console.warn("Skipping invalid message in saveMessages:", err);
      }
    }

    tx.oncomplete = () => resolve(insertedCount);
    tx.onerror = () => reject(tx.error || new Error("Transaction error in saveMessages"));
    tx.onabort = () => reject(tx.error || new Error("Transaction aborted in saveMessages"));
  });
}

/**
 * Retrieves messages filtered by geohash prefix using the geohash index.
 */
export async function getMessagesByGeohash(prefix: string): Promise<HandshakeMessage[]> {
  const db = await initDB(currentDbName);

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_MESSAGES], "readonly");
    const store = tx.objectStore(STORE_MESSAGES);
    const index = store.index("geohash");

    let req: IDBRequest<any[]>;
    if (!prefix) {
      req = index.getAll();
    } else {
      const range = IDBKeyRange.bound(prefix, prefix + "\uffff", false, false);
      req = index.getAll(range);
    }

    req.onsuccess = () => {
      const results: HandshakeMessage[] = req.result || [];
      if (!prefix) {
        resolve(results);
      } else {
        resolve(results.filter((m) => (m.geohash || m.anchor?.geohash || m.location?.geohash || "").startsWith(prefix)));
      }
    };
    req.onerror = () => reject(req.error || new Error("Failed to query messages by geohash"));
  });
}

/**
 * Retrieves all messages stored locally in IndexedDB.
 */
export async function getAllMessages(): Promise<HandshakeMessage[]> {
  const db = await initDB(currentDbName);

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_MESSAGES], "readonly");
    const store = tx.objectStore(STORE_MESSAGES);
    const req = store.getAll();

    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error || new Error("Failed to get all messages"));
  });
}

/**
 * Toggles the pinned status of a message by its signature.
 */
export async function togglePin(signature: string, isPinned: boolean): Promise<void> {
  if (!signature) {
    throw new Error("Signature is required for togglePin");
  }
  const db = await initDB(currentDbName);

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_MESSAGES], "readwrite");
    const store = tx.objectStore(STORE_MESSAGES);
    const getReq = store.get(signature);

    getReq.onsuccess = () => {
      const record = getReq.result;
      if (!record) {
        reject(new Error(`Message with signature '${signature}' not found`));
        return;
      }
      record.is_pinned = isPinned ? 1 : 0;
      store.put(record);
    };

    getReq.onerror = () => reject(getReq.error || new Error("Failed to find message to pin"));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Transaction error in togglePin"));
    tx.onabort = () => reject(tx.error || new Error("Transaction aborted in togglePin"));
  });
}

/**
 * Persists a trusted contact to the contacts object store.
 */
export async function saveContact(contact: { public_key: string; alias?: string; added_at?: number }): Promise<void> {
  if (!contact || !contact.public_key) {
    throw new Error("Contact missing required public_key");
  }
  const db = await initDB(currentDbName);

  const record: ContactRecord = {
    public_key: contact.public_key,
    alias: contact.alias || contact.public_key.substring(0, 8),
    added_at: typeof contact.added_at === "number" ? contact.added_at : Date.now(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_CONTACTS], "readwrite");
    const store = tx.objectStore(STORE_CONTACTS);
    store.put(record);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Transaction error in saveContact"));
    tx.onabort = () => reject(tx.error || new Error("Transaction aborted in saveContact"));
  });
}

/**
 * Retrieves all stored contacts from IndexedDB.
 */
export async function getContacts(): Promise<ContactRecord[]> {
  const db = await initDB(currentDbName);

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_CONTACTS], "readonly");
    const store = tx.objectStore(STORE_CONTACTS);
    const req = store.getAll();

    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error || new Error("Failed to get contacts"));
  });
}

/**
 * Deletes a trusted contact by public key.
 */
export async function deleteContact(publicKey: string): Promise<void> {
  if (!publicKey) return;
  const db = await initDB(currentDbName);

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_CONTACTS], "readwrite");
    const store = tx.objectStore(STORE_CONTACTS);
    store.delete(publicKey);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Transaction error in deleteContact"));
    tx.onabort = () => reject(tx.error || new Error("Transaction aborted in deleteContact"));
  });
}

/**
 * Clears all stored messages and contacts (useful for tests or complete node reset).
 */
export async function clearAll(): Promise<void> {
  const db = await initDB(currentDbName);

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_MESSAGES, STORE_CONTACTS], "readwrite");
    tx.objectStore(STORE_MESSAGES).clear();
    tx.objectStore(STORE_CONTACTS).clear();

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Failed to clear stores"));
  });
}

/**
 * Closes and completely deletes the IndexedDB database.
 */
export async function deleteDatabase(dbName: string = DB_NAME): Promise<void> {
  closeDB();

  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      resolve();
      return;
    }
    const req = indexedDB.deleteDatabase(dbName);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error("Failed to delete database"));
    req.onblocked = () => resolve();
  });
}
