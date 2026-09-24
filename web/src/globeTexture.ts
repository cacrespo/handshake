/**
 * Procedural Earth texture generator for the 3D Globe visualization.
 * Creates a high-definition dark/night Earth canvas texture with
 * continent outlines, graticules, and glowing city clusters (Radio Garden / Radio Atlas style).
 */

interface Point {
  lon: number;
  lat: number;
}

// Simplified continent landmass polygons [lon, lat]
const CONTINENTS: Point[][] = [
  // South America
  [
    { lon: -80, lat: 9 }, { lon: -75, lat: 11 }, { lon: -62, lat: 10 },
    { lon: -50, lat: 0 }, { lon: -35, lat: -5 }, { lon: -38, lat: -13 },
    { lon: -42, lat: -23 }, { lon: -53, lat: -33 }, { lon: -65, lat: -42 },
    { lon: -68, lat: -54 }, { lon: -75, lat: -50 }, { lon: -73, lat: -40 },
    { lon: -72, lat: -20 }, { lon: -81, lat: -5 }, { lon: -77, lat: 5 },
    { lon: -80, lat: 9 }
  ],
  // North America
  [
    { lon: -168, lat: 65 }, { lon: -140, lat: 70 }, { lon: -120, lat: 68 },
    { lon: -85, lat: 70 }, { lon: -80, lat: 55 }, { lon: -60, lat: 50 },
    { lon: -65, lat: 44 }, { lon: -75, lat: 35 }, { lon: -80, lat: 25 },
    { lon: -82, lat: 22 }, { lon: -90, lat: 21 }, { lon: -97, lat: 26 },
    { lon: -88, lat: 15 }, { lon: -77, lat: 8 }, { lon: -85, lat: 12 },
    { lon: -105, lat: 20 }, { lon: -110, lat: 23 }, { lon: -117, lat: 32 },
    { lon: -124, lat: 38 }, { lon: -124, lat: 48 }, { lon: -135, lat: 57 },
    { lon: -160, lat: 58 }, { lon: -168, lat: 65 }
  ],
  // Africa
  [
    { lon: -6, lat: 36 }, { lon: 11, lat: 37 }, { lon: 25, lat: 32 },
    { lon: 34, lat: 28 }, { lon: 43, lat: 12 }, { lon: 51, lat: 12 },
    { lon: 45, lat: -5 }, { lon: 40, lat: -15 }, { lon: 35, lat: -24 },
    { lon: 28, lat: -32 }, { lon: 19, lat: -34 }, { lon: 15, lat: -23 },
    { lon: 12, lat: -6 }, { lon: 9, lat: 4 }, { lon: 2, lat: 6 },
    { lon: -13, lat: 9 }, { lon: -17, lat: 15 }, { lon: -13, lat: 27 },
    { lon: -6, lat: 36 }
  ],
  // Europe
  [
    { lon: -9, lat: 36 }, { lon: -9, lat: 43 }, { lon: 0, lat: 43 },
    { lon: -4, lat: 48 }, { lon: 3, lat: 51 }, { lon: 8, lat: 55 },
    { lon: 10, lat: 58 }, { lon: 14, lat: 55 }, { lon: 20, lat: 55 },
    { lon: 28, lat: 70 }, { lon: 20, lat: 71 }, { lon: 5, lat: 62 },
    { lon: 32, lat: 65 }, { lon: 40, lat: 67 }, { lon: 55, lat: 68 },
    { lon: 60, lat: 55 }, { lon: 50, lat: 47 }, { lon: 40, lat: 44 },
    { lon: 28, lat: 41 }, { lon: 23, lat: 38 }, { lon: 15, lat: 40 },
    { lon: 3, lat: 42 }, { lon: -3, lat: 37 }, { lon: -9, lat: 36 }
  ],
  // Asia
  [
    { lon: 60, lat: 55 }, { lon: 65, lat: 68 }, { lon: 80, lat: 73 },
    { lon: 105, lat: 77 }, { lon: 140, lat: 72 }, { lon: 170, lat: 66 },
    { lon: 178, lat: 65 }, { lon: 162, lat: 55 }, { lon: 142, lat: 50 },
    { lon: 130, lat: 42 }, { lon: 122, lat: 38 }, { lon: 120, lat: 31 },
    { lon: 110, lat: 20 }, { lon: 105, lat: 10 }, { lon: 100, lat: 3 },
    { lon: 95, lat: 18 }, { lon: 88, lat: 22 }, { lon: 80, lat: 13 },
    { lon: 77, lat: 8 }, { lon: 72, lat: 19 }, { lon: 68, lat: 24 },
    { lon: 62, lat: 25 }, { lon: 55, lat: 26 }, { lon: 44, lat: 13 },
    { lon: 36, lat: 28 }, { lon: 35, lat: 33 }, { lon: 40, lat: 38 },
    { lon: 50, lat: 47 }, { lon: 60, lat: 55 }
  ],
  // Australia
  [
    { lon: 114, lat: -22 }, { lon: 122, lat: -16 }, { lon: 132, lat: -12 },
    { lon: 136, lat: -12 }, { lon: 142, lat: -11 }, { lon: 145, lat: -16 },
    { lon: 153, lat: -28 }, { lon: 150, lat: -37 }, { lon: 140, lat: -38 },
    { lon: 130, lat: -32 }, { lon: 115, lat: -34 }, { lon: 113, lat: -26 },
    { lon: 114, lat: -22 }
  ],
  // Antarctica
  [
    { lon: -180, lat: -78 }, { lon: -120, lat: -75 }, { lon: -60, lat: -65 },
    { lon: -40, lat: -75 }, { lon: 0, lat: -70 }, { lon: 60, lat: -67 },
    { lon: 120, lat: -66 }, { lon: 180, lat: -78 }, { lon: 180, lat: -90 },
    { lon: -180, lat: -90 }, { lon: -180, lat: -78 }
  ],
  // Greenland
  [
    { lon: -45, lat: 60 }, { lon: -35, lat: 66 }, { lon: -20, lat: 76 },
    { lon: -30, lat: 83 }, { lon: -55, lat: 82 }, { lon: -60, lat: 76 },
    { lon: -50, lat: 68 }, { lon: -45, lat: 60 }
  ],
  // Great Britain & Ireland
  [
    { lon: -5, lat: 50 }, { lon: 1, lat: 51 }, { lon: 0, lat: 54 },
    { lon: -2, lat: 58 }, { lon: -5, lat: 58 }, { lon: -5, lat: 54 },
    { lon: -10, lat: 52 }, { lon: -5, lat: 50 }
  ],
  // Japan
  [
    { lon: 130, lat: 31 }, { lon: 133, lat: 34 }, { lon: 139, lat: 35 },
    { lon: 141, lat: 41 }, { lon: 144, lat: 44 }, { lon: 141, lat: 45 },
    { lon: 137, lat: 37 }, { lon: 130, lat: 31 }
  ]
];

