import React, { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, Circle } from "react-leaflet";
import L from "leaflet";
import nacl from "tweetnacl";
import {
  Folder, Key, RefreshCw, Upload, Download, MapPin,
  Clock, Send, Activity
} from "lucide-react";

// Fix Leaflet marker icons in Vite/React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Hex conversion helpers
const toHex = (arr: Uint8Array) => Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
const fromHex = (hex: string) => {
  const cleanHex = hex.replace(/[^a-fA-F0-9]/g, "");
  const view = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    view[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return view;
};

// Geohash helper (precision 7 for local nodes)
const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
function encodeGeohash(lat: number, lon: number, precision: number = 7): string {
  let isEven = true;
  let latMin = -90, latMax = 90;
  let lonMin = -180, lonMax = 180;
  let geohash = "";
  let bit = 0;
  let ch = 0;

  while (geohash.length < precision) {
    let mid;
    if (isEven) {
      mid = (lonMin + lonMax) / 2;
      if (lon > mid) {
        ch |= (1 << (4 - bit));
        lonMin = mid;
      } else {
        lonMax = mid;
      }
    } else {
      mid = (latMin + latMax) / 2;
      if (lat > mid) {
        ch |= (1 << (4 - bit));
        latMin = mid;
      } else {
        latMax = mid;
      }
    }

    isEven = !isEven;
    if (bit < 4) {
      bit++;
    } else {
      geohash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return geohash;
}

function decodeGeohash(geohash: string): { lat: number; lon: number } {
  let isEven = true;
  let latMin = -90, latMax = 90;
  let lonMin = -180, lonMax = 180;

  for (let i = 0; i < geohash.length; i++) {
    const c = geohash[i];
    const cd = BASE32.indexOf(c);
    if (cd === -1) continue;
    for (let j = 0; j < 5; j++) {
      const mask = 1 << (4 - j);
      if (isEven) {
        const mid = (lonMin + lonMax) / 2;
        if (cd & mask) {
          lonMin = mid;
        } else {
          lonMax = mid;
        }
      } else {
        const mid = (latMin + latMax) / 2;
        if (cd & mask) {
          latMin = mid;
        } else {
          latMax = mid;
        }
      }
      isEven = !isEven;
    }
  }
  return {
    lat: (latMin + latMax) / 2,
    lon: (lonMin + lonMax) / 2
  };
}

// Canonical JSON stringify matching Python sort_keys=True recursively
function canonicalStringify(obj: any): string {
  if (obj === null) return "null";
  if (typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalStringify).join(",") + "]";
  }
  const keys = Object.keys(obj).sort();
  const parts = keys.map(key => `"${key}":${canonicalStringify(obj[key])}`);
  return "{" + parts.join(",") + "}";
}

function getSigningData(msg: any) {
  // Clonar el mensaje para evitar modificar el original y remover la firma
  const data = JSON.parse(JSON.stringify(msg));
  if (data.header) {
    delete data.header.signature;
  }
  return canonicalStringify(data);
}

function verifyMessage(msg: any): boolean {
  if (!msg.header || !msg.header.signature || !msg.header.author_pk) return false;
  try {
    const signingData = getSigningData(msg);
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(signingData);
    const signatureBytes = fromHex(msg.header.signature);
    const publicKeyBytes = fromHex(msg.header.author_pk);
    return nacl.sign.detached.verify(dataBytes, signatureBytes, publicKeyBytes);
  } catch (e) {
    console.error("Signature verification failed:", e);
    return false;
  }
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // metres
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in metres
}

// Map updater component to sync viewport with smooth flyTo
function MapController({ center, target }: { center: [number, number]; target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo(target, 15, { animate: true, duration: 1.5 });
    } else {
      map.setView(center, map.getZoom());
    }
  }, [center, target, map]);
  return null;
}

