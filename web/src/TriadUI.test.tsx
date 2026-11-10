import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "./App";
import RichText from "./components/RichText";
import { initDB, saveMessage, clearAll } from "./storage/db";
import { getTodayBounds } from "./storage/query";

// Mock Leaflet and react-leaflet since Leaflet requires full canvas/DOM in jsdom
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: any) => <div data-testid="mock-map">{children}</div>,
  TileLayer: () => <div data-testid="mock-tile-layer" />,
  Marker: ({ children }: any) => <div data-testid="mock-marker">{children}</div>,
  Popup: ({ children }: any) => <div data-testid="mock-popup">{children}</div>,
  Circle: () => <div data-testid="mock-circle" />,
  useMap: () => ({
    setView: vi.fn(),
    flyTo: vi.fn(),
    getCenter: () => ({ lat: -34.6, lng: -58.38 }),
    getZoom: () => 13,
  }),
  useMapEvents: () => null,
}));

describe("RichText Component", () => {
  it("renders plain text and markdown formatting correctly without dangerouslySetInnerHTML", () => {
    const { container } = render(
      <RichText content={"Normal **Bold text** and *italic words* with `code block`"} />
    );
    expect(screen.getByText("Bold text")).toHaveClass("rich-bold");
    expect(screen.getByText("italic words")).toHaveClass("rich-italic");
    expect(screen.getByText("code block")).toHaveClass("rich-code");
    expect(container.textContent).toContain("Normal");
  });

  it("renders blockquotes and safe links", () => {
    render(<RichText content={"> A sovereign quote\nhttps://handshake.network"} />);
    expect(screen.getByText("A sovereign quote")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "https://handshake.network" });
    expect(link).toHaveAttribute("href", "https://handshake.network");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});

describe("Space-Time Triad Cockpit Integration in App", () => {
  beforeEach(async () => {
    localStorage.clear();
    await initDB();
    await clearAll();
  });

  it("renders the 50/25/25 cockpit with Spatial Radar (Where), Message Stream (Hero), and Temporal Horizon (When)", () => {
    render(<App />);

    // 1. Where: Spatial Radar
    expect(screen.getByLabelText(/Spatial Context & Radar/i)).toBeInTheDocument();
    expect(screen.getByText(/Radar Espacial/i)).toBeInTheDocument();

    // 2. The Hero: Sovereign Message Stream
    expect(screen.getByLabelText(/Sovereign Message Stream/i)).toBeInTheDocument();
    expect(screen.getByText(/Flujo Soberano de Mensajes/i)).toBeInTheDocument();

    // 3. When: Temporal Horizon & Interactive Timeline
    expect(screen.getByLabelText(/Temporal Horizon/i)).toBeInTheDocument();
    expect(screen.getByText(/Horizonte Temporal/i)).toBeInTheDocument();
  });

  it("supports interactive filtering across Past, Present, and Future triad dimensions", async () => {
    const { start: todayStart, end: todayEnd } = getTodayBounds();
    const pastTs = todayStart - 86400 * 2;
    const presentTs = todayStart + 3600;
    const futureTs = todayEnd + 86400 * 5;

    // Save one past, one present, and one future message
    await saveMessage({
      version: "1.0",
      header: {
        type: "PUBLIC",
        author_pk: "pub_past_author",
        timestamp: pastTs,
        signature: "sig_past_1",
      },
      anchor: { geohash: "6gyf4a1", timestamp: pastTs },
      content: { text: "Historical Archive Memory" },
      is_local: true,
    });

    await saveMessage({
      version: "1.0",
      header: {
        type: "PUBLIC",
        author_pk: "pub_present_author",
        timestamp: presentTs,
        signature: "sig_present_1",
      },
      anchor: { geohash: "6gyf4a2", timestamp: presentTs },
      content: { text: "Real-time Live P2P Pulse" },
      is_local: true,
    });

    await saveMessage({
      version: "1.0",
      header: {
        type: "PUBLIC",
        author_pk: "pub_future_author",
        timestamp: futureTs,
        signature: "sig_future_1",
      },
      anchor: { geohash: "6gyf4a3", timestamp: futureTs },
      content: { text: "Future Time Capsule 2027" },
      is_local: true,
    });

    render(<App />);

    // Initially all 3 messages should be loaded and present
    expect(await screen.findByText('"Historical Archive Memory"')).toBeInTheDocument();
    expect(await screen.findByText('"Real-time Live P2P Pulse"')).toBeInTheDocument();
    expect(await screen.findByText('"Future Time Capsule 2027"')).toBeInTheDocument();

    // 1. Click Past Dimension card
    const pastBtn = screen.getByTestId("dimension-card-past");
    fireEvent.click(pastBtn);

    // Only past message should be visible in stream
    await waitFor(() => {
      expect(screen.getByText('"Historical Archive Memory"')).toBeInTheDocument();
      expect(screen.queryByText('"Real-time Live P2P Pulse"')).not.toBeInTheDocument();
      expect(screen.queryByText('"Future Time Capsule 2027"')).not.toBeInTheDocument();
    });

    // Active filter chip should appear in stream header
    expect(screen.getByTestId("chip-filter-temporal")).toBeInTheDocument();

    // 2. Click Future Dimension card
    const futureBtn = screen.getByTestId("dimension-card-future");
    fireEvent.click(futureBtn);

    await waitFor(() => {
      expect(screen.getByText('"Future Time Capsule 2027"')).toBeInTheDocument();
      expect(screen.queryByText('"Historical Archive Memory"')).not.toBeInTheDocument();
      expect(screen.queryByText('"Real-time Live P2P Pulse"')).not.toBeInTheDocument();
    });

    // 3. Click Reset "Mostrar Todo" button in Temporal Horizon
    const resetBtn = screen.getByTestId("btn-reset-temporal-filter");
    fireEvent.click(resetBtn);

    await waitFor(() => {
      expect(screen.getByText('"Historical Archive Memory"')).toBeInTheDocument();
      expect(screen.getByText('"Real-time Live P2P Pulse"')).toBeInTheDocument();
      expect(screen.getByText('"Future Time Capsule 2027"')).toBeInTheDocument();
    });
  });

  it("coordinates bidirectional spatial filtering between Radar and Message Stream", async () => {
    const now = Math.floor(Date.now() / 1000);
    await saveMessage({
      version: "1.0",
      header: {
        type: "PUBLIC",
        author_pk: "pub_bue",
        timestamp: now,
        signature: "sig_bue",
      },
      anchor: { geohash: "6gyf4a1", timestamp: now },
      content: { text: "Buenos Aires Graffiti" },
      is_local: true,
    });

    await saveMessage({
      version: "1.0",
      header: {
        type: "PUBLIC",
        author_pk: "pub_ny",
        timestamp: now,
        signature: "sig_ny",
      },
      anchor: { geohash: "dr5reg1", timestamp: now },
      content: { text: "New York Times Square Graffiti" },
      is_local: true,
    });

    render(<App />);

    expect(await screen.findByText('"Buenos Aires Graffiti"')).toBeInTheDocument();
    expect(await screen.findByText('"New York Times Square Graffiti"')).toBeInTheDocument();

    // In Spatial Radar, find the cluster zone button for "6gyf" and click it
    const bueClusterBtn = await screen.findByRole("button", { name: /6gyf/i });
    fireEvent.click(bueClusterBtn);

    // Now message stream should filter to only 6gyf
    await waitFor(() => {
      expect(screen.getByText('"Buenos Aires Graffiti"')).toBeInTheDocument();
      expect(screen.queryByText('"New York Times Square Graffiti"')).not.toBeInTheDocument();
    });

    // Clear filter chip
    const geohashChip = screen.getByTestId("chip-filter-geohash");
    expect(geohashChip).toBeInTheDocument();

    const removeBtn = geohashChip.querySelector(".chip-remove")!;
    fireEvent.click(removeBtn);

    // Both messages restored
    await waitFor(() => {
      expect(screen.getByText('"Buenos Aires Graffiti"')).toBeInTheDocument();
      expect(screen.getByText('"New York Times Square Graffiti"')).toBeInTheDocument();
    });
  });

  it("supports text search in message stream hero header", async () => {
    const now = Math.floor(Date.now() / 1000);
    await saveMessage({
      version: "1.0",
      header: {
        type: "PUBLIC",
        author_pk: "pub_alpha",
        timestamp: now,
        signature: "sig_alpha",
      },
      anchor: { geohash: "6gyf4a1", timestamp: now },
      content: { text: "Quantum entanglement beacon" },
      is_local: true,
    });

    await saveMessage({
      version: "1.0",
      header: {
        type: "PUBLIC",
        author_pk: "pub_beta",
        timestamp: now,
        signature: "sig_beta",
      },
      anchor: { geohash: "6gyf4a2", timestamp: now },
      content: { text: "Standard mesh heartbeat" },
      is_local: true,
    });

    render(<App />);

    expect(await screen.findByText('"Quantum entanglement beacon"')).toBeInTheDocument();
    expect(await screen.findByText('"Standard mesh heartbeat"')).toBeInTheDocument();

    // Type "Quantum" into search input
    const searchInput = screen.getByTestId("stream-search-input");
    fireEvent.change(searchInput, { target: { value: "Quantum" } });

    await waitFor(() => {
      expect(screen.getByText('"Quantum entanglement beacon"')).toBeInTheDocument();
      expect(screen.queryByText('"Standard mesh heartbeat"')).not.toBeInTheDocument();
    });
  });
});
