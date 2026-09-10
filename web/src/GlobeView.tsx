import { useEffect, useRef, useState, useMemo } from "react";
import * as THREE from "three";
import { Globe, ZoomIn, ZoomOut, Compass, Sparkles, Navigation } from "lucide-react";
import { createEarthCanvas } from "./globeTexture";

export interface GlobeMarker {
  id: string;
  lat: number;
  lon: number;
  geohash: string;
  text: string;
  author: string;
  timestamp: number;
  isLocal: boolean;
  isTrusted: boolean;
  raw?: any;
}

interface GlobeViewProps {
  markers: GlobeMarker[];
  userCoords: [number, number];
  activeCoords: [number, number];
  onSelectLocation: (lat: number, lon: number, marker?: GlobeMarker) => void;
  onSwitchTo2D: () => void;
  className?: string;
}

// Convert spherical (lat, lon) to 3D Cartesian coordinates on sphere of radius R
export function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

// Convert 3D Cartesian point on sphere back to (lat, lon)
export function vector3ToLatLon(v: THREE.Vector3): { lat: number; lon: number } {
  const norm = v.clone().normalize();
  const lat = 90 - Math.acos(Math.max(-1, Math.min(1, norm.y))) * (180 / Math.PI);
  let lon = (Math.atan2(norm.z, -norm.x) * (180 / Math.PI)) - 180;
  while (lon < -180) lon += 360;
  while (lon > 180) lon -= 360;
  return { lat, lon };
}

function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch (e) {
    return false;
  }
}

