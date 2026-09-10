import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import GlobeView, { latLonToVector3, vector3ToLatLon, type GlobeMarker } from "./GlobeView";
import { createEarthCanvas } from "./globeTexture";

describe("Globe 3D Coordinate Transformations", () => {
  it("converts lat/lon to 3D Cartesian coordinates and back with high fidelity", () => {
    const radius = 100;
    const testCases = [
      { lat: 0, lon: 0 },
      { lat: -34.6037, lon: -58.3816 }, // Buenos Aires
      { lat: 40.7128, lon: -74.0060 },  // New York
      { lat: 35.6762, lon: 139.6503 },  // Tokyo
      { lat: -90, lon: 0 },             // South Pole
      { lat: 90, lon: 0 }               // North Pole
    ];

    testCases.forEach(({ lat, lon }) => {
      const v = latLonToVector3(lat, lon, radius);
      expect(v.length()).toBeCloseTo(radius, 4);

      const recovered = vector3ToLatLon(v);
      expect(recovered.lat).toBeCloseTo(lat, 1);
      if (Math.abs(lat) < 85) {
        expect(recovered.lon).toBeCloseTo(lon, 1);
      }
    });
  });

  it("generates a procedural dark Earth canvas texture with coastlines", () => {
    const canvas = createEarthCanvas(512, 256);
    expect(canvas).toBeDefined();
    expect(canvas.width).toBe(512);
    expect(canvas.height).toBe(256);
  });
});

describe("GlobeView Component", () => {
  const dummyMarkers: GlobeMarker[] = [
    {
      id: "test-1",
      lat: -34.6037,
      lon: -58.3816,
      geohash: "69y7p2d",
      text: "Mensaje desde Buenos Aires",
      author: "abcdef0123456789",
      timestamp: 1700000000,
      isLocal: true,
      isTrusted: false
    }
  ];

  it("renders the fallback view cleanly in jsdom headless environments", () => {
    const onSelectLocation = vi.fn();
    const onSwitchTo2D = vi.fn();

    render(
      <GlobeView
        markers={dummyMarkers}
        userCoords={[-34.6037, -58.3816]}
        activeCoords={[-34.6037, -58.3816]}
        onSelectLocation={onSelectLocation}
        onSwitchTo2D={onSwitchTo2D}
      />
    );

    expect(screen.getByTestId("globe-view-fallback")).toBeInTheDocument();
    expect(screen.getByText(/Visualización 3D Radio Garden/i)).toBeInTheDocument();
    expect(screen.getByText(/1 graffitis espaciales en red P2P/i)).toBeInTheDocument();

    const switchBtn = screen.getByTestId("globe-switch-2d");
    fireEvent.click(switchBtn);
    expect(onSwitchTo2D).toHaveBeenCalledTimes(1);
  });
});