// Map events handler to sync coords state on click
function MapEventsTracker({ onClick, onClearTarget }: { onClick: (lat: number, lon: number) => void; onClearTarget: () => void }) {
  useMapEvents({
    click: (e) => {
      onClick(e.latlng.lat, e.latlng.lng);
    },
    movestart: () => {
      onClearTarget();
    }
  });
  return null;
}

interface LogEntry {
  text: string;
  type: "info" | "success" | "warning" | "danger";
  timestamp: string;
}

interface PeerInfo {
  peer_id: string;
  geohash: string;
}

export default function App() {
  const [coords, setCoords] = useState<[number, number]>([-34.6037, -58.3816]);
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
  const [newGraffitiContent, setNewGraffitiContent] = useState("");
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [trustedAuthors, setTrustedAuthors] = useState<string[]>([]);
  const [mapTarget, setMapTarget] = useState<[number, number] | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [folderHandle, setFolderHandle] = useState<any>(null);

  const ws = useRef<WebSocket | null>(null);
  const pcs = useRef<{ [peerId: string]: RTCPeerConnection }>({});
  const dataChannels = useRef<{ [peerId: string]: RTCDataChannel }>({});
  const localGraffitisRef = useRef<any[]>([]);

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
    const storedPub = localStorage.getItem("handshake_pubkey");
    const storedSec = localStorage.getItem("handshake_seckey");
    const storedTrust = localStorage.getItem("handshake_trust");
    if (storedTrust) {
      try {
        setTrustedAuthors(JSON.parse(storedTrust));
      } catch (e) {
        console.error(e);
      }
    }

    if (storedPub && storedSec) {
      setPublicKey(storedPub);
      setSecretKey(storedSec);
      addLog("Cryptographic identity loaded from localStorage", "success");
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

  // Update geohash when coords change
  useEffect(() => {
    const gh = encodeGeohash(coords[0], coords[1]);
    setGeohash(gh);
  }, [coords]);

  const generateNewIdentity = () => {
    const kp = nacl.sign.keyPair();
    const pubHex = toHex(kp.publicKey);
    const secHex = toHex(kp.secretKey);
    localStorage.setItem("handshake_pubkey", pubHex);
    localStorage.setItem("handshake_seckey", secHex);
    setPublicKey(pubHex);
    setSecretKey(secHex);
    addLog("Created new ephemeral identity", "success");
  };

  const exportKey = () => {
    const keyData = JSON.stringify({ public_key: publicKey, private_key: secretKey }, null, 2);
    const blob = new Blob([keyData], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `handshake_identity_${publicKey.substring(0, 8)}.key`;
    a.click();
    URL.revokeObjectURL(url);
    addLog("Identity exported as .key file", "success");
  };

  const importKey = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const keys = JSON.parse(event.target?.result as string);
        const pubKey = keys.public_key || keys.publicKey;
        const secKey = keys.private_key || keys.secretKey;
        if (pubKey && secKey) {
          localStorage.setItem("handshake_pubkey", pubKey);
          localStorage.setItem("handshake_seckey", secKey);
          setPublicKey(pubKey);
          setSecretKey(secKey);
          addLog("Identity imported successfully!", "success");
        } else {
          addLog("Invalid .key format. Keys not found.", "danger");
        }
      } catch (err) {
        addLog("Error parsing key file.", "danger");
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
        }
      } catch (err) {
        console.error("Error parsing WebSocket message:", err);
      }
    };
  };

  const announcePresence = () => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    addLog(`Registering presence with Geohash: ${geohash}`, "info");
    ws.current.send(JSON.stringify({
      type: "register",
      peer_id: publicKey,
      geohash: geohash
    }));
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
    let pc = pcs.current[sender];
    
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
      } else if (signal.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
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
  const handleCreateGraffiti = () => {
    if (!newGraffitiContent.trim()) return;
    if (!publicKey || !secretKey) {
      addLog("Cryptographic keys missing. Please generate/import keys.", "danger");
      return;
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const secretKeyBytes = fromHex(secretKey);

    const messageToSign = {
      version: "1.0",
      header: {
        type: "PUBLIC",
        owner_pk: null,
        author_pk: publicKey,
        parent_signature: replyingTo ? replyingTo.header.signature : null,
        timestamp: timestamp
      },
      location: {
        geohash: geohash,
        proof: {
          type: "GPS",
          data: `${coords[0].toFixed(6)},${coords[1].toFixed(6)}`
        }
      },
      content: {
        text: newGraffitiContent
      }
    };

    const signingString = canonicalStringify(messageToSign);
    const encoder = new TextEncoder();
    const signingBytes = encoder.encode(signingString);
    const sigBytes = nacl.sign.detached(signingBytes, secretKeyBytes);
    const signatureHex = toHex(sigBytes);

    const fullySignedMessage = {
      ...messageToSign,
      header: {
        ...messageToSign.header,
        signature: signatureHex
      }
    };

    setLocalGraffitis(prev => [...prev, fullySignedMessage]);
    setNewGraffitiContent("");
    setReplyingTo(null);
    addLog("Created and signed new local graffiti!", "success");

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

  const handleCardClick = (targetCoords: [number, number]) => {
    setMapTarget(targetCoords);
    setCoords(targetCoords);
    addLog(`Centering map on selected graffiti: ${targetCoords[0].toFixed(5)}, ${targetCoords[1].toFixed(5)}`, "info");
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

  // Combine lists of graffitis to show on map
  const allGraffitis = [...localGraffitis, ...remoteGraffitis];
  
  // Filter by time AND spatial-temporal visibility mechanics (Handshake multiplier)
  const filteredGraffitis = allGraffitis.filter(g => {
    // Tus propios graffitis siempre son visibles
    if (g.header.author_pk === publicKey) return true;
    
    // Filtro temporal por día
    const dayRange = getDayRange(dayOffset);
    if (g.header.timestamp < dayRange.start || g.header.timestamp > dayRange.end) return false;
    
    try {
      const gCoords = decodeGeohash(g.location.geohash);
      const distance = getDistance(coords[0], coords[1], gCoords.lat, gCoords.lon);
      const isTrusted = trustedAuthors.includes(g.header.author_pk);
      const visibilityRadius = isTrusted ? 1000 : 200; // 1km if trusted (Handshake Multiplier), 200m if not
      return distance <= visibilityRadius;
    } catch (e) {
      return false;
    }
  });

  // Helper to build recursive thread trees from flat messages list
  const buildThreadTrees = (graffitis: any[]) => {
    const map: { [sig: string]: any & { replies: any[] } } = {};
    graffitis.forEach(g => {
      if (g.header && g.header.signature) {
        map[g.header.signature] = { ...g, replies: [] };
      }
    });
    const roots: any[] = [];
    graffitis.forEach(g => {
      if (!g.header || !g.header.signature) return;
      const mapped = map[g.header.signature];
      const parentSig = g.header.parent_signature;
      if (parentSig && map[parentSig]) {
        map[parentSig].replies.push(mapped);
      } else {
        roots.push(mapped);
      }
    });
    // Sort roots by timestamp
    roots.sort((a, b) => a.header.timestamp - b.header.timestamp);
    const sortReplies = (node: any) => {
      node.replies.sort((a: any, b: any) => a.header.timestamp - b.header.timestamp);
      node.replies.forEach(sortReplies);
    };
    roots.forEach(sortReplies);
    return roots;
  };

  // Recursive component to render threaded graffiti cards
  const ThreadedCard = ({ node, depth = 0 }: { node: any; depth: number }) => {
    const isLocal = localGraffitis.some(g => g.header.signature === node.header.signature);
    const isTrusted = trustedAuthors.includes(node.header.author_pk);
    const gCoords = decodeGeohash(node.location.geohash);
    const dist = getDistance(coords[0], coords[1], gCoords.lat, gCoords.lon);

    return (
      <div style={{ 
        marginLeft: depth > 0 ? "16px" : "0", 
        borderLeft: depth > 0 ? "2px solid rgba(168, 85, 247, 0.3)" : "none", 
        paddingLeft: depth > 0 ? "12px" : "0",
        marginTop: "8px"
      }}>
        <div 
          className={`timeline-card ${isTrusted ? "trusted" : isLocal ? "local" : "remote"}`}
          onClick={() => handleCardClick([gCoords.lat, gCoords.lon])}
          style={{ marginBottom: "4px" }}
        >
          <div className="card-header">
            <span className="card-author">
              {node.header.author_pk.substring(0, 8)}...
            </span>
            <span className="card-time">
              {new Date(node.header.timestamp * 1000).toLocaleTimeString([], {hour: "2-digit", minute:"2-digit"})}
            </span>
          </div>
          <div className="card-content">
            "{node.content.text}"
          </div>
          <div className="card-footer">
            <span className="card-geohash">
              Geohash: <code>{node.location.geohash.substring(0, 7)}</code>
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {node.header.author_pk !== publicKey && (
                <button
                  className="btn btn-secondary"
                  style={{ padding: "2px 6px", fontSize: "10px", height: "20px", display: "inline-flex", alignItems: "center", gap: "2px" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setReplyingTo(node);
                    const inputEl = document.querySelector(".timeline-input-el") as HTMLInputElement;
                    if (inputEl) inputEl.focus();
                  }}
                >
                  💬 Responder
                </button>
              )}
              {!isLocal && (
                <button
                  className="btn btn-primary"
                  style={{ padding: "2px 6px", fontSize: "10px", height: "20px", display: "inline-flex" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    saveAndSeedMessage(node);
                  }}
                >
                  📥 Seedear
                </button>
              )}
              <span className={`card-distance ${isTrusted ? "trusted" : isLocal ? "local" : "remote"}`}>
                <MapPin size={12} style={{ verticalAlign: "middle", marginRight: "2px" }} />
                {dist.toFixed(0)}m
              </span>
            </div>
          </div>
        </div>
        {node.replies.map((reply: any, idx: number) => (
          <ThreadedCard key={`reply-${node.header.signature}-${idx}`} node={reply} depth={depth + 1} />
        ))}
      </div>
    );
  };

  return (
    <div id="root">
      <header className="app-header">
        <div className="logo-container">
          <div>
            <div className="logo-text">Handshake</div>
            <div className="subtitle">Space-Time Conexions</div>
          </div>
        </div>

        <div className="header-status">
          <button 
            className="btn btn-secondary"
            onClick={() => setIsHelpOpen(true)}
            style={{ padding: "6px 12px", fontSize: "12px", height: "32px" }}
          >
            ❔ Ayuda
          </button>
          <button 
            className="btn btn-secondary"
            onClick={connectTracker}
            disabled={wsStatus === "connecting"}
            style={{ height: "32px", padding: "6px 12px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <span className={`status-dot ${wsStatus === "connected" ? "active" : "inactive"}`} style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%" }}></span>
            Tracker: {wsStatus === "connected" ? "Online" : wsStatus === "connecting" ? "Connecting..." : "Offline"}
          </button>
        </div>
      </header>

      <div className="app-layout">
               {/* Column 1: Timeline / Wall Feed */}
        <div className="timeline">
          <div className="timeline-header">
            <h3 className="timeline-title">
              <Clock size={18} /> Graffitis en la zona
            </h3>
            <p className="timeline-desc">
              Sincronizados en tu rango de visibilidad actual. Haz clic en el mapa para explorar otras áreas.
            </p>
          </div>

          {/* Leave Graffiti Block at the top of Timeline Feed */}
          <div style={{ padding: "0 20px 20px 20px", borderBottom: "1px solid var(--border-color)" }}>
            {replyingTo && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(168, 85, 247, 0.1)", padding: "6px 12px", borderRadius: "6px", marginBottom: "8px", fontSize: "12px", borderLeft: "3px solid var(--accent)" }}>
                <span>Respondiendo a: <code style={{ color: "var(--accent)" }}>{replyingTo.header.author_pk.substring(0, 8)}...</code></span>
                <button 
                  style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: 700 }}
                  onClick={() => setReplyingTo(null)}
                >
                  [Cancelar]
                </button>
              </div>
            )}
            <div className="info-card">
              <div style={{ display: "flex", gap: "8px" }}>
                <input 
                  type="text" 
                  className="form-input timeline-input-el" 
                  placeholder={replyingTo ? "Escribe tu respuesta..." : "Escribe tu graffiti espacial..."}
                  value={newGraffitiContent}
                  onChange={(e) => setNewGraffitiContent(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateGraffiti()}
                />
                <button className="btn btn-primary" onClick={handleCreateGraffiti}>
                  <Send size={14} />
                </button>
              </div>
              <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px" }}>
                <MapPin size={12} style={{ verticalAlign: "middle", marginRight: "4px" }} />
                Se dejará en tu marcador seleccionado (Geohash: <code>{geohash.substring(0, 7)}</code>)
              </div>
            </div>
          </div>

          <div className="timeline-list">
            {filteredGraffitis.length === 0 ? (
              <div className="timeline-empty">
                <MapPin size={32} style={{ color: "var(--text-muted)", marginBottom: "8px" }} />
                <p style={{ fontWeight: 600 }}>Zona vacía</p>
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  Arrastra el mapa para explorar y encontrar graffitis.
                </span>
              </div>
            ) : (
              buildThreadTrees(filteredGraffitis).map((node, idx) => (
                <ThreadedCard key={`root-${idx}`} node={node} depth={0} />
              ))
            )}
          </div>
        </div>

        {/* Column 2: Interactive Map */}
        <div className="map-container">
          <MapContainer 
            center={coords} 
            zoom={14} 
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            
            <MapController center={coords} target={mapTarget} />
            <MapEventsTracker 
              onClick={(lat, lon) => {
                setCoords([lat, lon]);
              }} 
              onClearTarget={() => setMapTarget(null)}
            />

            {/* Current Peer Circles representing visibility ranges */}
            {/* Inner local circle: 200m */}
            <Circle 
              center={coords} 
              radius={200} 
              pathOptions={{ color: "#a855f7", fillColor: "#a855f7", fillOpacity: 0.08, weight: 1.5 }} 
            />
            {/* Outer trust circle: 1000m */}
            <Circle 
              center={coords} 
              radius={1000} 
              pathOptions={{ color: "#10b981", fillColor: "#10b981", fillOpacity: 0.02, weight: 1, dashArray: "5, 5" }} 
            />
            
            <Marker 
              position={coords}
              icon={L.divIcon({
                className: "custom-marker",
                html: '<div class="pulse-dot user"></div>',
                iconSize: [24, 24]
              })}
            >
              <Popup>
                <strong>Tú (Seeder)</strong><br />
                Geohash: <code>{geohash}</code><br />
                ID: <code>{publicKey.substring(0, 8)}...</code>
              </Popup>
            </Marker>

            {/* Peer markers */}
            {connectedPeers.map((peer, idx) => {
              try {
                const peerCoords = decodeGeohash(peer.geohash);
                return (
                  <Marker 
                    key={`peer-${idx}`} 
                    position={[peerCoords.lat, peerCoords.lon]}
                    icon={L.divIcon({
                      className: "custom-marker",
                      html: '<div class="pulse-dot peer"></div>',
                      iconSize: [24, 24]
                    })}
                  >
                    <Popup>
                      <strong>Peer Vecino</strong><br />
                      ID: <code>{peer.peer_id.substring(0, 8)}...</code><br />
                      Geohash: <code>{peer.geohash}</code>
                    </Popup>
                  </Marker>
                );
              } catch (e) {
                return null;
              }
            })}

            {/* Graffiti Markers */}
            {filteredGraffitis.map((graf, idx) => {
              try {
                const isLocal = localGraffitis.some(g => g.header.signature === graf.header.signature);
                const grafCoords = decodeGeohash(graf.location.geohash);
                const isTrusted = trustedAuthors.includes(graf.header.author_pk);
                
                return (
                  <Marker 
                    key={`graf-${idx}`} 
                    position={[grafCoords.lat, grafCoords.lon]}
                    icon={L.divIcon({
                      className: "custom-marker",
                      html: `<div class="graffiti-marker-bubble ${isTrusted ? 'trusted' : isLocal ? 'local' : 'remote'}"></div>`,
                      iconSize: [24, 24]
                    })}
                  >
                    <Popup>
                      <div style={{ minWidth: "180px", display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span className={`badge ${isTrusted ? "badge-success" : isLocal ? "badge-success" : "badge-warning"}`}>
                            {isTrusted ? "Trusted Peer" : isLocal ? "Local Seeding" : "P2P Synced"}
                          </span>
                        </div>
                        <p style={{ fontWeight: 600, fontSize: "14px", margin: "4px 0" }}>"{graf.content.text}"</p>
                        <hr style={{ borderColor: "rgba(255,255,255,0.1)" }} />
                        <span style={{ fontSize: "10px", color: "#9ca3af" }}>
                          Autor: <code>{graf.header.author_pk.substring(0, 8)}...</code><br />
                          Fecha: {new Date(graf.header.timestamp * 1000).toLocaleString()}<br />
                          Geohash: <code>{graf.location.geohash}</code>
                        </span>
                        {graf.header.author_pk !== publicKey && (
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: "4px 8px", fontSize: "11px", marginTop: "4px" }}
                            onClick={() => toggleTrust(graf.header.author_pk)}
                          >
                            🤝 {isTrusted ? "Desconfiar" : "Confiar / Handshake"}
                          </button>
                        )}
                        {!isLocal && (
                          <button 
                            className="btn btn-primary" 
                            style={{ padding: "4px 8px", fontSize: "11px", marginTop: "4px" }}
                            onClick={() => saveAndSeedMessage(graf)}
                          >
                            📥 Seedear / Guardar Local
                          </button>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                );
              } catch (e) {
                return null;
              }
            })}
          </MapContainer>

          {/* Time Slider Overlay */}
          <div className="map-overlay">
            <div className="overlay-panel time-slider-container">
              <div className="slider-header">
                <span><Clock size={14} style={{ display: "inline", marginRight: "4px", verticalAlign: "middle" }} /> Línea del Tiempo</span>
                <span style={{ fontWeight: 700, color: "var(--accent)" }}>{getSelectedDayText(dayOffset)}</span>
              </div>
              <input 
                type="range" 
                min="-7"
                max="7"
                step="1"
                value={dayOffset}
                onChange={(e) => setDayOffset(Number(e.target.value))}
                className="slider-input"
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--text-muted)", marginTop: "4px" }}>
                <span>Hace 1 semana</span>
                <span>Hoy</span>
                <span>En 1 semana</span>
              </div>
            </div>
          </div>
        </div>

        {/* Column 3: Settings Sidebar */}
        <aside className="sidebar">
          {/* Section 1: Cryptographic Identity */}
          <div className="sidebar-section">
            <h3 className="section-title"><Key size={16} /> Identidad Criptográfica</h3>
            <div className="info-card">
              <div>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>CLAVE PÚBLICA (TU FIRMA)</span>
                <div className="pubkey-display">{publicKey || "Generando..."}</div>
              </div>
              <div className="btn-group">
                <button className="btn btn-secondary" onClick={exportKey} title="Exportar archivo .key">
                  <Download size={14} /> Exportar
                </button>
                <label className="btn btn-secondary" style={{ cursor: "pointer" }} title="Importar archivo .key">
                  <Upload size={14} /> Importar
                  <input type="file" accept=".key" onChange={importKey} style={{ display: "none" }} />
                </label>
                <button className="btn btn-danger" onClick={generateNewIdentity} title="Generar nueva identidad">
                  <RefreshCw size={14} /> Regenerar
                </button>
              </div>
            </div>
          </div>

          {/* Section 2: Folder Local Seeding */}
          <div className="sidebar-section">
            <h3 className="section-title"><Folder size={16} /> Carpeta de Sedeo Local</h3>
            <div className="info-card">
              <div className="folder-header">
                <span className="folder-path">{folderName ? `Carpeta: ${folderName}` : "Sin carpeta seleccionada"}</span>
                {folderName && (
                  <span className="badge badge-success">
                    <span className="status-dot active"></span> Seeding
                  </span>
                )}
              </div>
              
              <button className="btn btn-primary btn-full" onClick={selectLocalFolder}>
                <Folder size={16} /> {folderName ? "Cambiar Carpeta" : "Seleccionar Carpeta para Seedear"}
              </button>

              {localGraffitis.length > 0 && (
                <div>
                  <span style={{ fontSize: "11px", color: "#9ca3af", fontWeight: 600 }}>TUS GRAFFITIS LOCALES ({localGraffitis.length})</span>
                  <div className="graffiti-list">
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



          {/* Section 4: WebRTC Peer Swarm & Activity logs */}
          <div className="sidebar-section">
            <h3 className="section-title">
              <Activity size={16} /> Enjambre P2P ({connectedPeers.length} Peers)
            </h3>
            <div className="info-card" style={{ gap: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                <span>Vecinos en zona:</span>
                <span style={{ fontWeight: 600 }}>{connectedPeers.length} conectados</span>
              </div>
              <div className="logs-container">
                {logs.length === 0 ? (
                  <div className="log-entry" style={{ color: "#6b7280" }}>Consola de actividad P2P iniciada...</div>
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
        </aside>
      </div>

      {isHelpOpen && (
        <div className="modal-overlay" onClick={() => setIsHelpOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
              🤝 Acerca de Handshake
            </h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "12px", lineHeight: "1.6", fontSize: "14px" }}>
              <strong>Handshake</strong> es una red social P2P descentralizada de <strong>graffitis espacio-temporales</strong>.
            </p>
            <p style={{ color: "var(--text-secondary)", marginBottom: "12px", lineHeight: "1.6", fontSize: "14px" }}>
              En lugar de feeds decididos por algoritmos centralizados, los mensajes se anclan a coordenadas geográficas y tiempo exacto. Para descubrirlos, debes moverte haciendo click en la grilla del mapa.
            </p>
            <p style={{ color: "var(--text-secondary)", marginBottom: "20px", lineHeight: "1.6", fontSize: "14px" }}>
              Los mensajes se comparten directamente entre navegadores por WebRTC (sin pasar por servidores centralizados) desde carpetas locales. El radio de visibilidad inicial es de 200m, pero se expande a 1km para los creadores en quienes confías (Handshake).
            </p>
            
            <h3 style={{ fontSize: "13px", color: "var(--text-primary)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Código Fuente</h3>
            <a 
              href="https://github.com/cacrespo/handshake" 
              target="_blank" 
              rel="noopener noreferrer"
              className="btn btn-primary"
              style={{ display: "inline-flex", textDecoration: "none", width: "100%", justifyContent: "center" }}
            >
              Ver Repositorio en GitHub
            </a>
            
            <button 
              className="btn btn-secondary" 
              style={{ marginTop: "16px", width: "100%" }}
              onClick={() => setIsHelpOpen(false)}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
