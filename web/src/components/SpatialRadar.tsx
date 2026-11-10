import React, { useState, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
  Circle,
} from "react-leaflet";
import L from "leaflet";
import {
  Globe,
  Layers,
  Radio,
  Satellite,
  Sun,
  Moon,
  X,
  Target,
} from "lucide-react";
import GlobeView, { type GlobeMarker } from "../GlobeView";
import { decodeGeohash, encodeGeohash, getMessageGeohash, getMessageTimestamp } from "../utils";
import { computeSpatialClusters, type SpatialCluster } from "../storage/query";

export type MapStyle = "clean_light" | "comic" | "streets_hd" | "satellite" | "dark_gray";

export interface MapStyleConfig {
  id: MapStyle;
  label: string;
  url: string;
  attribution: string;
  maxZoom: number;
}

export const MAP_STYLES: Record<MapStyle, MapStyleConfig> = {
  clean_light: {
    id: "clean_light",
    label: "Minimalista Claro",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ",
    maxZoom: 16,
  },
  comic: {
    id: "comic",
    label: "Estilo Ilustración",
    url: "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles by <a href="https://www.hotosm.org/">HOT</a>',
    maxZoom: 19,
  },
  streets_hd: {
    id: "streets_hd",
    label: "Calles HD (Esri)",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS",
    maxZoom: 19,
  },
  satellite: {
    id: "satellite",
    label: "Satélite HD (Esri)",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS",
    maxZoom: 19,
  },
  dark_gray: {
    id: "dark_gray",
    label: "Dark Canvas (Esri)",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ",
    maxZoom: 16,
  },
};

function MapController({
  center,
  target,
}: {
  center: [number, number];
  target: [number, number] | null;
}) {
  const map = useMap();
  React.useEffect(() => {
    if (target) {
      map.flyTo(target, 15, { animate: true, duration: 1.5 });
    } else {
      map.setView(center, map.getZoom());
    }
  }, [center, target, map]);
  return null;
}

function MapEventsTracker({
  onClick,
  onClearTarget,
  onZoomOutToGlobe,
}: {
  onClick: (lat: number, lon: number) => void;
  onClearTarget: () => void;
  onZoomOutToGlobe?: () => void;
}) {
  useMapEvents({
    click: (e) => {
      onClick(e.latlng.lat, e.latlng.lng);
    },
    movestart: () => {
      onClearTarget();
    },
    zoomend: (e) => {
      if (onZoomOutToGlobe && e.target.getZoom() <= 3) {
        onZoomOutToGlobe();
      }
    },
  });
  return null;
}

export interface SpatialRadarProps {
  userCoords: [number, number];
  activeCoords: [number, number];
  activeGeohash: string;
  selectedGeohash: string | null;
  activeGraffitiId: string | null;
  messages: any[];
  allMessages: any[];
  trustedAuthors: string[];
  publicKey: string;
  onSelectCoords: (coords: [number, number], geohash?: string) => void;
  onSelectGeohash: (geohash: string | null, coords?: [number, number]) => void;
  onSelectMessageId: (id: string) => void;
  onOpenComposer: (coords?: [number, number]) => void;
  className?: string;
}

