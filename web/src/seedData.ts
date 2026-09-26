import { loadKeyPair, toHex, signMessage, encodeGeohash } from "./utils";

// Deterministic seed for sample seeded custodian archive
const DEMO_SEED = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

export function generateSeedArchives(): any[] {
  const kp = loadKeyPair(DEMO_SEED);
  const authorPk = toHex(kp.publicKey);

  const now = Math.floor(Date.now() / 1000);
  const oneDay = 86400;

  // 1. PAST: Historical Documentation / Seeded Archive
  const pastTimestamp = now - 3 * oneDay; // 3 days ago
  const pastCoords = { lat: -34.6037, lon: -58.3816 };
  const pastGeohash = encodeGeohash(pastCoords.lat, pastCoords.lon, 7);

  const pastGraffiti: any = {
    header: {
      author_pk: authorPk,
      timestamp: pastTimestamp,
      parent_signature: null,
      type: "archive"
    },
    location: {
      geohash: pastGeohash
    },
    content: {
      text: "🏛️ [Archivo Histórico Custodiado] Obelisco de Buenos Aires: Monumento histórico erigido en 1936 en la Plaza de la República. Preservado como nodo de memoria soberana en la red descentralizada."
    }
  };
  pastGraffiti.header.signature = signMessage(pastGraffiti, DEMO_SEED);

  // 2. PRESENT: Live Swarm Graffiti
  const presentTimestamp = now - 300; // 5 minutes ago
  const presentCoords = { lat: -34.6037, lon: -58.3816 };
  const presentGeohash = encodeGeohash(presentCoords.lat, presentCoords.lon, 7);

  const presentGraffiti: any = {
    header: {
      author_pk: authorPk,
      timestamp: presentTimestamp,
      parent_signature: null,
      type: "live"
    },
    location: {
      geohash: presentGeohash
    },
    content: {
      text: "⚡ [Enjambre en Vivo] ¡Transmisión P2P activa! Cada mensaje en Handshake es una unidad soberana anclada en espacio y tiempo, sin servidores centrales."
    }
  };
  presentGraffiti.header.signature = signMessage(presentGraffiti, DEMO_SEED);

  // 2b. PRESENT REPLY: Live Reply in thread
  const replyTimestamp = now - 60; // 1 minute ago
  const replyGraffiti: any = {
    header: {
      author_pk: authorPk,
      timestamp: replyTimestamp,
      parent_signature: presentGraffiti.header.signature,
      type: "live"
    },
    location: {
      geohash: presentGeohash
    },
    content: {
      text: "💬 Enlace confirmado por WebRTC Strata-Sync. Firma criptográfica Ed25519 verificada satisfactoriamente."
    }
  };
  replyGraffiti.header.signature = signMessage(replyGraffiti, DEMO_SEED);

  // 3. FUTURE: Scheduled Rendezvous / Time Capsule
  const futureTimestamp = now + 5 * oneDay; // 5 days in the future
  const futureCoords = { lat: -34.6083, lon: -58.3712 }; // Plaza de Mayo
  const futureGeohash = encodeGeohash(futureCoords.lat, futureCoords.lon, 7);

  const futureGraffiti: any = {
    header: {
      author_pk: authorPk,
      timestamp: futureTimestamp,
      parent_signature: null,
      type: "capsule"
    },
    location: {
      geohash: futureGeohash
    },
    content: {
      text: "⏳ [Cápsula Temporal] Encuentro Soberano Cypherpunk 2026: Punto de reunión programado en Plaza de Mayo. Desbloqueo temporal sincronizado para la comunidad distribuida."
    }
  };
  futureGraffiti.header.signature = signMessage(futureGraffiti, DEMO_SEED);

  return [pastGraffiti, presentGraffiti, replyGraffiti, futureGraffiti];
}
