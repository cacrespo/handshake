import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';
import { toHex, fromHex, encodeGeohash, decodeGeohash, canonicalStringify } from './utils';

// Mock Leaflet and react-leaflet since Leaflet requires full canvas/DOM in jsdom
vi.mock('react-leaflet', () => ({
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

describe('Hex & Geohash Utilities', () => {
  it('converts between Uint8Array and Hex string bidirectionally', () => {
    const original = new Uint8Array([0, 15, 255, 128, 64]);
    const hex = toHex(original);
    expect(hex).toBe('000fff8040');

    const recovered = fromHex(hex);
    expect(Array.from(recovered)).toEqual(Array.from(original));
  });

  it('encodes and decodes geohashes accurately', () => {
    const lat = -34.6037;
    const lon = -58.3816;
    const hash = encodeGeohash(lat, lon, 7);
    expect(hash).toHaveLength(7);

    const decoded = decodeGeohash(hash);
    expect(decoded.lat).toBeCloseTo(lat, 1);
    expect(decoded.lon).toBeCloseTo(lon, 1);
  });

  it('produces canonical recursively sorted JSON matching Python sort_keys', () => {
    const unordered = {
      z: 1,
      a: {
        d: 4,
        b: 2,
        c: [ { y: 2, x: 1 } ]
      }
    };
    const serialized = canonicalStringify(unordered);
    expect(serialized).toBe('{"a":{"b":2,"c":[{"x":1,"y":2}],"d":4},"z":1}');
  });
});

describe('App Component', () => {
  it('renders the header title and Pintar Graffiti action button', () => {
    render(<App />);
    expect(screen.getByText('Handshake')).toBeInTheDocument();
    expect(screen.getByText('Space-Time Conexions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pintar Graffiti/i })).toBeInTheDocument();
  });

  it('opens and closes the composer modal when clicking Pintar Graffiti and cancel', () => {
    render(<App />);

    const openBtn = screen.getByRole('button', { name: /Pintar Graffiti/i });
    fireEvent.click(openBtn);

    // Composer modal textarea should now be in the document
    const textarea = screen.getByPlaceholderText(/Escribe el graffiti o huella/i);
    expect(textarea).toBeInTheDocument();

    // Close the modal
    const cancelBtn = screen.getByRole('button', { name: /Cancelar/i });
    fireEvent.click(cancelBtn);

    expect(screen.queryByPlaceholderText(/Escribe el graffiti o huella/i)).not.toBeInTheDocument();
  });

  it('renders the P2P live HUD with WebRTC peers, active geohash, and strata-sync status', () => {
    render(<App />);
    expect(screen.getByText(/Peers:/i)).toBeInTheDocument();
    expect(screen.getByText(/Celda:/i)).toBeInTheDocument();
    expect(screen.getByText(/Strata-Sync:/i)).toBeInTheDocument();
  });

  it('toggles seamlessly between 3D Globe view and 2D Map view', () => {
    render(<App />);

    // Initially in 3D Globe mode (fallback in jsdom)
    expect(screen.getByTestId('globe-view-fallback')).toBeInTheDocument();
    expect(screen.getByText(/Visualización 3D Radio Garden/i)).toBeInTheDocument();

    // Click on "Mapa 2D" via the view mode switcher button title
    const map2dBtn = screen.getByTitle('Vista de Mapa 2D Local');
    fireEvent.click(map2dBtn);

    // Now 2D Map is active
    expect(screen.getByTestId('mock-map')).toBeInTheDocument();
    expect(screen.getByText(/Vista Globo 3D/i)).toBeInTheDocument();

    // Click back on "Globo 3D" via view mode switcher button title
    const globe3dBtn = screen.getByTitle('Vista Global 3D (Radio Garden / Radio Atlas)');
    fireEvent.click(globe3dBtn);

    // Globe mode is restored
    expect(screen.getByTestId('globe-view-fallback')).toBeInTheDocument();
  });

  it('supports sovereign location selection in composer modal', () => {
    render(<App />);

    // Open composer
    const openBtn = screen.getByRole('button', { name: /Pintar Graffiti/i });
    fireEvent.click(openBtn);

    // Verify sovereign location selector
    expect(screen.getByText(/Ubicación Soberana de Publicación/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Punto seleccionado en Mapa\/Globo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /GPS actual/i })).toBeInTheDocument();

    // Toggle location mode
    const pickedBtn = screen.getByRole('button', { name: /Punto seleccionado en Mapa\/Globo/i });
    expect(pickedBtn).toHaveClass('active');

    const gpsBtn = screen.getByRole('button', { name: /GPS actual/i });
    fireEvent.click(gpsBtn);
    expect(gpsBtn).toHaveClass('active');
  });
});