export const SpatialRadar: React.FC<SpatialRadarProps> = ({
  userCoords,
  activeCoords,
  activeGeohash,
  selectedGeohash,
  activeGraffitiId,
  messages,
  allMessages,
  trustedAuthors,
  publicKey,
  onSelectCoords,
  onSelectGeohash,
  onSelectMessageId,
  onOpenComposer,
  className = "",
}) => {
  const [viewMode, setViewMode] = useState<"globe" | "map">("globe");
  const [mapStyle, setMapStyle] = useState<MapStyle>("clean_light");
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [mapTarget, setMapTarget] = useState<[number, number] | null>(null);

  // Sync mapTarget when activeCoords changes
  React.useEffect(() => {
    setMapTarget(activeCoords);
  }, [activeCoords]);

  // Compute spatial clusters from all messages
  const clusters: SpatialCluster[] = useMemo(() => {
    return computeSpatialClusters(allMessages, 4);
  }, [allMessages]);

  // Convert messages to 3D Globe markers
  const globeMarkers: GlobeMarker[] = useMemo(() => {
    const list: GlobeMarker[] = [];
    messages.forEach((m, idx) => {
      try {
        const gh = getMessageGeohash(m);
        const c = decodeGeohash(gh);
        const author = m.header?.author_pk || m.author_pk || "";
        const sig = m.header?.signature || m.signature || `g-${idx}`;
        const isTrusted = trustedAuthors.includes(author);
        const isLocal = Boolean(m.is_local);

        list.push({
          id: sig,
          lat: c.lat,
          lon: c.lon,
          geohash: gh,
          text: m.content?.text || "",
          author,
          timestamp: getMessageTimestamp(m),
          isLocal,
          isTrusted,
          raw: m,
        });
      } catch {
        // ignore invalid geohash
      }
    });
    return list;
  }, [messages, trustedAuthors]);

  const handleGlobeSelectLocation = (lat: number, lon: number, marker?: GlobeMarker) => {
    const gh = marker ? marker.geohash : encodeGeohash(lat, lon, 7);
    onSelectCoords([lat, lon], gh);
    onSelectGeohash(gh.substring(0, 5), [lat, lon]);
    if (marker) {
      onSelectMessageId(marker.id);
    }
  };

  const handleMapClick = (lat: number, lon: number) => {
    const gh = encodeGeohash(lat, lon, 7);
    onSelectCoords([lat, lon], gh);
    onSelectGeohash(gh.substring(0, 5), [lat, lon]);
  };

  return (
    <aside className={`spatial-radar-panel ${className}`} aria-label="Spatial Context & Radar (25% Where)">
      {/* Radar Panel Header */}
      <div className="radar-header">
        <div className="radar-title-group">
          <div className="radar-live-badge">
            <Radio size={14} className="radar-pulse-icon" />
          </div>
          <div>
            <h3 className="radar-heading">Radar Espacial</h3>
            <span className="radar-coords-text">
              <code>{activeGeohash.substring(0, 7)}</code> ({activeCoords[0].toFixed(3)}, {activeCoords[1].toFixed(3)})
            </span>
          </div>
        </div>

        {/* 3D Globe / 2D Map Switcher */}
        <div className="radar-view-switcher">
          <button
            className={`radar-tab-btn ${viewMode === "globe" ? "active" : ""}`}
            onClick={() => setViewMode("globe")}
            title="Vista Global 3D (Radio Garden / Radio Atlas)"
            data-testid="radar-btn-globe"
          >
            <Globe size={13} />
            <span>Globo 3D</span>
          </button>
          <button
            className={`radar-tab-btn ${viewMode === "map" ? "active" : ""}`}
            onClick={() => setViewMode("map")}
            title="Vista de Mapa 2D Local"
            data-testid="radar-btn-map"
          >
            <Layers size={13} />
            <span>Mapa 2D</span>
          </button>
        </div>
      </div>

      {/* Active Spatial Filter Indicator */}
      {selectedGeohash && (
        <div className="radar-filter-bar">
          <div className="filter-geohash-info">
            <Target size={12} className="text-cyan" />
            <span>Filtrando zona: <code>{selectedGeohash}</code></span>
          </div>
          <button
            className="filter-clear-btn"
            onClick={() => onSelectGeohash(null)}
            title="Restablecer filtro espacial (Ver todas las zonas)"
          >
            <X size={12} />
            <span>Quitar filtro</span>
          </button>
        </div>
      )}

      {/* Main Viewport Container */}
      <div className="radar-viewport-container">
        {viewMode === "globe" ? (
          <GlobeView
            markers={globeMarkers}
            userCoords={userCoords}
            activeCoords={activeCoords}
            onSelectLocation={handleGlobeSelectLocation}
            onSwitchTo2D={() => setViewMode("map")}
            className="radar-globe-instance"
          />
        ) : (
          <div className="radar-leaflet-wrapper">
            <button
              className="btn btn-secondary"
              style={{
                position: "absolute",
                top: "12px",
                left: "12px",
                zIndex: 999,
                background: "rgba(13, 17, 27, 0.88)",
                backdropFilter: "blur(16px)",
                border: "1px solid var(--border-glow)",
                boxShadow: "0 4px 20px rgba(0,0,0,0.5), 0 0 15px var(--neon-cyan-glow)",
                color: "#ffffff",
                fontSize: "11px",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "4px 8px",
                height: "28px",
              }}
              onClick={() => setViewMode("globe")}
              title="Volver a la vista 3D del Globo terráqueo"
            >
              <Globe size={13} style={{ color: "var(--neon-cyan)" }} />
              <span>🌐 Vista Globo 3D</span>
            </button>

            {/* Map Style Selector Overlay */}
            <div className="radar-map-style-menu">
              <button
                className="map-style-toggle-btn"
                onClick={() => setShowStyleMenu(!showStyleMenu)}
                title="Cambiar capa visual de mapa"
              >
                <Layers size={14} />
              </button>

              {showStyleMenu && (
                <div className="map-style-popover">
                  {Object.values(MAP_STYLES).map((style) => (
                    <button
                      key={style.id}
                      className={`map-style-item ${mapStyle === style.id ? "active" : ""}`}
                      onClick={() => {
                        setMapStyle(style.id);
                        setShowStyleMenu(false);
                      }}
                    >
                      {style.id === "clean_light" ? (
                        <Sun size={12} />
                      ) : style.id === "satellite" ? (
                        <Satellite size={12} />
                      ) : (
                        <Moon size={12} />
                      )}
                      <span>{style.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <MapContainer
              center={activeCoords}
              zoom={13}
              className={`leaflet-map map-style-${mapStyle}`}
              zoomControl={false}
            >
              <TileLayer
                key={mapStyle}
                attribution={MAP_STYLES[mapStyle].attribution}
                url={MAP_STYLES[mapStyle].url}
                maxZoom={MAP_STYLES[mapStyle].maxZoom}
              />

              <MapController center={activeCoords} target={mapTarget} />
              <MapEventsTracker
                onClick={handleMapClick}
                onClearTarget={() => setMapTarget(null)}
                onZoomOutToGlobe={() => setViewMode("globe")}
              />

              {/* Visibility Rings */}
              <Circle
                center={userCoords}
                radius={200}
                pathOptions={{
                  color: "var(--accent)",
                  fillColor: "var(--accent)",
                  fillOpacity: 0.08,
                  dashArray: "4, 4",
                }}
              />
              <Circle
                center={userCoords}
                radius={1000}
                pathOptions={{
                  color: "var(--accent-hover)",
                  fillColor: "var(--accent-hover)",
                  fillOpacity: 0.03,
                  dashArray: "8, 8",
                }}
              />

              {/* User Node Marker */}
              <Marker
                position={userCoords}
                icon={L.divIcon({
                  className: "custom-marker",
                  html: `
                    <div class="user-beacon">
                      <div class="user-beacon-ping"></div>
                      <div class="user-beacon-core"></div>
                    </div>
                  `,
                  iconSize: [28, 28],
                  iconAnchor: [14, 14],
                })}
              >
                <Popup className="handshake-popup">
                  <div className="popup-card">
                    <div className="popup-badge you">Tu Posición (Beacon)</div>
                    <div className="popup-meta">
                      <div><strong>Geohash:</strong> <code>{activeGeohash}</code></div>
                      <div><strong>ID:</strong> <code>{publicKey.substring(0, 10)}...</code></div>
                    </div>
                    <button
                      className="btn btn-primary popup-btn"
                      style={{ marginTop: "6px" }}
                      onClick={() => onOpenComposer(userCoords)}
                    >
                      ✍️ Pintar aquí
                    </button>
                  </div>
                </Popup>
              </Marker>

              {/* Message Pins on 2D Map */}
              {messages.map((m, idx) => {
                try {
                  const gh = getMessageGeohash(m);
                  const c = decodeGeohash(gh);
                  const sig = m.header?.signature || m.signature || `m-${idx}`;
                  const author = m.header?.author_pk || m.author_pk || "";
                  const isTrusted = trustedAuthors.includes(author);
                  const isLocal = Boolean(m.is_local);
                  const isSelected = activeGraffitiId === sig;
                  const typeClass = isTrusted ? "trusted" : isLocal ? "local" : "remote";

                  return (
                    <Marker
                      key={`pin-${sig}`}
                      position={[c.lat, c.lon]}
                      icon={L.divIcon({
                        className: "custom-marker",
                        html: `
                          <div class="graffiti-pin ${typeClass} ${isSelected ? "selected-ring" : ""}">
                            <div class="graffiti-pin-glow"></div>
                            <div class="graffiti-pin-dot"></div>
                          </div>
                        `,
                        iconSize: [26, 26],
                        iconAnchor: [13, 13],
                      })}
                      eventHandlers={{
                        click: () => {
                          onSelectCoords([c.lat, c.lon], gh);
                          onSelectMessageId(sig);
                        },
                      }}
                    >
                      <Popup className="handshake-popup">
                        <div className="popup-card">
                          <p className="popup-text">"{m.content?.text}"</p>
                          <div className="popup-details">
                            <span><strong>Geohash:</strong> <code>{gh}</code></span>
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  );
                } catch {
                  return null;
                }
              })}
            </MapContainer>
          </div>
        )}
      </div>

      {/* Spatial Cluster Pulses (Radio Garden style) */}
      <div className="radar-clusters-section">
        <div className="clusters-header">
          <span className="clusters-title">
            <Radio size={12} className="text-cyan" /> Zonas y Clústeres Activos
          </span>
          <span className="clusters-count">{clusters.length} zonas</span>
        </div>

        <div className="clusters-list-scroll">
          {clusters.length === 0 ? (
            <div className="clusters-empty">Sin clústeres espaciales registrados</div>
          ) : (
            clusters.map((c) => {
              const isSelected = selectedGeohash && c.geohash.startsWith(selectedGeohash);
              return (
                <button
                  key={c.geohash}
                  className={`cluster-zone-card ${isSelected ? "active" : ""}`}
                  onClick={() => {
                    onSelectCoords([c.lat, c.lon], c.geohash);
                    onSelectGeohash(c.geohash, [c.lat, c.lon]);
                  }}
                  title={`Filtrar mensajes en la zona ${c.geohash}`}
                >
                  <div className="cluster-left">
                    <span className="cluster-pulse-dot" />
                    <code className="cluster-hash">{c.geohash}</code>
                  </div>
                  <div className="cluster-right">
                    <span className="cluster-badge-count">{c.count} huellas</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
};

export default SpatialRadar;
