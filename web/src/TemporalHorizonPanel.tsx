import {
  Clock,
  Archive,
  Sparkles,
  Sliders,
  RotateCcw,
  Eye,
  Info
} from "lucide-react";

export type EpochDimension = "all" | "past" | "present" | "future";

interface TemporalHorizonPanelProps {
  activeEpoch: EpochDimension;
  dayOffset: number;
  viewAllDays: boolean;
  allGraffitis: any[];
  onSelectEpoch: (epoch: EpochDimension) => void;
  onSetDayOffset: (offset: number) => void;
  onToggleViewAllDays: () => void;
  onLoadSeedArchives: () => void;
  onOpenComposerWithOffset: (offset: number) => void;
}

export default function TemporalHorizonPanel({
  activeEpoch,
  dayOffset,
  viewAllDays,
  allGraffitis,
  onSelectEpoch,
  onSetDayOffset,
  onToggleViewAllDays,
  onLoadSeedArchives,
  onOpenComposerWithOffset
}: TemporalHorizonPanelProps) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startTodaySec = Math.floor(startOfToday.getTime() / 1000);

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const endTodaySec = Math.floor(endOfToday.getTime() / 1000);

  // Categorize graffitis into the 3 protocol dimensions
  const pastGraffitis = allGraffitis.filter(g => (g.header?.timestamp || 0) < startTodaySec);
  const presentGraffitis = allGraffitis.filter(g => {
    const t = g.header?.timestamp || 0;
    return t >= startTodaySec && t <= endTodaySec;
  });
  const futureGraffitis = allGraffitis.filter(g => (g.header?.timestamp || 0) > endTodaySec);

  const getSelectedDayText = (offset: number) => {
    if (offset === 0) return "Hoy (Tiempo Real)";
    if (offset === -1) return "Ayer (-1 día)";
    if (offset === 1) return "Mañana (+1 día)";
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" })} (${offset > 0 ? `+${offset}d` : `${offset}d`})`;
  };

  const totalCount = allGraffitis.length;
  const pastPct = totalCount > 0 ? (pastGraffitis.length / totalCount) * 100 : 0;
  const presentPct = totalCount > 0 ? (presentGraffitis.length / totalCount) * 100 : 0;
  const futurePct = totalCount > 0 ? (futureGraffitis.length / totalCount) * 100 : 0;

  return (
    <aside className="triad-panel triad-temporal-panel" data-testid="temporal-horizon-panel">
      {/* Panel Header */}
      <div className="triad-panel-header">
        <div className="panel-title-group">
          <div className="panel-icon-badge temporal-icon-badge">
            <Clock size={16} className="text-neon-amber" />
          </div>
          <div>
            <h3 className="triad-panel-title">Horizonte Temporal</h3>
            <span className="triad-panel-ratio">25% • Cuándo</span>
          </div>
        </div>

        {/* View All / Filter Day Toggle */}
        <button
          className={`btn btn-secondary btn-sm ${viewAllDays ? "btn-active-toggle" : ""}`}
          onClick={onToggleViewAllDays}
          title="Alternar entre ver solo el día seleccionado o todo el horizonte temporal"
        >
          <Eye size={12} />
          <span>{viewAllDays ? "Todo el Tiempo" : "Por Época"}</span>
        </button>
      </div>

      {/* 3 Protocol Dimensions Dial */}
      <div className="temporal-dial-section">
        <div className="temporal-section-subtitle">
          <span>Las 3 Dimensiones del Protocolo</span>
          <span className="info-tooltip" title="Handshake organiza el tiempo soberano en 3 regímenes: archivos custodiados, enjambre en tiempo real y cápsulas futuras.">
            <Info size={11} />
          </span>
        </div>

        <div className="epoch-cards-stack">
          {/* Dimension 1: PAST */}
          <button
            className={`epoch-dimension-card past ${activeEpoch === "past" ? "active" : ""}`}
            onClick={() => onSelectEpoch(activeEpoch === "past" ? "all" : "past")}
            data-testid="epoch-btn-past"
          >
            <div className="epoch-card-header">
              <div className="epoch-badge-title">
                <span className="epoch-card-icon">🏛️</span>
                <strong>Pasado</strong>
              </div>
              <span className="epoch-counter-chip">{pastGraffitis.length} huellas</span>
            </div>
            <p className="epoch-card-desc">
              Archivos históricos y documentación custodiada por nodos (ej: corpus enciclopédico, graffitis del génesis).
            </p>
          </button>

          {/* Dimension 2: PRESENT */}
          <button
            className={`epoch-dimension-card present ${activeEpoch === "present" ? "active" : ""}`}
            onClick={() => onSelectEpoch(activeEpoch === "present" ? "all" : "present")}
            data-testid="epoch-btn-present"
          >
            <div className="epoch-card-header">
              <div className="epoch-badge-title">
                <span className="epoch-card-icon">⚡</span>
                <strong>Presente</strong>
              </div>
              <span className="epoch-counter-chip">{presentGraffitis.length} huellas</span>
            </div>
            <p className="epoch-card-desc">
              Enjambre vivo y transmisiones efímeras en tiempo real vía WebRTC strata-sync.
            </p>
          </button>

          {/* Dimension 3: FUTURE */}
          <button
            className={`epoch-dimension-card future ${activeEpoch === "future" ? "active" : ""}`}
            onClick={() => onSelectEpoch(activeEpoch === "future" ? "all" : "future")}
            data-testid="epoch-btn-future"
          >
            <div className="epoch-card-header">
              <div className="epoch-badge-title">
                <span className="epoch-card-icon">⏳</span>
                <strong>Futuro</strong>
              </div>
              <span className="epoch-counter-chip">{futureGraffitis.length} huellas</span>
            </div>
            <p className="epoch-card-desc">
              Cápsulas temporales, anuncios diferidos y puntos de encuentro programados (rendezvous).
            </p>
          </button>
        </div>

        {activeEpoch !== "all" && (
          <button
            className="btn btn-ghost btn-sm reset-epoch-btn"
            onClick={() => onSelectEpoch("all")}
          >
            <RotateCcw size={11} />
            <span>Ver Todas las Dimensiones</span>
          </button>
        )}
      </div>

      {/* Temporal Distribution Histogram */}
      <div className="temporal-histogram-section">
        <div className="histogram-label-row">
          <span>Distribución Temporal</span>
          <span className="histogram-total">{totalCount} huellas totales</span>
        </div>
        <div className="histogram-bar-track">
          <div
            className="histogram-seg past"
            style={{ width: `${pastPct}%` }}
            title={`Pasado: ${pastGraffitis.length} (${pastPct.toFixed(0)}%)`}
          />
          <div
            className="histogram-seg present"
            style={{ width: `${presentPct}%` }}
            title={`Presente: ${presentGraffitis.length} (${presentPct.toFixed(0)}%)`}
          />
          <div
            className="histogram-seg future"
            style={{ width: `${futurePct}%` }}
            title={`Futuro: ${futureGraffitis.length} (${futurePct.toFixed(0)}%)`}
          />
        </div>
        <div className="histogram-legend">
          <span><span className="legend-dot past" />Pasado ({pastGraffitis.length})</span>
          <span><span className="legend-dot present" />Presente ({presentGraffitis.length})</span>
          <span><span className="legend-dot future" />Futuro ({futureGraffitis.length})</span>
        </div>
      </div>

      {/* Continuous Scrubber Slider */}
      <div className="temporal-scrubber-section">
        <div className="scrubber-header-row">
          <div className="scrubber-day-label">
            <Sliders size={13} className="text-neon-amber" />
            <span>Dial Continuo: <strong>{getSelectedDayText(dayOffset)}</strong></span>
          </div>
        </div>

        <input
          type="range"
          min="-14"
          max="14"
          step="1"
          value={dayOffset}
          onChange={(e) => {
            onSetDayOffset(Number(e.target.value));
          }}
          className="slider-input temporal-range-slider"
          aria-label="Selector de día continuo"
        />

        {/* Scrubber Quick Ticks */}
        <div className="scrubber-ticks-grid">
          <button
            className={`scrubber-tick-btn ${dayOffset === -14 ? "active" : ""}`}
            onClick={() => onSetDayOffset(-14)}
          >
            -14d
          </button>
          <button
            className={`scrubber-tick-btn ${dayOffset === -7 ? "active" : ""}`}
            onClick={() => onSetDayOffset(-7)}
          >
            -7d
          </button>
          <button
            className={`scrubber-tick-btn ${dayOffset === -1 ? "active" : ""}`}
            onClick={() => onSetDayOffset(-1)}
          >
            Ayer
          </button>
          <button
            className={`scrubber-tick-btn ${dayOffset === 0 ? "active" : ""}`}
            onClick={() => onSetDayOffset(0)}
          >
            Hoy
          </button>
          <button
            className={`scrubber-tick-btn ${dayOffset === 1 ? "active" : ""}`}
            onClick={() => onSetDayOffset(1)}
          >
            Mañana
          </button>
          <button
            className={`scrubber-tick-btn ${dayOffset === 7 ? "active" : ""}`}
            onClick={() => onSetDayOffset(7)}
          >
            +7d
          </button>
          <button
            className={`scrubber-tick-btn ${dayOffset === 14 ? "active" : ""}`}
            onClick={() => onSetDayOffset(14)}
          >
            +14d
          </button>
        </div>

        {dayOffset > 0 && (
          <button
            className="btn btn-primary btn-sm schedule-capsule-btn"
            style={{ marginTop: "10px", width: "100%", fontSize: "11px", gap: "6px" }}
            onClick={() => onOpenComposerWithOffset(dayOffset)}
          >
            <Clock size={12} />
            <span>Programar Cápsula (+{dayOffset}d)</span>
          </button>
        )}
      </div>

      {/* Seeded Archives & Time Capsule Tools */}
      <div className="temporal-tools-section">
        <div className="seed-archive-card">
          <div className="seed-card-info">
            <Sparkles size={14} className="text-neon-cyan" />
            <div>
              <div className="seed-card-title">Corpus Semilla de Protocolo</div>
              <div className="seed-card-desc">Carga graffitis firmados en las 3 dimensiones (archivo histórico, enjambre vivo y cápsula futura).</div>
            </div>
          </div>
          <button
            className="btn btn-secondary btn-sm seed-load-btn"
            onClick={onLoadSeedArchives}
            title="Cargar corpus semilla firmado con TweetNaCl"
          >
            <Archive size={12} />
            <span>Cargar Semillas de Prueba</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