// Major city lights for night-glow aesthetic [lon, lat, intensity]
const NIGHT_LIGHT_CLUSTERS = [
  { lon: -58.38, lat: -34.60, r: 8, color: "rgba(0, 243, 255, 0.9)" }, // Buenos Aires
  { lon: -46.63, lat: -23.55, r: 10, color: "rgba(245, 158, 11, 0.85)" }, // São Paulo
  { lon: -74.00, lat: 40.71, r: 12, color: "rgba(0, 243, 255, 0.9)" }, // New York
  { lon: -118.24, lat: 34.05, r: 10, color: "rgba(245, 158, 11, 0.85)" }, // Los Angeles
  { lon: -0.12, lat: 51.50, r: 11, color: "rgba(0, 243, 255, 0.9)" }, // London
  { lon: 2.35, lat: 48.85, r: 10, color: "rgba(245, 158, 11, 0.85)" }, // Paris
  { lon: 13.40, lat: 52.52, r: 8, color: "rgba(0, 243, 255, 0.8)" }, // Berlin
  { lon: 37.61, lat: 55.75, r: 9, color: "rgba(245, 158, 11, 0.8)" }, // Moscow
  { lon: 139.69, lat: 35.68, r: 14, color: "rgba(0, 243, 255, 0.95)" }, // Tokyo
  { lon: 116.40, lat: 39.90, r: 12, color: "rgba(245, 158, 11, 0.85)" }, // Beijing
  { lon: 121.47, lat: 31.23, r: 12, color: "rgba(0, 243, 255, 0.9)" }, // Shanghai
  { lon: 77.20, lat: 28.61, r: 11, color: "rgba(245, 158, 11, 0.85)" }, // New Delhi
  { lon: 55.27, lat: 25.20, r: 8, color: "rgba(0, 243, 255, 0.9)" }, // Dubai
  { lon: 151.20, lat: -33.86, r: 8, color: "rgba(0, 243, 255, 0.85)" }, // Sydney
  { lon: 18.42, lat: -33.92, r: 7, color: "rgba(245, 158, 11, 0.8)" }, // Cape Town
  { lon: 31.23, lat: 30.04, r: 8, color: "rgba(245, 158, 11, 0.8)" }, // Cairo
  { lon: -99.13, lat: 19.43, r: 10, color: "rgba(245, 158, 11, 0.85)" }, // Mexico City
  { lon: -70.66, lat: -33.44, r: 7, color: "rgba(0, 243, 255, 0.8)" }, // Santiago
  { lon: -77.04, lat: -12.04, r: 7, color: "rgba(0, 243, 255, 0.8)" }, // Lima
  { lon: -74.07, lat: 4.71, r: 7, color: "rgba(0, 243, 255, 0.8)" } // Bogotá
];

