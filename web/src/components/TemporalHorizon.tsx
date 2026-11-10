import React, { useState, useMemo } from "react";
import {
  Clock,
  History,
  Radio,
  Sparkles,
  Calendar,
  X,
  ChevronRight,
  TrendingUp,
  Sliders,
} from "lucide-react";
import {
  computeTemporalDistribution,
  type TemporalDistribution,
  type TemporalFilter,
} from "../storage/query";

export interface TemporalHorizonProps {
  messages?: any[];
  allMessages: any[];
  temporalFilter: TemporalFilter;
  onSetTemporalFilter: (filter: TemporalFilter) => void;
  onResetTemporalFilter: () => void;
  className?: string;
}

export const TemporalHorizon: React.FC<TemporalHorizonProps> = ({
  allMessages,
  temporalFilter,
  onSetTemporalFilter,
  onResetTemporalFilter,
  className = "",
}) => {
  const [sliderDayOffset, setSliderDayOffset] = useState<number>(
    temporalFilter.dayOffset ?? 0
  );
  const [customDate, setCustomDate] = useState<string>("");

  // Distribution statistics
  const dist: TemporalDistribution = useMemo(() => {
    return computeTemporalDistribution(allMessages);
  }, [allMessages]);

  // Compute percentages for histogram bar
  const total = dist.total || 1;
  const pastPct = Math.round((dist.pastCount / total) * 100);
  const presentPct = Math.round((dist.presentCount / total) * 100);
  const futurePct = Math.round((dist.futureCount / total) * 100);

  const getSliderDateLabel = (offset: number) => {
    if (offset === 0) return "Hoy (Ahora)";
    if (offset === -1) return "Ayer";
    if (offset === 1) return "Mañana";
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.toLocaleDateString([], { day: "numeric", month: "short" })} (${
      offset > 0 ? `+${offset}d` : `${offset}d`
    })`;
  };

  const handleSliderChange = (newOffset: number) => {
    setSliderDayOffset(newOffset);
    if (newOffset === 0) {
      onSetTemporalFilter({
        dimension: "present",
        dayOffset: 0,
        label: "Hoy (Tiempo Real)",
      });
      return;
    }

    const d = new Date();
    d.setDate(d.getDate() + newOffset);
    const start = Math.floor(
      new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).getTime() / 1000
    );
    const end = Math.floor(
      new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).getTime() / 1000
    );

    onSetTemporalFilter({
      dimension: "custom",
      dayOffset: newOffset,
      customStart: start,
      customEnd: end,
      label: getSliderDateLabel(newOffset),
    });
  };

  const handleCustomDateSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomDate(val);
    if (!val) return;

    const parts = val.split("-").map(Number);
    if (parts.length === 3) {
      const start = Math.floor(new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0).getTime() / 1000);
      const end = Math.floor(
        new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59).getTime() / 1000
      );
      onSetTemporalFilter({
        dimension: "custom",
        customStart: start,
        customEnd: end,
        label: `Fecha: ${val}`,
      });
    }
  };

  const isAllTime = temporalFilter.dimension === "all";

  return (
    <aside
      className={`temporal-horizon-panel ${className}`}
      aria-label="Temporal Horizon & Interactive Timeline (25% When)"
    >
      {/* Horizon Header */}
      <div className="horizon-header">
        <div className="horizon-title-group">
          <div className="horizon-icon-badge">
            <Clock size={16} className="icon-amber" />
          </div>
          <div>
            <h3 className="horizon-heading">Horizonte Temporal</h3>
            <span className="horizon-subheading">
              Soberanía de tiempo: Pasado, Presente & Futuro
            </span>
          </div>
        </div>

        <button
          className={`btn-all-time-toggle ${isAllTime ? "active" : ""}`}
          onClick={onResetTemporalFilter}
          title="Ver todos los mensajes sin restricción de tiempo"
          data-testid="btn-reset-temporal-filter"
        >
          {isAllTime ? "👁️ Todo" : "Mostrar Todo"}
        </button>
      </div>

      {/* Active Temporal Status Banner */}
      <div className="horizon-status-banner">
        <div className="status-label-group">
          <span className="status-caption">Filtro temporal activo:</span>
          <span className="status-current-badge">
            {temporalFilter.dimension === "all"
              ? "Línea Continua Completa (Sin filtro)"
              : temporalFilter.dimension === "past"
              ? "📜 Archivo Histórico (Pasado)"
              : temporalFilter.dimension === "present"
              ? "⚡ Enjambre en Vivo (Hoy)"
              : temporalFilter.dimension === "future"
              ? "🔮 Cápsulas Futuras"
              : temporalFilter.epoch
              ? `Época ${temporalFilter.epoch}`
              : temporalFilter.label || "Rango Personalizado"}
          </span>
        </div>

        {!isAllTime && (
          <button
            className="clear-temporal-btn"
            onClick={onResetTemporalFilter}
            title="Quitar filtro temporal"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Triad Dimensions Dial (Past / Present / Future) */}
      <div className="horizon-triad-dial">
        {/* Past Dimension */}
        <button
          className={`triad-dimension-card past ${
            temporalFilter.dimension === "past" ? "active" : ""
          }`}
          onClick={() =>
            onSetTemporalFilter({
              dimension: "past",
              label: "Archivos Históricos & Custodios",
            })
          }
          data-testid="dimension-card-past"
        >
          <div className="dimension-top">
            <div className="dimension-icon-pill past">
              <History size={13} />
            </div>
            <span className="dimension-count-tag">{dist.pastCount}</span>
          </div>
          <div className="dimension-name">Pasado</div>
          <div className="dimension-desc">Archivos históricos y corpus custodio</div>
        </button>

        {/* Present Dimension */}
        <button
          className={`triad-dimension-card present ${
            temporalFilter.dimension === "present" ? "active" : ""
          }`}
          onClick={() =>
            onSetTemporalFilter({
              dimension: "present",
              label: "Enjambre P2P en Vivo (Hoy)",
            })
          }
          data-testid="dimension-card-present"
        >
          <div className="dimension-top">
            <div className="dimension-icon-pill present">
              <Radio size={13} />
            </div>
            <span className="dimension-count-tag">{dist.presentCount}</span>
          </div>
          <div className="dimension-name">Presente</div>
          <div className="dimension-desc">Enjambre en tiempo real (WebRTC)</div>
        </button>

        {/* Future Dimension */}
        <button
          className={`triad-dimension-card future ${
            temporalFilter.dimension === "future" ? "active" : ""
          }`}
          onClick={() =>
            onSetTemporalFilter({
              dimension: "future",
              label: "Cápsulas del Tiempo & Rendezvous",
            })
          }
          data-testid="dimension-card-future"
        >
          <div className="dimension-top">
            <div className="dimension-icon-pill future">
              <Sparkles size={13} />
            </div>
            <span className="dimension-count-tag">{dist.futureCount}</span>
          </div>
          <div className="dimension-name">Futuro</div>
          <div className="dimension-desc">Cápsulas temporales y anuncios</div>
        </button>
      </div>

      {/* Temporal Distribution Density Bar */}
      <div className="horizon-density-section">
        <div className="density-header">
          <span className="density-title">
            <TrendingUp size={11} /> Densidad de Graffitis en el Tiempo
          </span>
          <span className="density-stats">{allMessages.length} total</span>
        </div>
        <div className="density-stacked-bar">
          <div
            className="density-segment past"
            style={{ width: `${pastPct}%` }}
            title={`Pasado: ${dist.pastCount} (${pastPct}%)`}
          />
          <div
            className="density-segment present"
            style={{ width: `${presentPct}%` }}
            title={`Presente: ${dist.presentCount} (${presentPct}%)`}
          />
          <div
            className="density-segment future"
            style={{ width: `${futurePct}%` }}
            title={`Futuro: ${dist.futureCount} (${futurePct}%)`}
          />
        </div>
        <div className="density-legend">
          <span className="legend-item past">
            <span className="legend-dot" /> Pasado ({pastPct}%)
          </span>
          <span className="legend-item present">
            <span className="legend-dot" /> Presente ({presentPct}%)
          </span>
          <span className="legend-item future">
            <span className="legend-dot" /> Futuro ({futurePct}%)
          </span>
        </div>
      </div>

      {/* Continuous Timeline Scrubber / Slider */}
      <div className="horizon-scrubber-box">
        <div className="scrubber-header">
          <span className="scrubber-label">
            <Sliders size={12} /> Dial Continuo de Tiempo
          </span>
          <span className="scrubber-value" data-testid="scrubber-date-label">
            {getSliderDateLabel(sliderDayOffset)}
          </span>
        </div>

        <input
          type="range"
          min="-30"
          max="30"
          step="1"
          value={sliderDayOffset}
          onChange={(e) => handleSliderChange(Number(e.target.value))}
          className="horizon-slider-input"
          data-testid="horizon-slider-input"
        />

        {/* Quick Tick Jumps */}
        <div className="scrubber-ticks-grid">
          <button
            className={`tick-chip ${sliderDayOffset === -30 ? "active" : ""}`}
            onClick={() => handleSliderChange(-30)}
          >
            -30d
          </button>
          <button
            className={`tick-chip ${sliderDayOffset === -7 ? "active" : ""}`}
            onClick={() => handleSliderChange(-7)}
          >
            -7d
          </button>
          <button
            className={`tick-chip ${sliderDayOffset === -1 ? "active" : ""}`}
            onClick={() => handleSliderChange(-1)}
          >
            Ayer
          </button>
          <button
            className={`tick-chip ${sliderDayOffset === 0 ? "active" : ""}`}
            onClick={() => handleSliderChange(0)}
          >
            Hoy
          </button>
          <button
            className={`tick-chip ${sliderDayOffset === 1 ? "active" : ""}`}
            onClick={() => handleSliderChange(1)}
          >
            Mañana
          </button>
          <button
            className={`tick-chip ${sliderDayOffset === 7 ? "active" : ""}`}
            onClick={() => handleSliderChange(7)}
          >
            +7d
          </button>
          <button
            className={`tick-chip ${sliderDayOffset === 30 ? "active" : ""}`}
            onClick={() => handleSliderChange(30)}
          >
            +30d
          </button>
        </div>
      </div>

      {/* Custom Specific Date Picker */}
      <div className="horizon-custom-date-section">
        <div className="custom-date-header">
          <Calendar size={12} />
          <span>Explorar fecha exacta:</span>
        </div>
        <input
          type="date"
          className="custom-date-field"
          value={customDate}
          onChange={handleCustomDateSelect}
          data-testid="horizon-custom-date-input"
        />
      </div>

      {/* Chronological Epochs Stream */}
      <div className="horizon-epochs-section">
        <div className="epochs-header">
          <span className="epochs-title">Épocas Registradas</span>
          <span className="epochs-count">{dist.epochs.length} épocas</span>
        </div>

        <div className="epochs-scroll-list">
          {dist.epochs.length === 0 ? (
            <div className="epochs-empty">No hay épocas indexadas en memoria</div>
          ) : (
            dist.epochs.map((item) => {
              const isSelected =
                temporalFilter.dimension === "epoch" && temporalFilter.epoch === item.epoch;
              return (
                <button
                  key={item.epoch}
                  className={`epoch-row-btn ${isSelected ? "active" : ""}`}
                  onClick={() =>
                    onSetTemporalFilter({
                      dimension: "epoch",
                      epoch: item.epoch,
                      label: `Época ${item.epoch}`,
                    })
                  }
                  title={`Filtrar graffitis de la época ${item.epoch}`}
                >
                  <div className="epoch-left">
                    <span className={`epoch-dot ${item.category}`} />
                    <code className="epoch-label">{item.epoch}</code>
                  </div>
                  <div className="epoch-right">
                    <span className="epoch-badge">{item.count} mensajes</span>
                    <ChevronRight size={12} className="epoch-arrow" />
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

export default TemporalHorizon;
