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

interface AnimatedRing {
  mesh: THREE.Mesh;
  baseScale: number;
  phase: number;
  speed: number;
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

  // Refs to persist Three.js objects across marker updates
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const globeGroupRef = useRef<THREE.Group | null>(null);
  const markersGroupRef = useRef<THREE.Group | null>(null);
  const animatedRingsRef = useRef<AnimatedRing[]>([]);
  const interactiveObjectsRef = useRef<THREE.Object3D[]>([]);

  // Keep latest callbacks in ref to prevent re-attaching event listeners
  const callbacksRef = useRef({ onSelectLocation, onSwitchTo2D });
  callbacksRef.current = { onSelectLocation, onSwitchTo2D };

  const earthRadius = 80;

  // --- 1. Mount Effect: Initialize Three.js Scene ONCE ---
  useEffect(() => {
    if (!webglSupported) {
      setHasWebGL(false);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth || 800;
    const height = container.clientHeight || window.innerHeight || 600;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0b10); // Deep space slate
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 2000);
    camera.position.set(0, 0, 250);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance"
      });
      renderer.setSize(width, height, false);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.domElement.style.display = "block";
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;
    } catch (e) {
      console.warn("Could not create WebGLRenderer:", e);
      setHasWebGL(false);
      return;
    }

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xd4e9ff, 1.8);
    sunLight.position.set(200, 150, 180);
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
      size: 1.5,
      transparent: true,
      opacity: 0.7
    });
    const starField = new THREE.Points(starsGeo, starsMat);
    scene.add(starField);

    // --- Earth Sphere ---
    const globeGroup = new THREE.Group();
    scene.add(globeGroup);
    globeGroupRef.current = globeGroup;

    const earthCanvas = createEarthCanvas(2048, 1024);
    const earthTexture = new THREE.CanvasTexture(earthCanvas);
    earthTexture.wrapS = THREE.ClampToEdgeWrapping;
    earthTexture.wrapT = THREE.ClampToEdgeWrapping;
    earthTexture.needsUpdate = true;

    const earthGeo = new THREE.SphereGeometry(earthRadius, 64, 64);
    const earthMat = new THREE.MeshStandardMaterial({
      map: earthTexture,
      roughness: 0.75,
      metalness: 0.1
    });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    globeGroup.add(earthMesh);

    // --- Ethereal Atmospheric Glow (Safe Clamped Shader) ---
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
        float intensity = pow(clamp(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 2.2);
        gl_FragColor = vec4(0.0, 0.95, 1.0, 1.0) * intensity * 1.4;
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

    // --- Group for markers ---
    const markersGroup = new THREE.Group();
    globeGroup.add(markersGroup);
    markersGroupRef.current = markersGroup;

    // --- Initial Camera Alignment towards Active Coords ---
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

    let mouseDownPos = { x: 0, y: 0 };
    let dragDistance = 0;

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      autoRotate = false;
      dragDistance = 0;
      previousMousePosition = { x: e.clientX, y: e.clientY };
      mouseDownPos = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

      // Raycasting for marker tooltips
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);
      const intersects = raycaster.intersectObjects(interactiveObjectsRef.current, true);

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
              lat: hitData.lat,
              lon: hitData.lon,
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
      dragDistance += Math.hypot(deltaX, deltaY);

      velX = deltaX * 0.005;
      velY = deltaY * 0.005;

      globeGroup.rotation.y += velX;
      globeGroup.rotation.x += velY;

      // Clamp vertical rotation so globe doesn't flip
      globeGroup.rotation.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, globeGroup.rotation.x));

      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY * 0.12;
      const newDist = THREE.MathUtils.clamp(camera.position.z + zoomFactor, 110, 400);
      camera.position.z = newDist;

      // Transition to 2D map when zooming into surface
      if (newDist <= 118) {
        callbacksRef.current.onSwitchTo2D();
      }
    };

    // Double-click lands on 2D map and fixes coordinates
    const onDblClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);

      // Check marker hits first
      const markerHits = raycaster.intersectObjects(interactiveObjectsRef.current, true);
      if (markerHits.length > 0) {
        const hit = markerHits[0].object.userData;
        callbacksRef.current.onSelectLocation(hit.lat, hit.lon, hit.markerData);
        return;
      }

      // Check Earth surface hits
      const earthHits = raycaster.intersectObject(earthMesh);
      if (earthHits.length > 0) {
        const point = earthHits[0].point;
        const localPoint = globeGroup.worldToLocal(point.clone());
        const coords = vector3ToLatLon(localPoint);
        callbacksRef.current.onSelectLocation(coords.lat, coords.lon);
      }
    };

    // Single click on a marker without drag opens/pins tooltip, doesn't switch to 2D
    const onClick = (e: MouseEvent) => {
      if (dragDistance > 5) return; // Ignore drag gestures

      const rect = container.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);

      const markerHits = raycaster.intersectObjects(interactiveObjectsRef.current, true);
      if (markerHits.length > 0) {
        const hit = markerHits[0].object.userData;
        if (hit.markerData) {
          setHoveredMarker({
            marker: hit.markerData,
            screenX: e.clientX,
            screenY: e.clientY
          });
        }
      }
    };

    const domElement = renderer.domElement;
    domElement.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    domElement.addEventListener("wheel", onWheel, { passive: false });
    domElement.addEventListener("click", onClick);
    domElement.addEventListener("dblclick", onDblClick);

    // --- Animation Loop ---
    let reqId: number;
    const clock = new THREE.Clock();

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
      animatedRingsRef.current.forEach(item => {
        const t = (time * item.speed + item.phase) % 1;
        const scale = item.baseScale * (1 + t * 2.2);
        item.mesh.scale.set(scale, scale, 1);
        const mat = item.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, 0.95 * (1 - t));
      });

      renderer.render(scene, camera);
    };

    animate();

    // --- Resize Observer for Container ---
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h, false);
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(reqId);
      resizeObserver.disconnect();
      domElement.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      domElement.removeEventListener("wheel", onWheel);
      domElement.removeEventListener("click", onClick);
      domElement.removeEventListener("dblclick", onDblClick);

      if (domElement.parentNode === container) {
        container.removeChild(domElement);
      }
      renderer.dispose();
      scene.clear();
    };
  }, [webglSupported]);

  // --- 2. Marker Update Effect: updates nodes without disposing renderer ---
  useEffect(() => {
    const markersGroup = markersGroupRef.current;
    if (!markersGroup) return;

    // Clear previous markers
    while (markersGroup.children.length > 0) {
      const child = markersGroup.children[0];
      markersGroup.remove(child);
    }
    animatedRingsRef.current = [];
    interactiveObjectsRef.current = [];

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

      animatedRingsRef.current.push({
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
      interactiveObjectsRef.current.push(hitMesh);

      markersGroup.add(nodeRoot);
    };

    // Spawn user position beacon
    spawnNode(userCoords[0], userCoords[1], 0x00f3ff, undefined, true);

    // Spawn spatial graffitis
    markers.forEach(m => {
      const color = m.isTrusted ? 0x10b981 : m.isLocal ? 0x00f3ff : 0xf59e0b;
      spawnNode(m.lat, m.lon, color, m, false);
    });
  }, [markers, userCoords]);

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
          <div
            className="tooltip-action"
            style={{ cursor: "pointer" }}
            onClick={() => callbacksRef.current.onSelectLocation(hoveredMarker.marker.lat, hoveredMarker.marker.lon, hoveredMarker.marker)}
          >
            <Sparkles size={12} className="tooltip-action-icon" />
            <span>Haz clic para aterrizar y leer</span>
          </div>
        </div>
      )}

      {/* Hint Banner at bottom */}
      <div className="globe-hint-banner">
        <span>Arrastra para rotar la Tierra • Rueda para zoom • Doble clic para aterrizar en el mapa 2D</span>
      </div>
    </div>
  );
}
