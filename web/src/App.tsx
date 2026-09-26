import { useState, useEffect, useRef, useMemo } from "react";
import L from "leaflet";
import nacl from "tweetnacl";
import {
  Folder, RefreshCw, Upload, Download, MapPin,
  Clock, Send, Globe,
  Settings, Plus, X, Copy, Check, Shield, HardDrive, Terminal, MessageSquarePlus,
  Radio, Activity, Navigation
} from "lucide-react";
import "./App.css";
import type { GlobeMarker } from "./GlobeView";
import SpatialRadarPanel, { type MapStyle } from "./SpatialRadarPanel";
import MessageStreamPanel from "./MessageStreamPanel";
import TemporalHorizonPanel, { type EpochDimension } from "./TemporalHorizonPanel";
import { generateSeedArchives } from "./seedData";

// Fix Leaflet marker icons in Vite/React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

import {
  toHex,
  encodeGeohash,
  decodeGeohash,
  canonicalStringify,
  verifyMessage,
  loadKeyPair,
  getSeedFromKeyPair,
  exportKeyData,
  utf8ToBytes,
  signTrackerRegistration
} from "./utils";

interface LogEntry {
  text: string;
  type: "info" | "success" | "warning" | "danger";
  timestamp: string;
}

interface PeerInfo {
  peer_id: string;
}

