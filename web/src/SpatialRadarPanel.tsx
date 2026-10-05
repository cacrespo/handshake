import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import {
  Globe,
  Layers,
  Compass,
  MapPin,
  Sun,
  Moon,
  Satellite,
  Radio,
  Filter,
  Plus
} from "lucide-react";
import GlobeView, { type GlobeMarker } from "./GlobeView";
import { decodeGeohash } from "./utils";

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
function MapEventsTracker({
  onClick,
  onClearTarget,
  onZoomOutToGlobe
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
    }
  });
  return null;
}

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

interface SpatialRadarPanelProps {
  coords: [number, number];
  gpsCoords: [number, number] | null;
  geohash: string;
  selectedZoneFilter: string | null;
  viewMode: "globe" | "map";
  mapStyle: MapStyle;
  showStyleMenu: boolean;
  mapTarget: [number, number] | null;
  globeMarkers: GlobeMarker[];
  filteredGraffitis: any[];
  localGraffitis: any[];
  trustedAuthors: string[];
  publicKey: string;
  onSetViewMode: (mode: "globe" | "map") => void;
  onSelectLocation: (lat: number, lon: number, markerData?: any) => void;
  onClearMapTarget: () => void;
  onToggleStyleMenu: () => void;
  onSelectMapStyle: (style: MapStyle) => void;
  onToggleZoneFilter: (geohashZone: string) => void;
  onClearZoneFilter: () => void;
  onCenterUserLocation: () => void;
  onOpenComposerHere: () => void;
  onToggleTrust: (pubkey: string) => void;
  onSaveAndSeed: (graf: any) => void;
  onReplyTo: (graf: any) => void;
}

