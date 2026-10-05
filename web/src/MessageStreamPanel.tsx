import { useState } from "react";
import {
  MessageSquare,
  MapPin,
  Clock,
  ShieldCheck,
  CornerDownRight,
  Plus,
  Filter,
  X,
  Radio,
  Search,
  Sparkles
} from "lucide-react";
import { decodeGeohash } from "./utils";

function getAuthorAvatar(pubkey: string) {
  if (!pubkey) return { bg: "#3b82f6", initials: "??", snippet: "anon" };
  let hash = 0;
  for (let i = 0; i < pubkey.length; i++) {
    hash = pubkey.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue1 = Math.abs(hash % 360);
  const hue2 = (hue1 + 50) % 360;
  const initials = pubkey.substring(0, 2).toUpperCase();
  const bg = `linear-gradient(135deg, hsl(${hue1}, 75%, 48%), hsl(${hue2}, 85%, 38%))`;
  return { bg, initials, snippet: pubkey.substring(0, 8) };
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // metres
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

function getEpochInfo(timestamp: number) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startTodaySec = Math.floor(startOfToday.getTime() / 1000);

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const endTodaySec = Math.floor(endOfToday.getTime() / 1000);

  if (timestamp < startTodaySec) {
    return {
      type: "past" as const,
      label: "Archivo Histórico",
      icon: "🏛️",
      badgeClass: "badge-past"
    };
  }
  if (timestamp > endTodaySec) {
    return {
      type: "future" as const,
      label: "Cápsula Futura",
      icon: "⏳",
      badgeClass: "badge-future"
    };
  }
  return {
    type: "present" as const,
    label: "En Vivo",
    icon: "⚡",
    badgeClass: "badge-present"
  };
}

interface MessageStreamPanelProps {
  graffitis: any[];
  allGraffitisCount: number;
  localGraffitis: any[];
  trustedAuthors: string[];
  publicKey: string;
  coords: [number, number];
  selectedZoneFilter: string | null;
  activeEpoch: "all" | "past" | "present" | "future";
  dayOffset: number;
  viewAllDays: boolean;
  selectedMessageSig: string | null;
  onSelectMessage: (graf: any) => void;
  onReplyTo: (graf: any) => void;
  onToggleTrust: (pubkey: string) => void;
  onSaveAndSeed: (graf: any) => void;
  onClearZoneFilter: () => void;
  onClearEpochFilter: () => void;
  onOpenComposer: () => void;
  onLoadSeedArchives: () => void;
}

export default function MessageStreamPanel({
  graffitis,
  allGraffitisCount,
  localGraffitis,
  trustedAuthors,
  publicKey,
  coords,
  selectedZoneFilter,
  activeEpoch,
  dayOffset,
  viewAllDays,
  selectedMessageSig,
  onSelectMessage,
  onReplyTo,
  onToggleTrust,
  onSaveAndSeed,
  onClearZoneFilter,
  onClearEpochFilter,
  onOpenComposer,
  onLoadSeedArchives
}: MessageStreamPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedThreads, setExpandedThreads] = useState<{ [sig: string]: boolean }>({});

  const toggleThread = (sig: string) => {
    setExpandedThreads(prev => ({ ...prev, [sig]: !prev[sig] }));
  };

  // Helper to build recursive thread trees from flat messages list
  const buildThreadTrees = (items: any[]) => {
    const map: { [sig: string]: any & { replies: any[] } } = {};
    items.forEach(g => {
      if (g.header && g.header.signature) {
        map[g.header.signature] = { ...g, replies: [] };
      }
    });
    const roots: any[] = [];
    items.forEach(g => {
      if (!g.header || !g.header.signature) return;
      const mapped = map[g.header.signature];
      const parentSig = g.header.parent_signature;
      if (parentSig && map[parentSig]) {
        map[parentSig].replies.push(mapped);
      } else {
        roots.push(mapped);
      }
    });
    roots.sort((a, b) => b.header.timestamp - a.header.timestamp);
    const sortReplies = (node: any) => {
      node.replies.sort((a: any, b: any) => a.header.timestamp - b.header.timestamp);
      node.replies.forEach(sortReplies);
    };
    roots.forEach(sortReplies);
    return roots;
  };

  // Search filter
  const displayedGraffitis = graffitis.filter(g => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const textMatch = g.content?.text?.toLowerCase().includes(q);
    const geohashMatch = g.location?.geohash?.toLowerCase().includes(q);
    const authorMatch = g.header?.author_pk?.toLowerCase().includes(q);
    return textMatch || geohashMatch || authorMatch;
  });

  const threadTrees = buildThreadTrees(displayedGraffitis);

  // Recursive Thread Card
  const ThreadCard = ({ node, depth = 0 }: { node: any; depth: number }) => {
    const isLocal = localGraffitis.some(g => g.header?.signature === node.header?.signature);
    const isTrusted = trustedAuthors.includes(node.header?.author_pk);
    const isSelected = selectedMessageSig === node.header?.signature;
    const gCoords = decodeGeohash(node.location?.geohash || "69y7p2d");
    const dist = getDistance(coords[0], coords[1], gCoords.lat, gCoords.lon);
    const avatar = getAuthorAvatar(node.header?.author_pk || "");
    const epoch = getEpochInfo(node.header?.timestamp || 0);
    const hasReplies = node.replies && node.replies.length > 0;
    const isExpanded = expandedThreads[node.header?.signature] !== false; // default open

    const dateObj = new Date(node.header?.timestamp * 1000);
    const timeFormatted = dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const dateFormatted = dateObj.toLocaleDateString("es-AR", { day: "numeric", month: "short" });

    return (
      <div
        className={`thread-container depth-${depth}`}
        style={{
          marginLeft: depth > 0 ? "20px" : "0",
          borderLeft: depth > 0 ? "2px solid rgba(0, 243, 255, 0.25)" : "none",
          paddingLeft: depth > 0 ? "14px" : "0",
          marginTop: depth > 0 ? "8px" : "12px",
          position: "relative"
        }}
      >
        <article
          className={`timeline-card ${isTrusted ? "trusted" : isLocal ? "local" : "remote"} ${isSelected ? "selected-focus" : ""}`}
          onClick={() => onSelectMessage(node)}
          data-testid={`message-card-${node.header?.signature?.substring(0, 8)}`}
        >
          {/* Card Top Metadata */}
          <div className="card-header-top">
            <div className="card-author-identity">
              <div className="avatar-identicon" style={{ background: avatar.bg }}>
                {avatar.initials}
              </div>
              <div className="avatar-meta">
                <div className="avatar-hash-chip">
                  <span className="card-author-hash">#{avatar.snippet}</span>
                  <span
                    className={`badge ${isTrusted ? "badge-success" : isLocal ? "badge-info" : "badge-warning"}`}
                    style={{ fontSize: "10px", padding: "1px 6px" }}
                  >
                    {isTrusted ? "★ Confiable" : isLocal ? "● Local" : "⚡ P2P"}
                  </span>
                  <span className="badge badge-crypto" title="Firma criptográfica Ed25519 verificada">
                    <ShieldCheck size={11} className="text-neon-cyan" />
                    <span>Ed25519</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Space-Time Badges */}
            <div className="card-spacetime-badges">
              {/* Epoch Indicator */}
              <span className={`epoch-pill ${epoch.badgeClass}`} title={`Dimensión: ${epoch.label}`}>
                <span>{epoch.icon}</span>
                <span>{epoch.label}</span>
              </span>

              {/* Spatial distance & Geohash */}
              <button
                className={`card-distance-chip ${isTrusted ? "trusted" : isLocal ? "local" : "remote"}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectMessage(node);
                }}
                title="Centrar coordenadas en Radar Espacial"
              >
                <MapPin size={11} />
                <span>{dist < 1000 ? `${dist.toFixed(0)}m` : `${(dist / 1000).toFixed(1)}km`}</span>
              </button>

              {/* Timestamp */}
              <span className="card-time" title={dateObj.toLocaleString()}>
                <Clock size={11} />
                <span>{dateFormatted}, {timeFormatted}</span>
              </span>
            </div>
          </div>

          {/* Conversational Context / Parent Link */}
          {node.header?.parent_signature && (
            <div className="parent-reply-crumb">
              <CornerDownRight size={12} className="text-neon-cyan" />
              <span>En respuesta a <code>#{node.header.parent_signature.substring(0, 8)}...</code></span>
            </div>
          )}

          {/* Card Message Body */}
          <div className="card-content-body">
            <p className="card-text">{node.content?.text}</p>
          </div>

          {/* Card Footer Actions */}
          <div className="card-footer-bar">
            <div className="card-geohash-badge">
              <span>Geohash: </span>
              <code>{node.location?.geohash}</code>
            </div>

            <div className="card-actions-group">
              {hasReplies && (
                <button
                  className="btn btn-ghost btn-sm thread-count-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleThread(node.header.signature);
                  }}
                  title="Expandir / colapsar respuestas"
                >
                  <MessageSquare size={12} />
                  <span>{node.replies.length} {node.replies.length === 1 ? "respuesta" : "respuestas"}</span>
                </button>
              )}

              {node.header?.author_pk !== publicKey && (
                <>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleTrust(node.header.author_pk);
                    }}
                    title="Alternar estado de confianza con este autor"
                  >
                    🤝 {isTrusted ? "Desconfiar" : "Handshake"}
                  </button>

                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onReplyTo(node);
                    }}
                    title="Responder a este mensaje en el mismo hilo espacial"
                  >
                    💬 Responder
                  </button>
                </>
              )}

              {!isLocal && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSaveAndSeed(node);
                  }}
                  title="Guardar y comenzar a seedear este graffiti en la red local"
                >
                  📥 Seedear
                </button>
              )}
            </div>
          </div>
        </article>

        {/* Recursive Indented Children Replies */}
        {hasReplies && isExpanded && (
          <div className="thread-replies-list">
            {node.replies.map((reply: any, rIdx: number) => (
              <ThreadCard key={`reply-${node.header.signature}-${rIdx}`} node={reply} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <main className="triad-panel triad-message-hero" data-testid="message-stream-hero">
      {/* Hero Header */}
      <div className="triad-panel-header hero-stream-header">
        <div className="panel-title-group">
          <div className="panel-icon-badge hero-icon-badge">
            <MessageSquare size={18} className="text-neon-cyan" />
          </div>
          <div>
            <h2 className="triad-panel-title hero-title">Transmisiones Soberanas</h2>
            <span className="triad-panel-ratio">50% • El Mensaje como Unidad Soberana</span>
          </div>
        </div>

        <div className="hero-header-actions">
          <button
            className="btn btn-primary btn-header-write"
            onClick={onOpenComposer}
            title="Escribir una nueva transmisión en el espacio-tiempo"
          >
            <Plus size={15} />
            <span>Nueva Transmisión</span>
          </button>
        </div>
      </div>

      {/* Active Filter Scope Chips Bar */}
      <div className="stream-scope-bar">
        <div className="scope-badges-list">
          <span className="scope-count-badge">
            <strong>{displayedGraffitis.length}</strong> huellas visibles
          </span>

          {selectedZoneFilter && (
            <div className="scope-filter-chip zone">
              <MapPin size={11} />
              <span>Zona: <code>{selectedZoneFilter}</code></span>
              <button onClick={onClearZoneFilter} title="Limpiar filtro de zona">
                <X size={12} />
              </button>
            </div>
          )}

          {activeEpoch !== "all" && (
            <div className={`scope-filter-chip epoch ${activeEpoch}`}>
              <Clock size={11} />
              <span>
                Época: {activeEpoch === "past" ? "🏛️ Pasado" : activeEpoch === "present" ? "⚡ Presente" : "⏳ Futuro"}
              </span>
              <button onClick={onClearEpochFilter} title="Mostrar todas las épocas">
                <X size={12} />
              </button>
            </div>
          )}

          {!viewAllDays && dayOffset !== 0 && (
            <div className="scope-filter-chip day">
              <span>Día: {dayOffset > 0 ? `+${dayOffset}d` : `${dayOffset}d`}</span>
            </div>
          )}
        </div>

        {/* Quick Search in stream */}
        <div className="stream-search-wrapper">
          <Search size={13} className="search-icon" />
          <input
            type="text"
            className="stream-search-input"
            placeholder="Buscar por texto, celda o clave..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="search-clear-btn" onClick={() => setSearchQuery("")}>
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Quick Compose Banner at Top of Stream */}
      <div className="stream-quick-compose-card" onClick={onOpenComposer}>
        <div className="quick-compose-avatar">✍️</div>
        <div className="quick-compose-prompt">
          <span>¿Qué huella deseas anclar en este espacio-tiempo? Haz clic para pintar...</span>
        </div>
        <button className="btn btn-secondary btn-sm quick-compose-btn">
          <Plus size={13} />
          <span>Componer</span>
        </button>
      </div>

      {/* Message Stream Scrollable List */}
      <div className="stream-scrollable-container">
        {threadTrees.length === 0 ? (
          <div className="stream-empty-state">
            <div className="empty-state-icon-glow">
              <Radio size={36} className="text-neon-cyan" />
            </div>
            <h4 className="empty-state-title">No hay graffitis en este rango espacio-temporal</h4>
            <p className="empty-state-desc">
              {selectedZoneFilter || activeEpoch !== "all"
                ? "Prueba restableciendo los filtros de celda o navegando por las 3 dimensiones del protocolo en el panel derecho."
                : "Sé el primero en dejar una huella soberana en estas coordenadas, o carga el corpus de demostración."}
            </p>
            <div className="empty-state-actions">
              {(selectedZoneFilter || activeEpoch !== "all") && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    onClearZoneFilter();
                    onClearEpochFilter();
                  }}
                >
                  <Filter size={12} />
                  <span>Restablecer Filtros</span>
                </button>
              )}
              <button className="btn btn-primary btn-sm" onClick={onOpenComposer}>
                <Plus size={12} />
                <span>Pintar Primera Huella</span>
              </button>
              {allGraffitisCount === 0 && (
                <button className="btn btn-secondary btn-sm" onClick={onLoadSeedArchives}>
                  <Sparkles size={12} />
                  <span>Cargar Semillas de Ejemplo</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="stream-threads-feed">
            {threadTrees.map((treeNode, idx) => (
              <ThreadCard key={`root-${treeNode.header?.signature || idx}`} node={treeNode} depth={0} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