export function createEarthCanvas(width = 2048, height = 1024): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // 1. Deep space / night ocean background
  const oceanGradient = ctx.createLinearGradient(0, 0, 0, height);
  oceanGradient.addColorStop(0, "#060913");
  oceanGradient.addColorStop(0.5, "#080e1e");
  oceanGradient.addColorStop(1, "#060913");
  ctx.fillStyle = oceanGradient;
  ctx.fillRect(0, 0, width, height);

  // Helper coordinate conversion
  const toX = (lon: number) => ((lon + 180) / 360) * width;
  const toY = (lat: number) => ((90 - lat) / 180) * height;

  // 2. Lat / Lon Graticule Grid (subtle cosmic wireframe)
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(0, 243, 255, 0.07)";

  // Parallels (every 15 degrees)
  for (let lat = -75; lat <= 75; lat += 15) {
    const y = toY(lat);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    if (lat === 0) {
      ctx.strokeStyle = "rgba(0, 243, 255, 0.22)"; // Equator
      ctx.stroke();
      ctx.strokeStyle = "rgba(0, 243, 255, 0.07)";
    } else {
      ctx.stroke();
    }
  }

  // Meridians (every 15 degrees)
  for (let lon = -180; lon <= 180; lon += 15) {
    const x = toX(lon);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    if (lon === 0) {
      ctx.strokeStyle = "rgba(0, 243, 255, 0.22)"; // Prime Meridian
      ctx.stroke();
      ctx.strokeStyle = "rgba(0, 243, 255, 0.07)";
    } else {
      ctx.stroke();
    }
  }

  // 3. Draw Continents
  CONTINENTS.forEach(poly => {
    if (poly.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(toX(poly[0].lon), toY(poly[0].lat));
    for (let i = 1; i < poly.length; i++) {
      ctx.lineTo(toX(poly[i].lon), toY(poly[i].lat));
    }
    ctx.closePath();

    // Dark slate landmass fill
    ctx.fillStyle = "#121a2a";
    ctx.fill();

    // Subtle luminous coastal edge
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(0, 243, 255, 0.35)";
    ctx.stroke();
  });

  // 4. Draw Night City Lights (Warm Amber & Cyan clusters)
  NIGHT_LIGHT_CLUSTERS.forEach(cluster => {
    const cx = toX(cluster.lon);
    const cy = toY(cluster.lat);

    // Glowing halo
    const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cluster.r * 2.5);
    glowGrad.addColorStop(0, cluster.color);
    glowGrad.addColorStop(0.4, cluster.color.replace("0.9", "0.3").replace("0.85", "0.25").replace("0.8", "0.2"));
    glowGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, cluster.r * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Intense core
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(cx, cy, 1.8, 0, Math.PI * 2);
    ctx.fill();
  });

  return canvas;
}
