import React, { useState, useMemo } from "react";
import {
  MessageSquare,
  Plus,
  Search,
  Filter,
  X,
  MapPin,
  Clock,
  Inbox,
  Send,
} from "lucide-react";
import MessageCard from "./MessageCard";
import { buildThreadTrees, type TemporalFilter } from "../storage/query";

export interface MessageStreamProps {
  messages: any[];
  allMessages: any[];
  userCoords: [number, number];
  publicKey: string;
  trustedAuthors: string[];
  pinnedSignatures: Set<string>;
  activeGraffitiId: string | null;
  selectedGeohash: string | null;
  temporalFilter: TemporalFilter;
  searchQuery: string;
  categoryFilter: "all" | "trusted" | "local" | "pinned" | "mine";
  onSelectMessage: (msg: any) => void;
  onFocusRadar: (coords: [number, number], geohash: string, sig?: string) => void;
  onClearGeohashFilter: () => void;
  onClearTemporalFilter: () => void;
  onClearSearch: () => void;
  onSetSearchQuery: (query: string) => void;
  onSetCategoryFilter: (cat: "all" | "trusted" | "local" | "pinned" | "mine") => void;
  onTogglePin: (sig: string) => void;
  onToggleTrust: (authorPk: string) => void;
  onReply: (parent: any) => void;
  onSaveAndSeed: (msg: any) => void;
  onOpenComposer: () => void;
  onQuickPost?: (text: string) => Promise<void>;
}