export default function SpatialRadarPanel({
  coords,
  geohash,
  selectedZoneFilter,
  viewMode,
  mapStyle,
  showStyleMenu,
  mapTarget,
  globeMarkers,
  filteredGraffitis,
  localGraffitis,
  trustedAuthors,
  publicKey,
  onSetViewMode,
  onSelectLocation,
  onClearMapTarget,
  onToggleStyleMenu,
  onSelectMapStyle,
  onToggleZoneFilter,
  onClearZoneFilter,
  onCenterUserLocation,
  onOpenComposerHere,
  onToggleTrust,
  onSaveAndSeed,
  onReplyTo
}: SpatialRadarPanelProps) {
  const currentZone = geohash.substring(0, 5);
  const isFilteredToCurrentZone = selectedZoneFilter === currentZone;

  return (
    <aside className="triad-panel triad-spatial-panel" data-testid="spatial-radar-panel">
      {/* Panel Header */}
      <div className="triad-panel-header">
        <div className="panel-title-group">
          <div className="panel-icon-badge radar-icon-badge">
            <Radio size={16} className="text-neon-cyan" />
            <span className="radar-live-beacon" />
          </div>
          <div>
            <h3 className="triad-panel-title">Radar Espacial</h3>
            <span className="triad-panel-ratio">25% • Dónde</span>
          </div>
        </div>

        {/* View Mode Switcher Toggle */}
        <div className="view-mode-toggle">
          <button
            className={`view-mode-btn ${viewMode === "globe" ? "active" : ""}`}
            onClick={() => onSetViewMode("globe")}
            title="Vista Global 3D (Radio Garden / Radio Atlas)"
          >
            <Globe size={13} />
            <span>Globo 3D</span>
          </button>
          <button
            className={`view-mode-btn ${viewMode === "map" ? "active" : ""}`}
            onClick={() => onSetViewMode("map")}
            title="Vista de Mapa 2D Local"
          >
            <Layers size={13} />
            <span>Mapa 2D</span>
          </button>
        </div>
      </div>

      {/* Spatial HUD Info Bar */}
      <div className="spatial-hud-bar">
        <div className="spatial-hud-chip" title="Geohash de la celda activa">
          <MapPin size={12} className="text-neon-cyan" />
          <span>Sector: <code>{geohash.substring(0, 7)}</code></span>
        </div>
        <div className="spatial-hud-chip" title="Graffitis detectados en radar">
          <span className="p2p-pulse-dot emerald" style={{ width: "6px", height: "6px" }} />
          <span>{globeMarkers.length} nodos activos</span>
        </div>
        <button
          className="spatial-gps-btn"
          onClick={onCenterUserLocation}
          title="Centrar radar en mi posición actual"
        >
          <Compass size={13} />
          <span>Mi Ubicación</span>
        </button>
      </div>

      {/* Main Radar Viewport (3D Globe or 2D Leaflet Map) */}
      <div className="spatial-viewport-container">
        {viewMode === "globe" ? (
          <GlobeView
            markers={globeMarkers}
            userCoords={coords}
            activeCoords={coords}
            onSelectLocation={(lat, lon, marker) => {
              onSelectLocation(lat, lon, marker);
            }}
            onSwitchTo2D={() => {
              onSetViewMode("map");
            }}
          />
        ) : (
          <div className="leaflet-wrapper" style={{ position: "relative", width: "100%", height: "100%" }}>
            {/* Back to Globe Floating Button */}
            <button
              className="btn btn-secondary btn-globe-return"
              onClick={() => onSetViewMode("globe")}
              title="Volver a la vista 3D del Globo terráqueo"
            >
              <Globe size={13} style={{ color: "var(--neon-cyan)" }} />
              <span>Vista Globo 3D</span>
            </button>

            {/* Map Style Selector */}
            <div className="map-style-selector">
              <button
                className="map-style-btn"
                onClick={onToggleStyleMenu}
                title="Cambiar estilo visual del mapa"
              >
                <Layers size={14} />
                <span>{MAP_STYLES[mapStyle].label}</span>
              </button>

              {showStyleMenu && (
                <div className="map-style-dropdown">
                  <button
                    className={`map-style-option ${mapStyle === "clean_light" ? "active" : ""}`}
                    onClick={() => { onSelectMapStyle("clean_light"); }}
                  >
                    <Sun size={13} />
                    <span>Minimalista Claro</span>
                  </button>
                  <button
                    className={`map-style-option ${mapStyle === "comic" ? "active" : ""}`}
                    onClick={() => { onSelectMapStyle("comic"); }}
                  >
                    <Globe size={13} />
                    <span>Cómic / Ilustración</span>
                  </button>
                  <button
                    className={`map-style-option ${mapStyle === "streets_hd" ? "active" : ""}`}
                    onClick={() => { onSelectMapStyle("streets_hd"); }}
                  >
                    <Globe size={13} />
                    <span>Calles HD (Esri)</span>
                  </button>
                  <button
                    className={`map-style-option ${mapStyle === "satellite" ? "active" : ""}`}
                    onClick={() => { onSelectMapStyle("satellite"); }}
                  >
                    <Satellite size={13} />
                    <span>Satélite HD</span>
                  </button>
                  <button
                    className={`map-style-option ${mapStyle === "dark_gray" ? "active" : ""}`}
                    onClick={() => { onSelectMapStyle("dark_gray"); }}
                  >
                    <Moon size={13} />
                    <span>Dark Canvas</span>
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
                  onSelectLocation(lat, lon);
                }}
                onClearTarget={onClearMapTarget}
                onZoomOutToGlobe={() => onSetViewMode("globe")}
              />

              {/* Visibility Rings */}
              <Circle
                center={coords}
                radius={200}
                pathOptions={{ color: "var(--neon-cyan)", fillColor: "var(--neon-cyan)", fillOpacity: 0.08, dashArray: "4, 4" }}
              />
              <Circle
                center={coords}
                radius={1000}
                pathOptions={{ color: "var(--neon-violet)", fillColor: "var(--neon-violet)", fillOpacity: 0.03, dashArray: "8, 8" }}
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
                      onClick={onOpenComposerHere}
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
                  const typeClass = isTrusted ? "trusted" : isLocal ? "local" : "remote";

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
                            <span><strong>Fecha:</strong> {new Date(graf.header.timestamp * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                            <span><strong>Geohash:</strong> <code>{graf.location.geohash}</code></span>
                          </div>
                          <div className="popup-actions">
                            {graf.header.author_pk !== publicKey && (
                              <>
                                <button
                                  className="btn btn-secondary popup-btn"
                                  onClick={() => onToggleTrust(graf.header.author_pk)}
                                >
                                  🤝 {isTrusted ? "Desconfiar" : "Handshake"}
                                </button>
                                <button
                                  className="btn btn-secondary popup-btn"
                                  onClick={() => onReplyTo(graf)}
                                >
                                  💬 Responder
                                </button>
                              </>
                            )}
                            {!isLocal && (
                              <button
                                className="btn btn-primary popup-btn"
                                onClick={() => onSaveAndSeed(graf)}
                              >
                                📥 Guardar
                              </button>
                            )}
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

      {/* Radar Bottom Controls & Zone Filter Coordinator */}
      <div className="spatial-radar-footer">
        <div className="spatial-coords-readout">
          <span>Coordenadas: <code>{coords[0].toFixed(4)}, {coords[1].toFixed(4)}</code></span>
        </div>
        <div className="spatial-footer-actions">
          {selectedZoneFilter ? (
            <button
              className="btn btn-secondary btn-sm spatial-filter-btn active"
              onClick={onClearZoneFilter}
              title="Quitar filtro de celda y ver todos los graffitis"
            >
              <Filter size={12} />
              <span>Zona: <code>{selectedZoneFilter}</code> (Limpiar)</span>
            </button>
          ) : (
            <button
              className={`btn btn-secondary btn-sm spatial-filter-btn ${isFilteredToCurrentZone ? "active" : ""}`}
              onClick={() => onToggleZoneFilter(currentZone)}
              title="Filtrar el feed de mensajes a esta zona espacial"
            >
              <Filter size={12} />
              <span>Filtrar Feed a Celda <code>{currentZone}</code></span>
            </button>
          )}

          <button
            className="btn btn-primary btn-sm"
            onClick={onOpenComposerHere}
            title="Escribir graffiti en este punto"
          >
            <Plus size={13} />
            <span>Pintar Aquí</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