export default function App() {
  const [coords, setCoords] = useState<[number, number]>([-34.6037, -58.3816]);
  const [gpsCoords, setGpsCoords] = useState<[number, number] | null>(null);
  const [viewMode, setViewMode] = useState<"globe" | "map">("globe");
  const [composerLocationMode, setComposerLocationMode] = useState<"parent" | "gps" | "picked">("picked");
  const [geohash, setGeohash] = useState<string>("");
  const [publicKey, setPublicKey] = useState<string>("");
  const [secretKey, setSecretKey] = useState<string>("");
  const [folderName, setFolderName] = useState<string>("");
  const [localGraffitis, setLocalGraffitis] = useState<any[]>([]);
  const [remoteGraffitis, setRemoteGraffitis] = useState<any[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [wsStatus, setWsStatus] = useState<"connected" | "disconnected" | "connecting">("disconnected");
  const [connectedPeers, setConnectedPeers] = useState<PeerInfo[]>([]);
  const [dayOffset, setDayOffset] = useState<number>(0);
  const [mapStyle, setMapStyle] = useState<MapStyle>("clean_light");
  const [showStyleMenu, setShowStyleMenu] = useState<boolean>(false);
  const [writeTimeMode, setWriteTimeMode] = useState<"slider" | "now" | "custom">("slider");
  const [customWriteDate, setCustomWriteDate] = useState<string>("");
  const [viewAllDays, setViewAllDays] = useState<boolean>(false);
  const [activeEpoch, setActiveEpoch] = useState<EpochDimension>("all");
  const [selectedZoneFilter, setSelectedZoneFilter] = useState<string | null>(null);
  const [selectedMessageSig, setSelectedMessageSig] = useState<string | null>(null);
  const [activeMobileTab, setActiveMobileTab] = useState<"messages" | "spatial" | "temporal">("messages");

  const getDayRange = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
    return {
      start: Math.floor(start.getTime() / 1000),
      end: Math.floor(end.getTime() / 1000)
    };
  };

  const getSelectedDayText = (offset: number) => {
    if (offset === 0) return "Hoy";
    if (offset === -1) return "Ayer";
    if (offset === 1) return "Mañana";
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toLocaleDateString("es-AR", { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const getTargetTimestamp = (): number => {
    if (writeTimeMode === "custom" && customWriteDate) {
      return Math.floor(new Date(customWriteDate).getTime() / 1000);
    }
    if (writeTimeMode === "slider" && dayOffset !== 0) {
      const d = new Date();
      d.setDate(d.getDate() + dayOffset);
      return Math.floor(d.getTime() / 1000);
    }
    return Math.floor(Date.now() / 1000);
  };

  const getTargetTimeLabel = (): string => {
    if (writeTimeMode === "custom" && customWriteDate) {
      return new Date(customWriteDate).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
    }
    if (writeTimeMode === "slider") {
      if (dayOffset === 0) return "Hoy (Ahora)";
      return `${getSelectedDayText(dayOffset)} (${dayOffset > 0 ? `+${dayOffset}d` : `${dayOffset}d`})`;
    }
    return "Ahora (Tiempo Real)";
  };
  const [newGraffitiContent, setNewGraffitiContent] = useState("");
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const getComposerActiveCoords = (): [number, number] => {
    if (composerLocationMode === "parent" && replyingTo) {
      try {
        const decoded = decodeGeohash(replyingTo.location.geohash);
        return [decoded.lat, decoded.lon];
      } catch (e) {
        return coords;
      }
    }
    if (composerLocationMode === "gps" && gpsCoords) {
      return gpsCoords;
    }
    return coords;
  };

  const activeComposerCoords = getComposerActiveCoords();
  const activeComposerGeohash = encodeGeohash(activeComposerCoords[0], activeComposerCoords[1]);

  const [trustedAuthors, setTrustedAuthors] = useState<string[]>([]);
  const [mapTarget, setMapTarget] = useState<[number, number] | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"identity" | "storage" | "network">("identity");
  const [copiedKey, setCopiedKey] = useState(false);
  const [folderHandle, setFolderHandle] = useState<any>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
    addLog("Clave pública copiada al portapapeles.", "info");
  };

  const ws = useRef<WebSocket | null>(null);
  const pcs = useRef<{ [peerId: string]: RTCPeerConnection }>({});
  const dataChannels = useRef<{ [peerId: string]: RTCDataChannel }>({});
  const localGraffitisRef = useRef<any[]>([]);
  const pendingCandidates = useRef<{ [peerId: string]: any[] }>({});

  // Keep ref up to date for async loops
  useEffect(() => {
    localGraffitisRef.current = localGraffitis;
  }, [localGraffitis]);

  const addLog = (text: string, type: "info" | "success" | "warning" | "danger" = "info") => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [{ text, type, timestamp }, ...prev].slice(0, 100));
  };

  // 1. Initialize Cryptographic Identity (Ed25519)
  useEffect(() => {
    const storedSec = localStorage.getItem("handshake_seckey");
    const storedTrust = localStorage.getItem("handshake_trust");
    if (storedTrust) {
      try {
        setTrustedAuthors(JSON.parse(storedTrust));
      } catch (e) {
        console.error(e);
      }
    }

    if (storedSec) {
      try {
        const kp = loadKeyPair(storedSec);
        const pubHex = toHex(kp.publicKey);
        const seedHex = toHex(getSeedFromKeyPair(kp));
        localStorage.setItem("handshake_pubkey", pubHex);
        localStorage.setItem("handshake_seckey", seedHex);
        setPublicKey(pubHex);
        setSecretKey(seedHex);
        addLog("Cryptographic identity loaded from localStorage", "success");
      } catch (e) {
        console.error("Error loading key from localStorage, generating new:", e);
        generateNewIdentity();
      }
    } else {
      generateNewIdentity();
    }

    // Try to get GPS
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          setCoords([lat, lon]);
          setGpsCoords([lat, lon]);
          const gh = encodeGeohash(lat, lon);
          setGeohash(gh);
          addLog(`GPS coordinates resolved: ${lat.toFixed(5)}, ${lon.toFixed(5)} (Geohash: ${gh})`, "info");
        },
        () => {
          addLog("Could not fetch GPS, defaulting to Buenos Aires coordinates.", "warning");
          setGeohash(encodeGeohash(-34.6037, -58.3816));
        }
      );
    } else {
      setGeohash(encodeGeohash(-34.6037, -58.3816));
    }
  }, []);

  // Auto-initialize demo seed archives across Past, Present, and Future
  useEffect(() => {
    const seeded = localStorage.getItem("handshake_seeded");
    if (!seeded) {
      const seeds = generateSeedArchives();
      setRemoteGraffitis(seeds);
      localStorage.setItem("handshake_seeded", "true");
      addLog("Corpus semilla de demostración inicializado (Pasado, Presente y Futuro).", "info");
    }
  }, []);

  // Update geohash when coords change
  useEffect(() => {
    const gh = encodeGeohash(coords[0], coords[1]);
    setGeohash(gh);
  }, [coords]);

  const generateNewIdentity = () => {
    const kp = nacl.sign.keyPair();
    const pubHex = toHex(kp.publicKey);
    const seedHex = toHex(getSeedFromKeyPair(kp));
    localStorage.setItem("handshake_pubkey", pubHex);
    localStorage.setItem("handshake_seckey", seedHex);
    setPublicKey(pubHex);
    setSecretKey(seedHex);
    addLog("Created new ephemeral identity", "success");
  };

  const exportKey = () => {
    if (!secretKey) return;
    try {
      const kp = loadKeyPair(secretKey);
      const keyData = JSON.stringify(exportKeyData(kp), null, 2);
      const blob = new Blob([keyData], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `handshake_identity_${publicKey.substring(0, 8)}.key`;
      a.click();
      URL.revokeObjectURL(url);
      addLog("Identity exported as .key file", "success");
    } catch (err: any) {
      addLog(`Error exporting key: ${err.message}`, "danger");
    }
  };

  const importKey = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const keys = JSON.parse(event.target?.result as string);
        const secKey = keys.private_key || keys.secretKey || keys.privateKey;
        if (secKey) {
          const kp = loadKeyPair(secKey);
          const derivedPubHex = toHex(kp.publicKey);
          const seedHex = toHex(getSeedFromKeyPair(kp));
          localStorage.setItem("handshake_pubkey", derivedPubHex);
          localStorage.setItem("handshake_seckey", seedHex);
          setPublicKey(derivedPubHex);
          setSecretKey(seedHex);
          addLog("Identity imported successfully!", "success");
        } else {
          addLog("Invalid .key format. Keys not found.", "danger");
        }
      } catch (err: any) {
        addLog(`Error parsing key file: ${err.message}`, "danger");
      }
    };
    reader.readAsText(file);
  };

  // 2. Select Local Folder (File System Access API)
  const selectLocalFolder = async () => {
    try {
      const handle = await (window as any).showDirectoryPicker();
      setFolderHandle(handle);
      setFolderName(handle.name);
      addLog(`Folder selected: '${handle.name}'. Scanning for graffitis...`, "info");
      
      const graffitis = await readDirectoryRecursive(handle);
      setLocalGraffitis(graffitis);
      addLog(`Found ${graffitis.length} valid local graffitis. Seeding started!`, "success");
      
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        announcePresence();
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        addLog(`File System API error: ${err.message}.`, "warning");
      }
    }
  };

  async function readDirectoryRecursive(dirHandle: any): Promise<any[]> {
    const list: any[] = [];
    for await (const entry of dirHandle.values()) {
      if (entry.kind === "file" && (entry.name.endsWith(".msg") || entry.name.endsWith(".keep"))) {
        const file = await entry.getFile();
        const text = await file.text();
        try {
          const json = JSON.parse(text);
          if (verifyMessage(json)) {
            list.push(json);
          } else {
            console.warn(`Skipping invalid/corrupted signature message: ${entry.name}`);
          }
        } catch (e) {
          console.error("JSON parse error on file", entry.name, e);
        }
      } else if (entry.kind === "directory") {
        const subList = await readDirectoryRecursive(entry);
        list.push(...subList);
      }
    }
    return list;
  }

  // 3. Connect to Tracker WebSocket
  const connectTracker = () => {
    if (ws.current) {
      ws.current.close();
    }

    setWsStatus("connecting");
    addLog("Connecting to Django Tracker signaling server...", "info");
    
    const socket = new WebSocket("ws://localhost:8000/ws/tracker/");
    ws.current = socket;

    socket.onopen = () => {
      setWsStatus("connected");
      addLog("Connected to Django Tracker!", "success");
      announcePresence();
    };

    socket.onclose = () => {
      setWsStatus("disconnected");
      setConnectedPeers([]);
      addLog("Disconnected from Django Tracker.", "danger");
      Object.keys(pcs.current).forEach(id => {
        pcs.current[id].close();
        delete pcs.current[id];
      });
      dataChannels.current = {};
    };

    socket.onerror = () => {
      addLog("Tracker connection error.", "danger");
    };

    socket.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === "peer_list") {
          addLog(`Received peer match list. Found ${data.peers.length} active neighbors.`, "info");
          setConnectedPeers(data.peers);
          for (const peer of data.peers) {
            if (publicKey < peer.peer_id) {
              initiatePeerConnection(peer.peer_id);
            }
          }
        } else if (data.type === "peer_joined") {
          addLog(`Peer entered our zone: ${data.peer_id.substring(0, 8)}...`, "info");
          setConnectedPeers(prev => {
            if (prev.some(p => p.peer_id === data.peer_id)) return prev;
            return [...prev, { peer_id: data.peer_id, geohash: data.geohash }];
          });
          if (publicKey < data.peer_id) {
            initiatePeerConnection(data.peer_id);
          }
        } else if (data.type === "peer_left") {
          addLog(`Peer left our zone: ${data.peer_id.substring(0, 8)}...`, "warning");
          setConnectedPeers(prev => prev.filter(p => p.peer_id !== data.peer_id));
          if (pcs.current[data.peer_id]) {
            pcs.current[data.peer_id].close();
            delete pcs.current[data.peer_id];
          }
          if (dataChannels.current[data.peer_id]) {
            delete dataChannels.current[data.peer_id];
          }
        } else if (data.type === "signal") {
          handleIncomingSignal(data.sender, data.signal);
        } else if (data.type === "error") {
          addLog(`[Tracker] ${data.code}: ${data.message}`, "danger");
        }
      } catch (err) {
        console.error("Error parsing WebSocket message:", err);
      }
    };
  };

  const announcePresence = () => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    if (!publicKey || !secretKey || !geohash) return;
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = signTrackerRegistration(publicKey, geohash, timestamp, secretKey);
      addLog(`Registering authenticated presence with Geohash: ${geohash}`, "info");
      ws.current.send(JSON.stringify({
        type: "register",
        peer_id: publicKey,
        geohash: geohash,
        timestamp: timestamp,
        signature: signature
      }));
    } catch (err) {
      console.error("Failed to sign presence challenge:", err);
      addLog("Failed to sign presence challenge.", "danger");
    }
  };

  // Trigger registration update on coordinates change
  useEffect(() => {
    if (wsStatus === "connected") {
      announcePresence();
    }
  }, [geohash]);

  // 4. WebRTC P2P Swarming
  const initiatePeerConnection = async (targetPeerId: string) => {
    addLog(`[P2P] Connecting to peer: ${targetPeerId.substring(0, 8)}...`, "info");
    
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    pcs.current[targetPeerId] = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate && ws.current) {
        ws.current.send(JSON.stringify({
          type: "signal",
          target: targetPeerId,
          signal: { candidate: event.candidate }
        }));
      }
    };

    const dc = pc.createDataChannel("strata-sync");
    setupDataChannel(targetPeerId, dc);
    dataChannels.current[targetPeerId] = dc;

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      if (ws.current) {
        ws.current.send(JSON.stringify({
          type: "signal",
          target: targetPeerId,
          signal: { sdp: offer }
        }));
      }
    } catch (err) {
      console.error("Error creating WebRTC offer:", err);
    }
  };

  const handleIncomingSignal = async (sender: string, signal: any) => {
    let pc: RTCPeerConnection | null | undefined = pcs.current[sender];
    
    // Si recibimos una oferta (offer), significa que se inicia una nueva negociación.
    // Descartamos cualquier conexión vieja o rota con ese peer para empezar de cero.
    if (pc && signal.sdp && signal.sdp.type === "offer") {
      try {
        pc.close();
      } catch (e) {}
      pc = null;
      delete pcs.current[sender];
      if (dataChannels.current[sender]) {
        delete dataChannels.current[sender];
      }
    }

    if (!pc) {
      addLog(`[P2P] Initializing connection response to: ${sender.substring(0, 8)}...`, "info");
      pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });
      pcs.current[sender] = pc;

      pc.onicecandidate = (event) => {
        if (event.candidate && ws.current) {
          ws.current.send(JSON.stringify({
            type: "signal",
            target: sender,
            signal: { candidate: event.candidate }
          }));
        }
      };

      pc.ondatachannel = (event) => {
        addLog(`[P2P] Received remote sync data channel from ${sender.substring(0, 8)}`, "success");
        setupDataChannel(sender, event.channel);
        dataChannels.current[sender] = event.channel;
      };
    }

    try {
      if (signal.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        if (signal.sdp.type === "offer") {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (ws.current) {
            ws.current.send(JSON.stringify({
              type: "signal",
              target: sender,
              signal: { sdp: answer }
            }));
          }
        }

        // Process any queued candidates
        const queue = pendingCandidates.current[sender] || [];
        for (const candidate of queue) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.error("Error applying queued candidate:", e);
          }
        }
        delete pendingCandidates.current[sender];
      } else if (signal.candidate) {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } else {
          if (!pendingCandidates.current[sender]) {
            pendingCandidates.current[sender] = [];
          }
          pendingCandidates.current[sender].push(signal.candidate);
        }
      }
    } catch (err) {
      console.error("Error setting signaling message:", err);
    }
  };

  const setupDataChannel = (peerId: string, dc: RTCDataChannel) => {
    dc.onopen = () => {
      addLog(`[P2P] Channel active with peer: ${peerId.substring(0, 8)}`, "success");
      dc.send(JSON.stringify({
        type: "request_sync",
        geohash: geohash
      }));
    };

    dc.onclose = () => {
      addLog(`[P2P] Channel closed with peer: ${peerId.substring(0, 8)}`, "warning");
    };

    dc.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "request_sync") {
          const filtered = localGraffitisRef.current.filter(g => 
            g.location.geohash.startsWith(data.geohash.substring(0, 5))
          );
          dc.send(JSON.stringify({
            type: "sync_response",
            graffitis: filtered
          }));
          addLog(`[P2P] Sent ${filtered.length} local graffitis to peer.`, "info");
        } else if (data.type === "sync_response") {
          const incoming = data.graffitis || [];
          let addedCount = 0;
          
          setRemoteGraffitis(prev => {
            const updated = [...prev];
            for (const item of incoming) {
              if (verifyMessage(item)) {
                const exists = updated.some(g => g.header.signature === item.header.signature) ||
                               localGraffitisRef.current.some(g => g.header.signature === item.header.signature);
                if (!exists) {
                  updated.push(item);
                  addedCount++;
                }
              }
            }
            return updated;
          });

          if (addedCount > 0) {
            addLog(`[P2P] Synced ${addedCount} new graffitis from peer!`, "success");
          } else {
            addLog("[P2P] Sync finished (no new graffitis found).", "info");
          }
        }
      } catch (err) {
        console.error("Error processing P2P message:", err);
      }
    };
  };

  // 5. Add / Create new Graffiti (Write & Sign in browser)
  const handleCreateGraffiti = async () => {
    if (!newGraffitiContent.trim()) return;
    if (!publicKey || !secretKey) {
      addLog("Cryptographic keys missing. Please generate/import keys.", "danger");
      return;
    }

    const targetTimestamp = getTargetTimestamp();
    const kp = loadKeyPair(secretKey);

    const messageToSign = {
      version: "1.0",
      header: {
        type: "PUBLIC",
        owner_pk: null,
        author_pk: publicKey,
        parent_signature: replyingTo ? replyingTo.header.signature : null,
        timestamp: targetTimestamp
      },
      location: {
        geohash: activeComposerGeohash,
        proof: {
          type: "GPS",
          data: `${activeComposerCoords[0].toFixed(6)},${activeComposerCoords[1].toFixed(6)}`
        }
      },
      content: {
        text: newGraffitiContent
      }
    };

    const signingString = canonicalStringify(messageToSign);
    const signingBytes = utf8ToBytes(signingString);
    const sigBytes = nacl.sign.detached(signingBytes, kp.secretKey);
    const signatureHex = toHex(sigBytes);

    const fullySignedMessage = {
      ...messageToSign,
      header: {
        ...messageToSign.header,
        signature: signatureHex
      }
    };

    await saveAndSeedMessage(fullySignedMessage);
    setCoords(activeComposerCoords);
    setGeohash(activeComposerGeohash);
    setNewGraffitiContent("");
    setReplyingTo(null);
    const dateFormatted = new Date(targetTimestamp * 1000).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
    addLog(`Created and signed space-time graffiti for: ${dateFormatted}!`, "success");

    Object.values(dataChannels.current).forEach(dc => {
      if (dc.readyState === "open") {
        dc.send(JSON.stringify({
          type: "sync_response",
          graffitis: [fullySignedMessage]
        }));
      }
    });
  };

  const toggleTrust = (authorPk: string) => {
    setTrustedAuthors(prev => {
      const updated = prev.includes(authorPk) 
        ? prev.filter(pk => pk !== authorPk) 
        : [...prev, authorPk];
      localStorage.setItem("handshake_trust", JSON.stringify(updated));
      addLog(
        prev.includes(authorPk) 
          ? `Removed author ${authorPk.substring(0,8)} from trust network.` 
          : `Handshaked & Trusted author ${authorPk.substring(0,8)}!`, 
        "success"
      );
      return updated;
    });
  };

  const saveAndSeedMessage = async (graf: any) => {
    if (!folderHandle) {
      setLocalGraffitis(prev => {
        if (prev.some(g => g.header.signature === graf.header.signature)) return prev;
        return [...prev, graf];
      });
      setRemoteGraffitis(prev => prev.filter(g => g.header.signature !== graf.header.signature));
      addLog("Guardado en memoria (selecciona una carpeta para guardarlo en disco)", "warning");
      return;
    }

    try {
      const dt = new Date(graf.header.timestamp * 1000);
      const epoch = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`; // YYYY-MM
      const baseStr = `${graf.location.geohash}:${epoch}`;
      const data = new TextEncoder().encode(baseStr);
      const hashBuffer = await crypto.subtle.digest("SHA-1", data);
      const infoHashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
      
      // Get or create info_hash subdirectory
      const subDirHandle = await folderHandle.getDirectoryHandle(infoHashHex, { create: true });
      const filename = `${graf.header.timestamp}_${graf.header.author_pk.substring(0, 8)}.msg`;
      
      const fileHandle = await subDirHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(graf, null, 2));
      await writable.close();
      
      // Update state
      setLocalGraffitis(prev => {
        if (prev.some(g => g.header.signature === graf.header.signature)) return prev;
        return [...prev, graf];
      });
      setRemoteGraffitis(prev => prev.filter(g => g.header.signature !== graf.header.signature));
      
      addLog(`Graffiti guardado en carpeta local y seedeando: ${filename}`, "success");
    } catch (err: any) {
      addLog(`Error al guardar graffiti en carpeta local: ${err.message}`, "danger");
    }
  };

  // Combine lists of graffitis to show on map and stream
  const allGraffitis = useMemo(() => [...localGraffitis, ...remoteGraffitis], [localGraffitis, remoteGraffitis]);

  // Filter by time AND spatial-temporal visibility mechanics (Handshake triad coordination)
  const filteredGraffitis = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startTodaySec = Math.floor(startOfToday.getTime() / 1000);

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const endTodaySec = Math.floor(endOfToday.getTime() / 1000);

    return allGraffitis.filter(g => {
      const ts = g.header?.timestamp || 0;

      // 1. Epoch Dimension Filter
      if (activeEpoch === "past" && ts >= startTodaySec) return false;
      if (activeEpoch === "present" && (ts < startTodaySec || ts > endTodaySec)) return false;
      if (activeEpoch === "future" && ts <= endTodaySec) return false;

      // 2. Day Range Filter (if viewAllDays is false and activeEpoch === "all")
      if (!viewAllDays && activeEpoch === "all") {
        const dayRange = getDayRange(dayOffset);
        if (ts < dayRange.start || ts > dayRange.end) {
          return false;
        }
      }

      // 3. Zone Geohash Filter
      if (selectedZoneFilter) {
        if (!g.location?.geohash?.startsWith(selectedZoneFilter)) {
          return false;
        }
      }

      return true;
    });
  }, [allGraffitis, activeEpoch, viewAllDays, dayOffset, selectedZoneFilter]);

  // Map markers for the 3D Globe visualization (Radio Garden / Radio Atlas)
  const globeMarkers: GlobeMarker[] = useMemo(() => {
    const list: GlobeMarker[] = [];
    filteredGraffitis.forEach((g, idx) => {
      try {
        const gCoords = decodeGeohash(g.location.geohash);
        const isLocal = localGraffitis.some(lg => lg.header?.signature === g.header?.signature);
        const isTrusted = trustedAuthors.includes(g.header?.author_pk);
        list.push({
          id: g.header?.signature || `g-${idx}`,
          lat: gCoords.lat,
          lon: gCoords.lon,
          geohash: g.location.geohash,
          text: g.content?.text || "",
          author: g.header?.author_pk || "Unknown",
          timestamp: g.header?.timestamp || 0,
          isLocal,
          isTrusted,
          raw: g
        });
      } catch {
        // Ignore invalid geohash
      }
    });
    return list;
  }, [filteredGraffitis, localGraffitis, trustedAuthors]);

  const handleSelectMessage = (graf: any) => {
    setSelectedMessageSig(graf.header?.signature || null);
    try {
      const gCoords = decodeGeohash(graf.location?.geohash);
      setCoords([gCoords.lat, gCoords.lon]);
      setMapTarget([gCoords.lat, gCoords.lon]);
      addLog(`Radar enfocado en coordenadas: ${gCoords.lat.toFixed(4)}, ${gCoords.lon.toFixed(4)}`, "info");
    } catch {
      // ignore
    }
  };

  const handleSelectLocation = (lat: number, lon: number, markerData?: any) => {
    setCoords([lat, lon]);
    setMapTarget([lat, lon]);
    if (markerData && markerData.raw) {
      setSelectedMessageSig(markerData.raw.header?.signature || null);
    }
  };

  const handleToggleZoneFilter = (zone: string) => {
    if (selectedZoneFilter === zone) {
      setSelectedZoneFilter(null);
      addLog("Filtro de celda espacial desactivado.", "info");
    } else {
      setSelectedZoneFilter(zone);
      addLog(`Filtro de celda espacial activo: ${zone}`, "info");
    }
  };

  const handleClearZoneFilter = () => {
    setSelectedZoneFilter(null);
    addLog("Filtro de celda espacial desactivado.", "info");
  };

  const handleSelectEpoch = (epoch: EpochDimension) => {
    setActiveEpoch(epoch);
    if (epoch !== "all") {
      setViewAllDays(false);
    }
    addLog(`Época temporal seleccionada: ${epoch.toUpperCase()}`, "info");
  };

  const handleCenterUserLocation = () => {
    if (gpsCoords) {
      setCoords(gpsCoords);
      setMapTarget(gpsCoords);
      addLog(`Radar centrado en GPS: ${gpsCoords[0].toFixed(4)}, ${gpsCoords[1].toFixed(4)}`, "info");
    } else {
      setCoords([-34.6037, -58.3816]);
      setMapTarget([-34.6037, -58.3816]);
      addLog("Radar centrado en coordenadas por defecto (Buenos Aires)", "info");
    }
  };

  const handleLoadSeedArchives = () => {
    const seeds = generateSeedArchives();
    setRemoteGraffitis(prev => {
      const combined = [...prev];
      seeds.forEach(s => {
        if (!combined.some(g => g.header?.signature === s.header?.signature)) {
          combined.push(s);
        }
      });
      return combined;
    });
    addLog("Semillas del protocolo cargadas con éxito en las 3 dimensiones.", "success");
  };

  return (
    <div id="root">
      <header className="app-header">
        <div className="logo-container">
          <div className="logo-badge">
            <Radio size={18} style={{ color: "var(--neon-cyan)" }} />
          </div>
          <div>
            <div className="logo-text">Handshake</div>
            <div className="subtitle">Space-Time Conexions</div>
          </div>
        </div>

        {/* Center P2P Live HUD */}
        <div className="header-p2p-hud">
          <div className={`hud-pill ${connectedPeers.length > 0 ? "active" : ""}`} title="Nodos P2P WebRTC conectados">
            <div className={`p2p-pulse-dot ${connectedPeers.length > 0 ? "emerald" : "amber"}`} />
            <span>Peers: <code>{connectedPeers.length}</code></span>
          </div>

          <div className="hud-pill" title="Geohash espacial activo">
            <Navigation size={12} style={{ color: "var(--neon-cyan)" }} />
            <span>Celda: <code>{geohash.substring(0, 7)}</code></span>
          </div>

          <div className="hud-pill" title="Estado de sincronización Strata-Sync">
            <Activity size={12} style={{ color: wsStatus === "connected" ? "var(--neon-emerald)" : "var(--neon-amber)" }} />
            <span>Strata-Sync: <code style={{ color: wsStatus === "connected" ? "var(--neon-emerald)" : "var(--neon-amber)" }}>{wsStatus === "connected" ? "Live" : "Standby"}</code></span>
          </div>
        </div>

        <div className="header-status">
          <button 
            className="btn btn-primary btn-header-write"
            onClick={() => {
              setReplyingTo(null);
              setComposerLocationMode("picked");
              setIsComposerOpen(true);
            }}
            title="Escribir graffiti en las coordenadas seleccionadas"
          >
            <Plus size={16} />
            <span>Pintar Graffiti</span>
          </button>
          
          <button 
            className={`btn btn-secondary ${isSettingsOpen ? 'btn-active-toggle' : ''}`}
            onClick={() => setIsSettingsOpen(true)}
            title="Configuración de Nodo, Identidad y Logs"
          >
            <Settings size={15} />
            <span>Nodo & Ajustes</span>
          </button>

          <button 
            className="btn btn-secondary"
            onClick={() => setIsHelpOpen(true)}
            title="Información sobre el protocolo"
          >
            ❔ Ayuda
          </button>

          <button 
            className="btn btn-secondary"
            onClick={connectTracker}
            disabled={wsStatus === "connecting"}
            title="Reconectar con el Tracker"
            style={{ height: "34px", padding: "6px 12px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <span className={`status-dot ${wsStatus === "connected" ? "active" : "inactive"}`}></span>
            Tracker: {wsStatus === "connected" ? "Online" : wsStatus === "connecting" ? "..." : "Offline"}
          </button>
        </div>
      </header>

      {/* Mobile Navigation Tabs (for screens < 1024px) */}
      <nav className="mobile-triad-tabs" aria-label="Navegación espacial-temporal">
        <button
          className={`mobile-tab-btn ${activeMobileTab === "messages" ? "active" : ""}`}
          onClick={() => setActiveMobileTab("messages")}
        >
          <MessageSquarePlus size={15} />
          <span>Mensajes (50%)</span>
          <span className="mobile-tab-count">{filteredGraffitis.length}</span>
        </button>
        <button
          className={`mobile-tab-btn ${activeMobileTab === "spatial" ? "active" : ""}`}
          onClick={() => setActiveMobileTab("spatial")}
        >
          <Radio size={15} />
          <span>Radar (25%)</span>
        </button>
        <button
          className={`mobile-tab-btn ${activeMobileTab === "temporal" ? "active" : ""}`}
          onClick={() => setActiveMobileTab("temporal")}
        >
          <Clock size={15} />
          <span>Tiempo (25%)</span>
        </button>
      </nav>

      {/* The Space-Time Triad Layout Cockpit (50% Messages, 25% Space, 25% Time) */}
      <div className="triad-cockpit">
        {/* Panel 1: Spatial Radar Panel (25%) */}
        <div className={`triad-column spatial-column ${activeMobileTab === "spatial" ? "mobile-active" : ""}`}>
          <SpatialRadarPanel
            coords={coords}
            gpsCoords={gpsCoords}
            geohash={geohash}
            selectedZoneFilter={selectedZoneFilter}
            viewMode={viewMode}
            mapStyle={mapStyle}
            showStyleMenu={showStyleMenu}
            mapTarget={mapTarget}
            globeMarkers={globeMarkers}
            filteredGraffitis={filteredGraffitis}
            localGraffitis={localGraffitis}
            trustedAuthors={trustedAuthors}
            publicKey={publicKey}
            onSetViewMode={setViewMode}
            onSelectLocation={handleSelectLocation}
            onClearMapTarget={() => setMapTarget(null)}
            onToggleStyleMenu={() => setShowStyleMenu(!showStyleMenu)}
            onSelectMapStyle={(style) => { setMapStyle(style); setShowStyleMenu(false); }}
            onToggleZoneFilter={handleToggleZoneFilter}
            onClearZoneFilter={handleClearZoneFilter}
            onCenterUserLocation={handleCenterUserLocation}
            onOpenComposerHere={() => {
              setReplyingTo(null);
              setComposerLocationMode("picked");
              setIsComposerOpen(true);
            }}
            onToggleTrust={toggleTrust}
            onSaveAndSeed={saveAndSeedMessage}
            onReplyTo={(graf) => {
              setReplyingTo(graf);
              setComposerLocationMode("parent");
              setIsComposerOpen(true);
            }}
          />
        </div>

        {/* Panel 2: Sovereign Message Stream & Threads (50% Hero) */}
        <div className={`triad-column message-column ${activeMobileTab === "messages" ? "mobile-active" : ""}`}>
          <MessageStreamPanel
            graffitis={filteredGraffitis}
            allGraffitisCount={allGraffitis.length}
            localGraffitis={localGraffitis}
            trustedAuthors={trustedAuthors}
            publicKey={publicKey}
            coords={coords}
            selectedZoneFilter={selectedZoneFilter}
            activeEpoch={activeEpoch}
            dayOffset={dayOffset}
            viewAllDays={viewAllDays}
            selectedMessageSig={selectedMessageSig}
            onSelectMessage={handleSelectMessage}
            onReplyTo={(graf) => {
              setReplyingTo(graf);
              setComposerLocationMode("parent");
              setIsComposerOpen(true);
            }}
            onToggleTrust={toggleTrust}
            onSaveAndSeed={saveAndSeedMessage}
            onClearZoneFilter={handleClearZoneFilter}
            onClearEpochFilter={() => setActiveEpoch("all")}
            onOpenComposer={() => {
              setReplyingTo(null);
              setComposerLocationMode("picked");
              setIsComposerOpen(true);
            }}
            onLoadSeedArchives={handleLoadSeedArchives}
          />
        </div>

        {/* Panel 3: Temporal Horizon Panel (25%) */}
        <div className={`triad-column temporal-column ${activeMobileTab === "temporal" ? "mobile-active" : ""}`}>
          <TemporalHorizonPanel
            activeEpoch={activeEpoch}
            dayOffset={dayOffset}
            viewAllDays={viewAllDays}
            allGraffitis={allGraffitis}
            onSelectEpoch={handleSelectEpoch}
            onSetDayOffset={(offset) => {
              setDayOffset(offset);
              if (viewAllDays) setViewAllDays(false);
            }}
            onToggleViewAllDays={() => setViewAllDays(!viewAllDays)}
            onLoadSeedArchives={handleLoadSeedArchives}
            onOpenComposerWithOffset={(offset) => {
              setDayOffset(offset);
              setReplyingTo(null);
              setIsComposerOpen(true);
            }}
          />
        </div>
      </div>

      {/* Floating Composer Modal (Punto 2) */}
      {isComposerOpen && (
        <div className="modal-overlay" onClick={() => setIsComposerOpen(false)}>
          <div className="modal-content composer-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <MessageSquarePlus size={20} style={{ color: "var(--accent)" }} />
                <h2 style={{ fontSize: "18px", fontWeight: 700 }}>Pintar Graffiti Espacio-Temporal</h2>
              </div>
              <button className="modal-close-btn" onClick={() => setIsComposerOpen(false)}>
                <X size={18} />
              </button>
            </div>

            {replyingTo && (
              <div className="composer-reply-banner">
                <div>
                  <span style={{ fontSize: "11px", color: "var(--accent)", fontWeight: 600 }}>RESPONDIENDO A:</span>
                  <div style={{ fontSize: "12px", color: "var(--text-primary)", fontStyle: "italic", marginTop: "2px" }}>
                    "{replyingTo.content.text.substring(0, 80)}{replyingTo.content.text.length > 80 ? '...' : ''}"
                  </div>
                </div>
                <button 
                  className="reply-cancel-btn"
                  onClick={() => setReplyingTo(null)}
                >
                  <X size={14} /> Cancelar hilo
                </button>
              </div>
            )}

            {/* Space-Time Indicators */}
            <div className="composer-meta-bar">
              <div className="composer-meta-item" title="Coordenadas espaciales donde se colocará el graffiti">
                <MapPin size={13} style={{ color: "var(--neon-cyan)" }} />
                <span>Geohash: <code>{activeComposerGeohash.substring(0, 7)}</code> ({activeComposerCoords[0].toFixed(4)}, {activeComposerCoords[1].toFixed(4)})</span>
              </div>
              <div className="composer-meta-item" title="Momento temporal de anclaje">
                <Clock size={13} style={{ color: "var(--neon-amber)" }} />
                <span className="composer-time-tag">{getTargetTimeLabel()}</span>
              </div>
            </div>

            {/* Sovereign Location Selector (Declarative Location Principle) */}
            <div className="composer-location-section">
              <div className="composer-location-title">
                <MapPin size={13} style={{ color: "var(--neon-cyan)" }} />
                <span>Ubicación Soberana de Publicación</span>
              </div>
              
              <div className="composer-location-options">
                {replyingTo && (
                  <button
                    type="button"
                    className={`loc-option-btn ${composerLocationMode === "parent" ? "active" : ""}`}
                    onClick={() => setComposerLocationMode("parent")}
                    title="Responder anclado en la misma ubicación del mensaje original"
                  >
                    <MapPin size={13} />
                    <span>Misma ubicación que mensaje original</span>
                  </button>
                )}

                <button
                  type="button"
                  className={`loc-option-btn ${composerLocationMode === "picked" ? "active" : ""}`}
                  onClick={() => setComposerLocationMode("picked")}
                  title="Anclar en las coordenadas seleccionadas en el mapa o globo"
                >
                  <Globe size={13} />
                  <span>Punto seleccionado en Mapa/Globo</span>
                </button>

                <button
                  type="button"
                  className={`loc-option-btn ${composerLocationMode === "gps" ? "active" : ""}`}
                  onClick={() => {
                    setComposerLocationMode("gps");
                    if (!gpsCoords && navigator.geolocation) {
                      navigator.geolocation.getCurrentPosition(
                        pos => {
                          const newGps: [number, number] = [pos.coords.latitude, pos.coords.longitude];
                          setGpsCoords(newGps);
                        },
                        () => {
                          addLog("No se pudo obtener coordenadas GPS.", "warning");
                        }
                      );
                    }
                  }}
                  title="Anclar en la posición GPS de tu dispositivo"
                >
                  <Navigation size={13} />
                  <span>GPS actual ({gpsCoords ? `${gpsCoords[0].toFixed(2)}, ${gpsCoords[1].toFixed(2)}` : "Detectar"})</span>
                </button>
              </div>

              <div className="composer-resolved-coords">
                <span>Geohash anclaje: <code>{activeComposerGeohash.substring(0, 7)}</code></span>
                <span>Lat/Lon: <code>{activeComposerCoords[0].toFixed(5)}, {activeComposerCoords[1].toFixed(5)}</code></span>
              </div>
            </div>

            {/* Time Mode Switcher */}
            <div className="composer-time-options">
              <button 
                type="button"
                className={`time-pill-btn ${writeTimeMode === 'slider' ? 'active' : ''}`}
                onClick={() => setWriteTimeMode('slider')}
                title="Anclar en el día seleccionado en la línea de tiempo del mapa"
              >
                ⏳ Línea de Tiempo ({getSelectedDayText(dayOffset)})
              </button>
              <button 
                type="button"
                className={`time-pill-btn ${writeTimeMode === 'now' ? 'active' : ''}`}
                onClick={() => setWriteTimeMode('now')}
                title="Anclar en el momento exacto actual"
              >
                ⚡ Ahora
              </button>
              <button 
                type="button"
                className={`time-pill-btn ${writeTimeMode === 'custom' ? 'active' : ''}`}
                onClick={() => setWriteTimeMode('custom')}
                title="Elegir una fecha u hora específica en el futuro o pasado"
              >
                📅 Fecha exacta
              </button>
            </div>

            {writeTimeMode === 'custom' && (
              <div className="custom-datetime-container">
                <input 
                  type="datetime-local" 
                  className="form-input custom-date-input"
                  value={customWriteDate}
                  onChange={(e) => setCustomWriteDate(e.target.value)}
                />
              </div>
            )}

            <div className="composer-textarea-wrapper">
              <textarea 
                className="form-input composer-textarea"
                rows={4}
                placeholder={replyingTo ? "Escribe tu respuesta al hilo..." : "Escribe el graffiti o huella que quedará anclado en este lugar y momento..."}
                value={newGraffitiContent}
                onChange={(e) => setNewGraffitiContent(e.target.value)}
                autoFocus
              />
              <div className="composer-footer-bar">
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  Firmado soberanamente con tu clave Ed25519
                </span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  {newGraffitiContent.length} caracteres
                </span>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setIsComposerOpen(false)}>
                Cancelar
              </button>
              <button 
                className="btn btn-primary btn-submit-graffiti" 
                onClick={async () => {
                  await handleCreateGraffiti();
                  setIsComposerOpen(false);
                }}
                disabled={!newGraffitiContent.trim()}
              >
                <Send size={15} />
                <span>Firmar y Pintar Graffiti</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Node & Settings Modal (Punto 3 - Oculta la parte técnica) */}
      {isSettingsOpen && (
        <div className="modal-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="modal-content settings-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Settings size={20} style={{ color: "var(--accent)" }} />
                <h2 style={{ fontSize: "18px", fontWeight: 700 }}>Panel de Nodo & Configuración</h2>
              </div>
              <button className="modal-close-btn" onClick={() => setIsSettingsOpen(false)}>
                <X size={18} />
              </button>
            </div>

            {/* Settings Tabs */}
            <div className="settings-nav-tabs">
              <button 
                className={`tab-btn ${settingsTab === 'identity' ? 'active' : ''}`}
                onClick={() => setSettingsTab('identity')}
              >
                <Shield size={14} /> Identidad Criptográfica
              </button>
              <button 
                className={`tab-btn ${settingsTab === 'storage' ? 'active' : ''}`}
                onClick={() => setSettingsTab('storage')}
              >
                <HardDrive size={14} /> Custodia & Archivos
              </button>
              <button 
                className={`tab-btn ${settingsTab === 'network' ? 'active' : ''}`}
                onClick={() => setSettingsTab('network')}
              >
                <Terminal size={14} /> Enjambre P2P & Logs ({connectedPeers.length})
              </button>
            </div>

            <div className="settings-tab-body">
              {settingsTab === 'identity' && (
                <div className="tab-pane">
                  <div className="info-card">
                    <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>CLAVE PÚBLICA (IDENTIFICADOR)</span>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <div className="pubkey-display" style={{ flex: 1 }}>{publicKey || "Generando..."}</div>
                      <button 
                        className="btn btn-secondary" 
                        style={{ padding: "8px 12px" }}
                        onClick={() => copyToClipboard(publicKey)}
                        title="Copiar clave pública"
                      >
                        {copiedKey ? <Check size={14} style={{ color: "#10b981" }} /> : <Copy size={14} />}
                      </button>
                    </div>
                    <div className="btn-group" style={{ marginTop: "8px" }}>
                      <button className="btn btn-secondary" onClick={exportKey} title="Exportar archivo .key">
                        <Download size={14} /> Exportar .key
                      </button>
                      <label className="btn btn-secondary" style={{ cursor: "pointer" }} title="Importar archivo .key">
                        <Upload size={14} /> Importar .key
                        <input type="file" accept=".key" onChange={importKey} style={{ display: "none" }} />
                      </label>
                      <button className="btn btn-danger" onClick={generateNewIdentity} title="Generar nueva identidad">
                        <RefreshCw size={14} /> Regenerar Claves
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {settingsTab === 'storage' && (
                <div className="tab-pane">
                  <div className="info-card">
                    <div className="folder-header">
                      <span className="folder-path">{folderName ? `Carpeta activa: ${folderName}` : "Sin carpeta vinculada"}</span>
                      {folderName && (
                        <span className="badge badge-success">
                          <span className="status-dot active"></span> Seeding Local Activo
                        </span>
                      )}
                    </div>
                    <button className="btn btn-primary" onClick={selectLocalFolder}>
                      <Folder size={16} /> {folderName ? "Cambiar Carpeta de Seeding" : "Vincular Carpeta de Disco Local"}
                    </button>
                    <p style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: "1.4" }}>
                      Guarda tus graffitis en archivos .msg directamente en tu sistema de archivos para persistencia y respaldo sovereign.
                    </p>
                    {localGraffitis.length > 0 && (
                      <div style={{ marginTop: "10px" }}>
                        <span style={{ fontSize: "11px", color: "#9ca3af", fontWeight: 600 }}>TUS GRAFFITIS LOCALES ({localGraffitis.length})</span>
                        <div className="graffiti-list" style={{ maxHeight: "150px", overflowY: "auto", marginTop: "6px" }}>
                          {localGraffitis.map((g, i) => (
                            <div key={i} className="graffiti-item">
                              <div className="graffiti-content">"{g.content.text}"</div>
                              <div className="graffiti-meta">
                                <span>{g.location.geohash.substring(0, 7)}</span>
                                <span>{new Date(g.header.timestamp * 1000).toLocaleDateString()}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {settingsTab === 'network' && (
                <div className="tab-pane">
                  <div className="info-card" style={{ gap: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                      <span>Vecinos P2P en zona:</span>
                      <span style={{ fontWeight: 600, color: "var(--accent)" }}>{connectedPeers.length} peers conectados</span>
                    </div>
                    <div className="logs-container" style={{ height: "200px" }}>
                      {logs.length === 0 ? (
                        <div className="log-entry" style={{ color: "#6b7280" }}>Consola de actividad P2P lista...</div>
                      ) : (
                        logs.map((log, i) => (
                          <div key={i} className={`log-entry log-${log.type}`}>
                            [{log.timestamp}] {log.text}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {isHelpOpen && (
        <div className="modal-overlay" onClick={() => setIsHelpOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: "560px", maxWidth: "95vw" }}>
            <h2 style={{ marginBottom: "14px", display: "flex", alignItems: "center", gap: "10px", fontSize: "20px" }}>
              🤝 Acerca de Handshake
            </h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "14px", lineHeight: "1.6", fontSize: "14px" }}>
              <strong>Handshake</strong> es un protocolo de <strong>memoria digital espacio-temporal y graffitis soberanos</strong> donde el territorio y el tiempo son los protagonistas.
            </p>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "18px" }}>
              <div style={{ background: "rgba(0, 0, 0, 0.25)", padding: "10px 14px", borderRadius: "8px", borderLeft: "3px solid var(--accent)" }}>
                <strong style={{ color: "var(--text-primary)", fontSize: "13px" }}>📍 El Territorio y el Tiempo como Protagonistas</strong>
                <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "3px", lineHeight: "1.4" }}>
                  Sin cuentas, perfiles ni algoritmos de retención. Los mensajes son huellas ancladas a coordenadas físicas y a momentos temporales elegidos por el autor (presente, pasado o futuro).
                </p>
              </div>

              <div style={{ background: "rgba(0, 0, 0, 0.25)", padding: "10px 14px", borderRadius: "8px", borderLeft: "3px solid #10b981" }}>
                <strong style={{ color: "var(--text-primary)", fontSize: "13px" }}>🔏 Autenticidad e Integridad Criptográfica</strong>
                <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "3px", lineHeight: "1.4" }}>
                  Cada graffiti es texto plano firmado con claves matemáticas Ed25519. Cualquier persona puede leerlo en el mapa, pero nadie puede falsificar tu autoría ni alterar una sola coma.
                </p>
              </div>

              <div style={{ background: "rgba(0, 0, 0, 0.25)", padding: "10px 14px", borderRadius: "8px", borderLeft: "3px solid #f59e0b" }}>
                <strong style={{ color: "var(--text-primary)", fontSize: "13px" }}>⚡ Sincronización P2P Soberana</strong>
                <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "3px", lineHeight: "1.4" }}>
                  Los datos viajan de navegador a navegador vía WebRTC sin un servidor central que almacene tus mensajes. Cada nodo es custodio de la memoria digital local.
                </p>
              </div>

              <div style={{ background: "rgba(0, 0, 0, 0.25)", padding: "10px 14px", borderRadius: "8px", borderLeft: "3px solid #a855f7" }}>
                <strong style={{ color: "var(--text-primary)", fontSize: "13px" }}>🤝 El Handshake Presencial</strong>
                <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "3px", lineHeight: "1.4" }}>
                  Al encontrarte cara a cara con alguien y escanear su clave pública, tu mapa expande tu radio de visibilidad a 1 km y destaca visualmente sus huellas con un halo de confianza.
                </p>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <a 
                href="https://github.com/cacrespo/handshake" 
                target="_blank" 
                rel="noopener noreferrer"
                className="btn btn-secondary"
                style={{ flex: 1, textDecoration: "none", justifyContent: "center" }}
              >
                Código en GitHub
              </a>
              <button 
                className="btn btn-primary" 
                style={{ flex: 1 }}
                onClick={() => setIsHelpOpen(false)}
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