export const MessageStream: React.FC<MessageStreamProps> = ({
  messages,
  allMessages,
  userCoords,
  publicKey,
  trustedAuthors,
  pinnedSignatures,
  activeGraffitiId,
  selectedGeohash,
  temporalFilter,
  searchQuery,
  categoryFilter,
  onSelectMessage,
  onFocusRadar,
  onClearGeohashFilter,
  onClearTemporalFilter,
  onClearSearch,
  onSetSearchQuery,
  onSetCategoryFilter,
  onTogglePin,
  onToggleTrust,
  onReply,
  onSaveAndSeed,
  onOpenComposer,
  onQuickPost,
}) => {
  const [quickText, setQuickText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Parent snippet lookup for reply context banners
  const parentLookup = useMemo(() => {
    const map = new Map<string, { author: string; text: string }>();
    allMessages.forEach((m) => {
      const sig = m.header?.signature || m.signature;
      if (sig) {
        map.set(sig, {
          author: m.header?.author_pk || m.author_pk || "",
          text: m.content?.text || "",
        });
      }
    });
    return map;
  }, [allMessages]);

  const findParentSnippet = (parentSig: string) => {
    return parentLookup.get(parentSig) || null;
  };

  // Build conversational trees
  const threadTrees = useMemo(() => {
    return buildThreadTrees(messages);
  }, [messages]);

  const hasActiveFilters = Boolean(
    selectedGeohash ||
    (temporalFilter && temporalFilter.dimension !== "all") ||
    searchQuery.trim().length > 0 ||
    categoryFilter !== "all"
  );

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickText.trim() || !onQuickPost || isSubmitting) return;
    try {
      setIsSubmitting(true);
      await onQuickPost(quickText.trim());
      setQuickText("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="message-stream-hero" aria-label="Sovereign Message Stream (50% Hero)">
      {/* Stream Header */}
      <header className="stream-header-cockpit">
        <div className="stream-title-row">
          <div className="stream-headline">
            <div className="stream-icon-badge">
              <MessageSquare size={18} className="icon-cyan" />
            </div>
            <div>
              <h2 className="stream-heading">Flujo Soberano de Mensajes</h2>
              <span className="stream-subheading">
                Centro de gravedad: Huellas y graffitis anclados en espacio y tiempo
              </span>
            </div>
          </div>

          <div className="stream-header-actions">
            <span className="badge badge-counter" data-testid="stream-message-count">
              {messages.length} graffitis
            </span>
            <button
              className="btn btn-primary btn-compose-hero"
              onClick={onOpenComposer}
              title="Pintar nuevo graffiti soberano"
              data-testid="btn-compose-graffiti"
            >
              <Plus size={16} />
              <span>Nuevo Graffiti</span>
            </button>
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="stream-controls-bar">
          {/* Search Input */}
          <div className="stream-search-wrapper">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              className="stream-search-input"
              placeholder="Buscar por texto, clave pública o geohash..."
              value={searchQuery}
              onChange={(e) => onSetSearchQuery(e.target.value)}
              data-testid="stream-search-input"
            />
            {searchQuery && (
              <button
                className="search-clear-btn"
                onClick={onClearSearch}
                title="Limpiar búsqueda"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Category Filter Pills */}
          <div className="stream-category-pills">
            <button
              className={`pill-tab ${categoryFilter === "all" ? "active" : ""}`}
              onClick={() => onSetCategoryFilter("all")}
            >
              Todos
            </button>
            <button
              className={`pill-tab ${categoryFilter === "trusted" ? "active" : ""}`}
              onClick={() => onSetCategoryFilter("trusted")}
              title="Filtrar por contactos de confianza"
            >
              ★ Confiables
            </button>
            <button
              className={`pill-tab ${categoryFilter === "pinned" ? "active" : ""}`}
              onClick={() => onSetCategoryFilter("pinned")}
              title="Filtrar mensajes fijados"
            >
              📌 Fijados
            </button>
            <button
              className={`pill-tab ${categoryFilter === "local" ? "active" : ""}`}
              onClick={() => onSetCategoryFilter("local")}
              title="Filtrar graffitis guardados localmente"
            >
              ● Locales
            </button>
            <button
              className={`pill-tab ${categoryFilter === "mine" ? "active" : ""}`}
              onClick={() => onSetCategoryFilter("mine")}
              title="Filtrar graffitis creados por mí"
            >
              Míos
            </button>
          </div>
        </div>

        {/* Active Filter Chips Banner */}
        {hasActiveFilters && (
          <div className="active-filters-chips-tray" data-testid="active-filters-tray">
            <span className="filters-label">
              <Filter size={11} /> Filtros activos:
            </span>

            {selectedGeohash && (
              <span className="filter-chip spatial" data-testid="chip-filter-geohash">
                <MapPin size={11} />
                <span>Zona: <code>{selectedGeohash}</code></span>
                <button
                  onClick={onClearGeohashFilter}
                  title="Eliminar filtro espacial"
                  className="chip-remove"
                >
                  <X size={12} />
                </button>
              </span>
            )}

            {temporalFilter && temporalFilter.dimension !== "all" && (
              <span className="filter-chip temporal" data-testid="chip-filter-temporal">
                <Clock size={11} />
                <span>
                  Tiempo:{" "}
                  {temporalFilter.dimension === "past"
                    ? "Archivos Históricos"
                    : temporalFilter.dimension === "present"
                    ? "En Vivo / Hoy"
                    : temporalFilter.dimension === "future"
                    ? "Cápsulas Futuras"
                    : temporalFilter.epoch
                    ? `Época ${temporalFilter.epoch}`
                    : temporalFilter.label || "Filtro Temporal"}
                </span>
                <button
                  onClick={onClearTemporalFilter}
                  title="Eliminar filtro temporal"
                  className="chip-remove"
                >
                  <X size={12} />
                </button>
              </span>
            )}

            {searchQuery.trim().length > 0 && (
              <span className="filter-chip search">
                <Search size={11} />
                <span>Texto: "{searchQuery}"</span>
                <button
                  onClick={onClearSearch}
                  title="Eliminar filtro de texto"
                  className="chip-remove"
                >
                  <X size={12} />
                </button>
              </span>
            )}

            {categoryFilter !== "all" && (
              <span className="filter-chip category">
                <span>Categoría: {categoryFilter}</span>
                <button
                  onClick={() => onSetCategoryFilter("all")}
                  title="Mostrar todos"
                  className="chip-remove"
                >
                  <X size={12} />
                </button>
              </span>
            )}
          </div>
        )}
      </header>

      {/* Quick In-Stream Compose Box */}
      {onQuickPost && (
        <form onSubmit={handleQuickSubmit} className="stream-quick-compose-box">
          <div className="quick-compose-inner">
            <input
              type="text"
              className="quick-compose-input"
              placeholder="Pintar un graffiti rápido en tus coordenadas actuales..."
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
              disabled={isSubmitting}
            />
            <button
              type="submit"
              className="btn btn-primary btn-quick-send"
              disabled={!quickText.trim() || isSubmitting}
              title="Publicar graffiti"
            >
              <Send size={14} />
              <span>Pintar</span>
            </button>
          </div>
        </form>
      )}

      {/* Main Conversational Stream List */}
      <div className="stream-scroll-container">
        {threadTrees.length === 0 ? (
          <div className="stream-empty-state" data-testid="stream-empty-state">
            <div className="empty-icon-halo">
              <Inbox size={38} className="icon-empty" />
            </div>
            <h3 className="empty-title">Sin graffitis para este criterio</h3>
            <p className="empty-text">
              {hasActiveFilters
                ? "No se encontraron mensajes en esta zona del espacio-tiempo. Prueba a limpiar los filtros de geohash o época."
                : "No hay graffitis registrados aún en este nodo local. ¡Sé el primero en pintar una huella soberana!"}
            </p>
            <div className="empty-actions">
              {hasActiveFilters && (
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    onClearGeohashFilter();
                    onClearTemporalFilter();
                    onClearSearch();
                    onSetCategoryFilter("all");
                  }}
                >
                  Restablecer Filtros
                </button>
              )}
              <button className="btn btn-primary" onClick={onOpenComposer}>
                <Plus size={14} />
                <span>Pintar Primer Graffiti</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="stream-tree-threads">
            {threadTrees.map((rootNode: any, idx: number) => {
              const sig = rootNode.header?.signature || rootNode.signature || `root-${idx}`;
              return (
                <MessageCard
                  key={sig}
                  node={rootNode}
                  depth={0}
                  userCoords={userCoords}
                  publicKey={publicKey}
                  trustedAuthors={trustedAuthors}
                  pinnedSignatures={pinnedSignatures}
                  activeGraffitiId={activeGraffitiId}
                  onSelectMessage={onSelectMessage}
                  onFocusRadar={onFocusRadar}
                  onTogglePin={onTogglePin}
                  onToggleTrust={onToggleTrust}
                  onReply={onReply}
                  onSaveAndSeed={onSaveAndSeed}
                  findParentSnippet={findParentSnippet}
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default MessageStream;
