import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  initDB,
  closeDB,
  saveMessage,
  saveMessages,
  getMessagesByGeohash,
  getAllMessages,
  togglePin,
  saveContact,
  getContacts,
  deleteContact,
  clearAll,
  deleteDatabase,
  normalizeMessageRecord,
  DB_NAME
} from "./db";

describe("IndexedDB Storage Module (db.ts)", () => {
  beforeEach(async () => {
    await initDB();
    await clearAll();
  });

  afterEach(async () => {
    closeDB();
    await deleteDatabase(DB_NAME);
  });

  describe("initDB", () => {
    it("initializes database with messages and contacts object stores and appropriate indexes", async () => {
      const db = await initDB();
      expect(db.name).toBe("handshake_db");
      expect(db.objectStoreNames.contains("messages")).toBe(true);
      expect(db.objectStoreNames.contains("contacts")).toBe(true);

      const tx = db.transaction(["messages", "contacts"], "readonly");
      const msgStore = tx.objectStore("messages");
      expect(msgStore.keyPath).toBe("signature");
      expect(msgStore.indexNames.contains("geohash")).toBe(true);
      expect(msgStore.indexNames.contains("timestamp")).toBe(true);
      expect(msgStore.indexNames.contains("author_pk")).toBe(true);
      expect(msgStore.indexNames.contains("parent_signature")).toBe(true);
      expect(msgStore.indexNames.contains("is_pinned")).toBe(true);

      const contactStore = tx.objectStore("contacts");
      expect(contactStore.keyPath).toBe("public_key");
      expect(contactStore.indexNames.contains("alias")).toBe(true);
      expect(contactStore.indexNames.contains("added_at")).toBe(true);
    });
  });

  describe("normalizeMessageRecord", () => {
    it("normalizes a message with nested header and location", () => {
      const raw = {
        header: {
          author_pk: "author123",
          timestamp: 1700000000,
          signature: "sig123",
          parent_signature: "parent000"
        },
        location: {
          geohash: "6gyf4a1"
        },
        content: {
          text: "Hello sovereign storage"
        }
      };

      const norm = normalizeMessageRecord(raw);
      expect(norm.signature).toBe("sig123");
      expect(norm.geohash).toBe("6gyf4a1");
      expect(norm.timestamp).toBe(1700000000);
      expect(norm.author_pk).toBe("author123");
      expect(norm.parent_signature).toBe("parent000");
      expect(norm.is_pinned).toBe(0);
      expect(norm.header.signature).toBe("sig123");
      expect(norm.anchor?.geohash || norm.location?.geohash).toBe("6gyf4a1");
    });

    it("throws error if message lacks signature", () => {
      expect(() => normalizeMessageRecord({ content: { text: "No sig" } })).toThrow();
    });
  });

  describe("saveMessage and getAllMessages", () => {
    it("persists a message and retrieves it", async () => {
      const msg = {
        header: {
          author_pk: "pk_alice",
          timestamp: 1600000001,
          signature: "sig_msg_1",
          parent_signature: null
        },
        location: {
          geohash: "6gyf4a1"
        },
        content: {
          text: "First message"
        }
      };

      await saveMessage(msg);
      const all = await getAllMessages();
      expect(all).toHaveLength(1);
      expect(all[0].signature).toBe("sig_msg_1");
      expect(all[0].content.text).toBe("First message");
      expect(all[0].geohash).toBe("6gyf4a1");
      expect(all[0].is_pinned).toBe(0);
    });

    it("preserves is_pinned when updating existing message without specifying is_pinned", async () => {
      const msg = {
        header: {
          author_pk: "pk_alice",
          timestamp: 1600000001,
          signature: "sig_pin_test",
          parent_signature: null
        },
        location: { geohash: "6gyf4a1" },
        content: { text: "Will be pinned" }
      };

      await saveMessage(msg);
      await togglePin("sig_pin_test", true);

      // Save updated content without is_pinned
      const updated = {
        ...msg,
        content: { text: "Updated text" }
      };
      await saveMessage(updated);

      const all = await getAllMessages();
      expect(all[0].content.text).toBe("Updated text");
      expect(all[0].is_pinned).toBe(1);
    });
  });

  describe("saveMessages (bulk insert)", () => {
    it("bulk inserts messages skipping duplicates within array and in db", async () => {
      const msg1 = {
        header: { author_pk: "pk1", timestamp: 100, signature: "sig1" },
        location: { geohash: "6gyf4a" },
        content: { text: "Message 1" }
      };
      const msg2 = {
        header: { author_pk: "pk2", timestamp: 200, signature: "sig2" },
        location: { geohash: "6gyf4b" },
        content: { text: "Message 2" }
      };
      const msg3 = {
        header: { author_pk: "pk3", timestamp: 300, signature: "sig3" },
        location: { geohash: "6gyf5a" },
        content: { text: "Message 3" }
      };

      // 1. Initial save of msg1
      await saveMessage(msg1);

      // 2. Bulk save [msg1 (existing), msg2 (new), msg2 (duplicate in batch), msg3 (new)]
      const insertedCount = await saveMessages([msg1, msg2, msg2, msg3]);
      expect(insertedCount).toBe(2);

      const all = await getAllMessages();
      expect(all).toHaveLength(3);
      const signatures = all.map(m => m.signature).sort();
      expect(signatures).toEqual(["sig1", "sig2", "sig3"]);
    });

    it("returns 0 for empty array", async () => {
      const count = await saveMessages([]);
      expect(count).toBe(0);
    });
  });

  describe("getMessagesByGeohash", () => {
    it("queries messages by geohash prefix", async () => {
      const msgs = [
        {
          header: { author_pk: "pk1", timestamp: 100, signature: "sig_geo1" },
          location: { geohash: "6gyf4a1" },
          content: { text: "Within 6gyf4" }
        },
        {
          header: { author_pk: "pk2", timestamp: 200, signature: "sig_geo2" },
          location: { geohash: "6gyf4b2" },
          content: { text: "Also within 6gyf4" }
        },
        {
          header: { author_pk: "pk3", timestamp: 300, signature: "sig_geo3" },
          location: { geohash: "6gyf5z9" },
          content: { text: "Within 6gyf5 (different cell)" }
        },
        {
          header: { author_pk: "pk4", timestamp: 400, signature: "sig_geo4" },
          location: { geohash: "7abcd00" },
          content: { text: "Far away" }
        }
      ];

      await saveMessages(msgs);

      // Search prefix "6gyf4"
      const resPrefix = await getMessagesByGeohash("6gyf4");
      expect(resPrefix).toHaveLength(2);
      expect(resPrefix.map(m => m.signature).sort()).toEqual(["sig_geo1", "sig_geo2"]);

      // Search prefix "6gyf"
      const resBroad = await getMessagesByGeohash("6gyf");
      expect(resBroad).toHaveLength(3);

      // Search empty prefix -> returns all
      const resEmpty = await getMessagesByGeohash("");
      expect(resEmpty).toHaveLength(4);

      // Search non-existent prefix
      const resNone = await getMessagesByGeohash("9999");
      expect(resNone).toHaveLength(0);
    });
  });

  describe("togglePin", () => {
    it("pins and unpins a message", async () => {
      const msg = {
        header: { author_pk: "pk1", timestamp: 100, signature: "sig_pin" },
        location: { geohash: "6gyf4" },
        content: { text: "Pin test" }
      };
      await saveMessage(msg);

      await togglePin("sig_pin", true);
      let all = await getAllMessages();
      expect(all[0].is_pinned).toBe(1);

      await togglePin("sig_pin", false);
      all = await getAllMessages();
      expect(all[0].is_pinned).toBe(0);
    });

    it("throws error when trying to pin a non-existent signature", async () => {
      await expect(togglePin("non_existent_sig", true)).rejects.toThrow();
    });
  });

  describe("Contacts store", () => {
    it("saves, retrieves, and deletes trusted contacts", async () => {
      const contact1 = {
        public_key: "pubkey_bob",
        alias: "Bob Neighbor",
        added_at: 1700000000
      };
      const contact2 = {
        public_key: "pubkey_charlie",
        alias: "Charlie",
        added_at: 1700000010
      };

      await saveContact(contact1);
      await saveContact(contact2);

      const contacts = await getContacts();
      expect(contacts).toHaveLength(2);
      expect(contacts.find(c => c.public_key === "pubkey_bob")?.alias).toBe("Bob Neighbor");

      // Delete Bob
      await deleteContact("pubkey_bob");
      const remaining = await getContacts();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].public_key).toBe("pubkey_charlie");
    });

    it("throws error when contact lacks public_key", async () => {
      await expect(saveContact({ public_key: "" } as any)).rejects.toThrow();
    });
  });

  describe("clearAll", () => {
    it("clears messages and contacts", async () => {
      await saveMessage({
        header: { author_pk: "pk", timestamp: 1, signature: "s1" },
        location: { geohash: "6g" },
        content: { text: "msg" }
      });
      await saveContact({ public_key: "pk1", alias: "alias1", added_at: 1 });

      expect(await getAllMessages()).toHaveLength(1);
      expect(await getContacts()).toHaveLength(1);

      await clearAll();

      expect(await getAllMessages()).toHaveLength(0);
      expect(await getContacts()).toHaveLength(0);
    });
  });
});
