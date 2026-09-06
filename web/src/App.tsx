import React, { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, Circle } from "react-leaflet";
import L from "leaflet";
import nacl from "tweetnacl";
import {
  Folder, RefreshCw, Upload, Download, MapPin,
  Clock, Send, Layers, Moon, Sun, Globe, Satellite,
  Settings, Plus, X, Copy, Check, Shield, HardDrive, Terminal, MessageSquarePlus
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

type MapStyle = "clean_light" | "comic" | "streets_hd" | "satellite" | "dark_gray";

interface MapStyleConfig {
  id: MapStyle;
  label: string;
  url: string;
  attribution: string;
  maxZoom: number;
}

const MAP_STYLES: Record<MapStyle, MapStyleConfig> = {
  clean_light: {
    id: "clean_light",
    label: "Minimalista Claro (Limpio)",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    maxZoom: 16,
  },
  comic: {
    id: "comic",
    label: "Estilo Cómic / Ilustración",
    url: "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles by <a href="https://www.hotosm.org/">HOT</a>',
    maxZoom: 19,
  },
  streets_hd: {
    id: "streets_hd",
    label: "Calles HD (Esri)",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS',
    maxZoom: 19,
  },
  satellite: {
    id: "satellite",
    label: "Satélite HD (Esri)",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS',
    maxZoom: 19,
  },
  dark_gray: {
    id: "dark_gray",
    label: "Dark Canvas (Esri)",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    maxZoom: 16,
  },
};

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
  const [mapStyle, setMapStyle] = useState<MapStyle>("clean_light");
  const [showStyleMenu, setShowStyleMenu] = useState<boolean>(false);
  const [writeTimeMode, setWriteTimeMode] = useState<"slider" | "now" | "custom">("slider");
  const [customWriteDate, setCustomWriteDate] = useState<string>("");
  const [viewAllDays, setViewAllDays] = useState<boolean>(false);

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
    const secretKeyBytes = fromHex(secretKey);

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

    await saveAndSeedMessage(fullySignedMessage);
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
    // 1. Filtro temporal (a menos que se active "Ver todos los días")
    if (!viewAllDays) {
      const dayRange = getDayRange(dayOffset);
      if (g.header.timestamp < dayRange.start || g.header.timestamp > dayRange.end) {
        return false;
      }
    }
    
    // 2. Filtro espacial y visibilidad (Tus propios graffitis se muestran siempre en su momento temporal)
    const isLocallyOwned = g.header.author_pk === publicKey;
    const isLocallyStored = localGraffitis.some(lg => lg.header.signature === g.header.signature);
    if (isLocallyOwned || isLocallyStored) return true;

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
          <div className="logo-text">Handshake</div>
          <div className="subtitle">Space-Time Conexions</div>
        </div>

        <div className="header-status">
          <button 
            className="btn btn-primary btn-header-write"
            onClick={() => {
              setReplyingTo(null);
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

      <div className="app-layout">
        {/* Column 1: Timeline / Wall Feed */}
        <div className="timeline">
          <div className="timeline-header">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 className="timeline-title">
                <Clock size={18} /> Graffitis en la zona
              </h3>
              <span className="badge badge-info" style={{ fontSize: "10px" }}>
                {filteredGraffitis.length} mensajes
              </span>
            </div>
            <p className="timeline-desc">
              Huellas descubiertas en tu rango de visibilidad. Haz clic en el mapa para explorar otras coordenadas.
            </p>
          </div>

          <div className="timeline-list">
            {filteredGraffitis.length === 0 ? (
              <div className="timeline-empty">
                <MapPin size={32} style={{ color: "var(--text-muted)", marginBottom: "8px" }} />
                <p style={{ fontWeight: 600 }}>Zona sin graffitis en este día</p>
                <span style={{ fontSize: "12px", color: "var(--text-muted)", textAlign: "center", lineHeight: "1.5" }}>
                  Usa el botón <strong>"Pintar Graffiti"</strong> para dejar la primera huella en estas coordenadas y momento temporal.
                </span>
              </div>
            ) : (
              buildThreadTrees(filteredGraffitis).map((node, idx) => (
                <ThreadedCard key={`root-${idx}`} node={node} depth={0} />
              ))
            )}
          </div>
        </div>

        {/* Column 2: Interactive Map (Expansive Full Canvas) */}
        <div className="map-container">
          {/* Floating Map Style Selector */}
          <div className="map-style-selector">
            <button 
              className="map-style-btn" 
              onClick={() => setShowStyleMenu(!showStyleMenu)}
              title="Cambiar estilo visual del mapa"
            >
              <Layers size={18} />
              <span>{MAP_STYLES[mapStyle].label}</span>
            </button>
            
            {showStyleMenu && (
              <div className="map-style-dropdown">
                <button 
                  className={`map-style-option ${mapStyle === 'clean_light' ? 'active' : ''}`}
                  onClick={() => { setMapStyle('clean_light'); setShowStyleMenu(false); }}
                >
                  <Sun size={14} />
                  <span>Minimalista Claro (Limpio)</span>
                </button>
                <button 
                  className={`map-style-option ${mapStyle === 'comic' ? 'active' : ''}`}
                  onClick={() => { setMapStyle('comic'); setShowStyleMenu(false); }}
                >
                  <Globe size={14} />
                  <span>Estilo Cómic / Ilustración</span>
                </button>
                <button 
                  className={`map-style-option ${mapStyle === 'streets_hd' ? 'active' : ''}`}
                  onClick={() => { setMapStyle('streets_hd'); setShowStyleMenu(false); }}
                >
                  <Globe size={14} />
                  <span>Calles HD (Esri)</span>
                </button>
                <button 
                  className={`map-style-option ${mapStyle === 'satellite' ? 'active' : ''}`}
                  onClick={() => { setMapStyle('satellite'); setShowStyleMenu(false); }}
                >
                  <Satellite size={14} />
                  <span>Satélite HD (Esri)</span>
                </button>
                <button 
                  className={`map-style-option ${mapStyle === 'dark_gray' ? 'active' : ''}`}
                  onClick={() => { setMapStyle('dark_gray'); setShowStyleMenu(false); }}
                >
                  <Moon size={14} />
                  <span>Dark Canvas (Esri)</span>
                </button>
              </div>
            )}
          </div>

          <MapContainer 
            center={coords} 
            zoom={14} 
            className={`leaflet-map map-style-${mapStyle}`}
            zoomControl={false}
          >
            <TileLayer
              key={mapStyle}
              attribution={MAP_STYLES[mapStyle].attribution}
              url={MAP_STYLES[mapStyle].url}
              maxZoom={MAP_STYLES[mapStyle].maxZoom}
            />

            <MapController center={coords} target={mapTarget} />
            <MapEventsTracker 
              onClick={(lat, lon) => {
                setCoords([lat, lon]);
              }} 
              onClearTarget={() => setMapTarget(null)}
            />

            {/* Visibility Rings */}
            <Circle 
              center={coords} 
              radius={200} 
              pathOptions={{ color: 'var(--accent)', fillColor: 'var(--accent)', fillOpacity: 0.08, dashArray: '4, 4' }} 
            />
            <Circle 
              center={coords} 
              radius={1000} 
              pathOptions={{ color: 'var(--accent-hover)', fillColor: 'var(--accent-hover)', fillOpacity: 0.03, dashArray: '8, 8' }} 
            />

            {/* User Node Marker */}
            <Marker 
              position={coords}
              icon={L.divIcon({
                className: "custom-marker",
                html: `
                  <div class="user-beacon">
                    <div class="user-beacon-ping"></div>
                    <div class="user-beacon-core"></div>
                  </div>
                `,
                iconSize: [28, 28],
                iconAnchor: [14, 14]
              })}
            >
              <Popup className="handshake-popup">
                <div className="popup-card">
                  <div className="popup-badge you">Tu Posición (Seeder)</div>
                  <div className="popup-meta">
                    <div><strong>Geohash:</strong> <code>{geohash}</code></div>
                    <div><strong>ID:</strong> <code>{publicKey.substring(0, 10)}...</code></div>
                  </div>
                  <button 
                    className="btn btn-primary popup-btn" 
                    style={{ marginTop: "6px" }}
                    onClick={() => {
                      setReplyingTo(null);
                      setIsComposerOpen(true);
                    }}
                  >
                    ✍️ Pintar aquí
                  </button>
                </div>
              </Popup>
            </Marker>

            {/* Graffiti Markers */}
            {filteredGraffitis.map((graf, idx) => {
              try {
                const isLocal = localGraffitis.some(g => g.header.signature === graf.header.signature);
                const grafCoords = decodeGeohash(graf.location.geohash);
                const isTrusted = trustedAuthors.includes(graf.header.author_pk);
                const typeClass = isTrusted ? 'trusted' : isLocal ? 'local' : 'remote';
                
                return (
                  <Marker 
                    key={`graf-${idx}`} 
                    position={[grafCoords.lat, grafCoords.lon]}
                    icon={L.divIcon({
                      className: "custom-marker",
                      html: `
                        <div class="graffiti-pin ${typeClass}">
                          <div class="graffiti-pin-glow"></div>
                          <div class="graffiti-pin-dot"></div>
                        </div>
                      `,
                      iconSize: [26, 26],
                      iconAnchor: [13, 13]
                    })}
                  >
                    <Popup className="handshake-popup">
                      <div className="popup-card">
                        <div className="popup-header">
                          <span className={`badge ${isTrusted ? "badge-success" : isLocal ? "badge-success" : "badge-warning"}`}>
                            {isTrusted ? "★ Contacto Confiable" : isLocal ? "● Seeding Local" : "⚡ P2P Sincronizado"}
                          </span>
                        </div>
                        <p className="popup-text">"{graf.content.text}"</p>
                        <div className="popup-details">
                          <span><strong>Autor:</strong> <code>{graf.header.author_pk.substring(0, 8)}...</code></span>
                          <span><strong>Fecha:</strong> {new Date(graf.header.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({new Date(graf.header.timestamp * 1000).toLocaleDateString()})</span>
                          <span><strong>Geohash:</strong> <code>{graf.location.geohash}</code></span>
                        </div>
                        <div className="popup-actions">
                          {graf.header.author_pk !== publicKey && (
                            <>
                              <button 
                                className="btn btn-secondary popup-btn" 
                                onClick={() => toggleTrust(graf.header.author_pk)}
                              >
                                🤝 {isTrusted ? "Desconfiar" : "Handshake"}
                              </button>
                              <button 
                                className="btn btn-secondary popup-btn" 
                                onClick={() => {
                                  setReplyingTo(graf);
                                  setIsComposerOpen(true);
                                }}
                              >
                                💬 Responder
                              </button>
                            </>
                          )}
                          {!isLocal && (
                            <button 
                              className="btn btn-primary popup-btn" 
                              onClick={() => saveAndSeedMessage(graf)}
                            >
                              📥 Guardar
                            </button>
                          )}
                        </div>
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
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Clock size={14} style={{ color: "var(--accent)" }} />
                  <span>Explorador Temporal:</span>
                  <span style={{ fontWeight: 700, color: "var(--accent)" }}>{getSelectedDayText(dayOffset)}</span>
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button 
                    className={`btn btn-secondary ${viewAllDays ? 'btn-active-toggle' : ''}`}
                    style={{ padding: "2px 8px", fontSize: "10px", height: "24px" }}
                    onClick={() => setViewAllDays(!viewAllDays)}
                    title="Alternar entre ver solo el día activo o ver todos los graffitis sin importar el tiempo"
                  >
                    {viewAllDays ? "👁️ Mostrando Todo" : "🗓️ Filtrar por Día"}
                  </button>
                </div>
              </div>
              <input 
                type="range" 
                min="-14"
                max="14"
                step="1"
                value={dayOffset}
                onChange={(e) => {
                  setDayOffset(Number(e.target.value));
                  if (viewAllDays) setViewAllDays(false);
                }}
                className="slider-input"
              />
              <div className="slider-ticks">
                <button className={`tick-btn ${dayOffset === -7 ? 'active' : ''}`} onClick={() => { setDayOffset(-7); setViewAllDays(false); }}>-7d</button>
                <button className={`tick-btn ${dayOffset === -1 ? 'active' : ''}`} onClick={() => { setDayOffset(-1); setViewAllDays(false); }}>Ayer</button>
                <button className={`tick-btn ${dayOffset === 0 ? 'active' : ''}`} onClick={() => { setDayOffset(0); setViewAllDays(false); }}>Hoy</button>
                <button className={`tick-btn ${dayOffset === 1 ? 'active' : ''}`} onClick={() => { setDayOffset(1); setViewAllDays(false); }}>Mañana</button>
                <button className={`tick-btn ${dayOffset === 7 ? 'active' : ''}`} onClick={() => { setDayOffset(7); setViewAllDays(false); }}>+7d</button>
                <button className={`tick-btn ${dayOffset === 14 ? 'active' : ''}`} onClick={() => { setDayOffset(14); setViewAllDays(false); }}>+14d (Futuro)</button>
              </div>
            </div>
          </div>
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
                <MapPin size={13} style={{ color: "var(--accent)" }} />
                <span>Geohash: <code>{geohash.substring(0, 7)}</code> ({coords[0].toFixed(4)}, {coords[1].toFixed(4)})</span>
              </div>
              <div className="composer-meta-item" title="Momento temporal de anclaje">
                <Clock size={13} style={{ color: "#f1c40f" }} />
                <span className="composer-time-tag">{getTargetTimeLabel()}</span>
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