export default function GlobeView({
  markers,
  userCoords,
  activeCoords,
  onSelectLocation,
  onSwitchTo2D,
  className = ""
}: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hasWebGL, setHasWebGL] = useState<boolean>(true);
  const [hoveredMarker, setHoveredMarker] = useState<{
    marker: GlobeMarker;
    screenX: number;
    screenY: number;
  } | null>(null);

  const webglSupported = useMemo(() => isWebGLAvailable(), []);

  useEffect(() => {
    if (!webglSupported) {
      setHasWebGL(false);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    // --- Three.js Setup ---
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0b10); // Deep space slate

    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 2000);
    camera.position.set(0, 50, 240);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.appendChild(renderer.domElement);
    } catch (e) {
      console.warn("Could not create WebGLRenderer in environment:", e);
      setHasWebGL(false);
      return;
    }

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xa5d8ff, 1.6);
    sunLight.position.set(200, 150, 150);
    scene.add(sunLight);

    // --- Starfield Background ---
    const starsGeo = new THREE.BufferGeometry();
    const starCount = 1200;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      const r = 400 + Math.random() * 500;
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const sinPhi = Math.sin(phi);
      starPos[i] = r * sinPhi * Math.cos(theta);
      starPos[i + 1] = r * sinPhi * Math.sin(theta);
      starPos[i + 2] = r * Math.cos(phi);
    }
    starsGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const starsMat = new THREE.PointsMaterial({
      color: 0x8ec5fc,
      size: 1.4,
      transparent: true,
      opacity: 0.65
    });
    const starField = new THREE.Points(starsGeo, starsMat);
    scene.add(starField);

    // --- Earth Sphere ---
    const earthRadius = 80;
    const earthCanvas = createEarthCanvas(2048, 1024);
    const earthTexture = new THREE.CanvasTexture(earthCanvas);
    earthTexture.wrapS = THREE.ClampToEdgeWrapping;
    earthTexture.wrapT = THREE.ClampToEdgeWrapping;

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    const earthGeo = new THREE.SphereGeometry(earthRadius, 64, 64);
    const earthMat = new THREE.MeshStandardMaterial({
      map: earthTexture,
      roughness: 0.8,
      metalness: 0.15
    });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    globeGroup.add(earthMesh);

    // --- Ethereal Atmospheric Glow (Radio Atlas aesthetic) ---
    const atmosphereVertexShader = `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    const atmosphereFragmentShader = `
      varying vec3 vNormal;
      void main() {
        float intensity = pow(0.62 - dot(vNormal, vec3(0, 0, 1.0)), 2.6);
        gl_FragColor = vec4(0.0, 0.95, 1.0, 1.0) * intensity * 1.5;
      }
    `;
    const atmosphereGeo = new THREE.SphereGeometry(earthRadius * 1.15, 64, 64);
    const atmosphereMat = new THREE.ShaderMaterial({
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true
    });
    const atmosphereMesh = new THREE.Mesh(atmosphereGeo, atmosphereMat);
    scene.add(atmosphereMesh);

    // --- Marker Meshes Group ---
    const markersGroup = new THREE.Group();
    globeGroup.add(markersGroup);

    interface AnimatedRing {
      mesh: THREE.Mesh;
      baseScale: number;
      phase: number;
      speed: number;
    }
    const animatedRings: AnimatedRing[] = [];
    const interactiveObjects: THREE.Object3D[] = [];

    // Helper to spawn a pulsating node
    const spawnNode = (
      lat: number,
      lon: number,
      colorHex: number,
      markerData?: GlobeMarker,
      isUser = false
    ) => {
      const pos = latLonToVector3(lat, lon, earthRadius + 0.3);
      const normal = pos.clone().normalize();

      const nodeRoot = new THREE.Group();
      nodeRoot.position.copy(pos);
      nodeRoot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);

      // Core dot
      const coreRadius = isUser ? 1.6 : 1.2;
      const coreGeo = new THREE.CircleGeometry(coreRadius, 24);
      const coreMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.position.z = 0.2;
      nodeRoot.add(coreMesh);

      // Pulsating Radio Garden Ring
      const ringGeo = new THREE.RingGeometry(coreRadius * 1.1, coreRadius * 1.8, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.z = 0.1;
      nodeRoot.add(ringMesh);

      animatedRings.push({
        mesh: ringMesh,
        baseScale: 1,
        phase: Math.random() * Math.PI * 2,
        speed: isUser ? 2.5 : 1.8
      });

      // Vertical beacon line extending into space
      const beamHeight = isUser ? 14 : 9;
      const beamGeo = new THREE.CylinderGeometry(0.15, 0.15, beamHeight, 8);
      beamGeo.translate(0, beamHeight / 2, 0);
      const beamMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.55
      });
      const beamMesh = new THREE.Mesh(beamGeo, beamMat);
      beamMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
      nodeRoot.add(beamMesh);

      // Hitbox for raycaster
      const hitGeo = new THREE.SphereGeometry(3.5, 12, 12);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      hitMesh.userData = { markerData, lat, lon, isUser };
      nodeRoot.add(hitMesh);
      interactiveObjects.push(hitMesh);

      markersGroup.add(nodeRoot);
    };

    // User position beacon (bright electric cyan)
    spawnNode(userCoords[0], userCoords[1], 0x00f3ff, undefined, true);

    // Spatial Graffitis
    markers.forEach(m => {
      const color = m.isTrusted ? 0x10b981 : m.isLocal ? 0x00f3ff : 0xf59e0b;
      spawnNode(m.lat, m.lon, color, m, false);
    });

    // --- Initial Camera Alignment towards Active / User Coords ---
    const initialTarget = latLonToVector3(activeCoords[0], activeCoords[1], earthRadius);
    const initialRotY = -Math.atan2(initialTarget.x, initialTarget.z);
    const initialRotX = Math.asin(initialTarget.y / earthRadius);
    globeGroup.rotation.y = initialRotY;
    globeGroup.rotation.x = initialRotX;

    // --- Interactive Orbit & Drag Controls ---
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    let velX = 0;
    let velY = 0;
    let autoRotate = true;

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      autoRotate = false;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

      // Raycasting for marker tooltips
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);
      const intersects = raycaster.intersectObjects(interactiveObjects, true);

      if (intersects.length > 0) {
        container.style.cursor = "pointer";
        const hitData = intersects[0].object.userData;
        if (hitData.markerData) {
          setHoveredMarker({
            marker: hitData.markerData,
            screenX: e.clientX,
            screenY: e.clientY
          });
        } else if (hitData.isUser) {
          setHoveredMarker({
            marker: {
              id: "user-beacon",
              lat: userCoords[0],
              lon: userCoords[1],
              geohash: "Local Seeder",
              text: "Tu posición actual en el espacio-tiempo",
              author: "Tú",
              timestamp: Math.floor(Date.now() / 1000),
              isLocal: true,
              isTrusted: true
            },
            screenX: e.clientX,
            screenY: e.clientY
          });
        }
      } else {
        container.style.cursor = isDragging ? "grabbing" : "grab";
        setHoveredMarker(null);
      }

      if (!isDragging) return;

      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;

      velX = deltaX * 0.005;
      velY = deltaY * 0.005;

      globeGroup.rotation.y += velX;
      globeGroup.rotation.x += velY;

      // Clamp vertical rotation so globe doesn't invert
      globeGroup.rotation.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, globeGroup.rotation.x));

      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY * 0.12;
      const newDist = THREE.MathUtils.clamp(camera.position.z + zoomFactor, 120, 360);
      camera.position.z = newDist;

      // Smooth threshold transition to 2D map when zooming into surface
      if (newDist <= 125) {
        onSwitchTo2D();
      }
    };

    const onClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);

      // Check marker hits first
      const markerHits = raycaster.intersectObjects(interactiveObjects, true);
      if (markerHits.length > 0) {
        const hit = markerHits[0].object.userData;
        onSelectLocation(hit.lat, hit.lon, hit.markerData);
        return;
      }

      // Check Earth surface hits
      const earthHits = raycaster.intersectObject(earthMesh);
      if (earthHits.length > 0) {
        const point = earthHits[0].point;
        // Transform clicked point to globe local space
        const localPoint = globeGroup.worldToLocal(point.clone());
        const coords = vector3ToLatLon(localPoint);
        onSelectLocation(coords.lat, coords.lon);
      }
    };

    const domElement = renderer.domElement;
    domElement.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    domElement.addEventListener("wheel", onWheel, { passive: false });
    domElement.addEventListener("click", onClick);

    // --- Animation Loop ---
    let reqId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      reqId = requestAnimationFrame(animate);
      clock.getDelta();
      const time = clock.getElapsedTime();

      // Damping & Auto-rotation
      if (!isDragging) {
        velX *= 0.95;
        velY *= 0.95;
        globeGroup.rotation.y += velX;
        globeGroup.rotation.x += velY;

        if (autoRotate && Math.abs(velX) < 0.0005) {
          globeGroup.rotation.y += 0.0012; // Slow hypnotic spin
        }
      }

      // Pulsating Radio Garden Rings animation
      animatedRings.forEach(item => {
        const t = (time * item.speed + item.phase) % 1;
        const scale = item.baseScale * (1 + t * 2.2);
        item.mesh.scale.set(scale, scale, 1);
        const mat = item.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, 0.95 * (1 - t));
      });

      renderer.render(scene, camera);
    };

    animate();

    // --- Resize Handler ---
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    // Clean up
    return () => {
      cancelAnimationFrame(reqId);
      window.removeEventListener("resize", handleResize);
      domElement.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      domElement.removeEventListener("wheel", onWheel);
      domElement.removeEventListener("click", onClick);

      if (container.contains(domElement)) {
        container.removeChild(domElement);
      }
      renderer.dispose();
      scene.clear();
    };
  }, [webglSupported, markers, userCoords, activeCoords, onSelectLocation, onSwitchTo2D]);

  // Fallback for headless environments or no WebGL
  if (!webglSupported || !hasWebGL) {
    return (
      <div className={`globe-fallback-view ${className}`} data-testid="globe-view-fallback">
        <div className="globe-fallback-card">
          <div className="globe-fallback-icon-glow">
            <Globe size={48} className="text-cyan-400" />
          </div>
          <h3 className="globe-fallback-title">Visualización 3D Radio Garden</h3>
          <p className="globe-fallback-desc">
            Modo órbita global con {markers.length} graffitis espaciales en red P2P.
          </p>
          <div className="globe-fallback-actions">
            <button
              className="btn btn-primary"
              onClick={onSwitchTo2D}
              data-testid="globe-switch-2d"
            >
              🗺️ Ver Mapa 2D Local
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`globe-viewport-container ${className}`} data-testid="globe-view">
      {/* Three.js Canvas Container */}
      <div ref={containerRef} className="globe-canvas-wrapper" />

      {/* Floating HUD Controls & Aesthetic Badges */}
      <div className="globe-hud-top">
        <div className="globe-badge-pill">
          <span className="p2p-live-beacon" />
          <span className="globe-badge-title">Radio Atlas 3D</span>
          <span className="globe-badge-count">{markers.length} Nodos</span>
        </div>

        <button
          className="btn btn-secondary globe-switch-btn"
          onClick={onSwitchTo2D}
          title="Cambiar a vista de plano y mapa local detallado"
        >
          <Navigation size={14} className="icon-pulse" />
          <span>Aterrizar en Mapa 2D</span>
        </button>
      </div>

      <div className="globe-hud-sidebar">
        <button
          className="hud-tool-btn"
          onClick={() => {
            const container = containerRef.current;
            if (container) {
              const evt = new WheelEvent("wheel", { deltaY: -120 });
              container.querySelector("canvas")?.dispatchEvent(evt);
            }
          }}
          title="Acercar órbita"
        >
          <ZoomIn size={16} />
        </button>
        <button
          className="hud-tool-btn"
          onClick={() => {
            const container = containerRef.current;
            if (container) {
              const evt = new WheelEvent("wheel", { deltaY: 120 });
              container.querySelector("canvas")?.dispatchEvent(evt);
            }
          }}
          title="Alejar órbita"
        >
          <ZoomOut size={16} />
        </button>
        <button
          className="hud-tool-btn"
          onClick={() => onSelectLocation(userCoords[0], userCoords[1])}
          title="Centrar en mi ubicación"
        >
          <Compass size={16} />
        </button>
      </div>

      {/* Hover Node Tooltip */}
      {hoveredMarker && (
        <div
          className="globe-node-tooltip"
          style={{
            left: `${hoveredMarker.screenX + 16}px`,
            top: `${hoveredMarker.screenY - 24}px`
          }}
        >
          <div className="tooltip-header">
            <span
              className={`tooltip-badge ${
                hoveredMarker.marker.isTrusted
                  ? "trusted"
                  : hoveredMarker.marker.isLocal
                  ? "local"
                  : "remote"
              }`}
            >
              {hoveredMarker.marker.isTrusted
                ? "★ Confiable"
                : hoveredMarker.marker.isLocal
                ? "● Local"
                : "⚡ P2P"}
            </span>
            <span className="tooltip-geohash">
              <code>{hoveredMarker.marker.geohash.substring(0, 7)}</code>
            </span>
          </div>
          <div className="tooltip-content">
            "{hoveredMarker.marker.text.substring(0, 70)}
            {hoveredMarker.marker.text.length > 70 ? "..." : ""}"
          </div>
          <div className="tooltip-action">
            <Sparkles size={12} className="tooltip-action-icon" />
            <span>Haz clic para aterrizar y leer</span>
          </div>
        </div>
      )}

      {/* Hint Banner at bottom */}
      <div className="globe-hint-banner">
        <span>Arastra para rotar la Tierra • Rueda para zoom • Clic en un nodo o doble clic para aterrizar</span>
      </div>
    </div>
  );
}
