"use client";

import { Stars } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "@/components/3d/OrbitControls";
import { BRIGHT_STARS, DELTA_HOTSPOTS, SATELLITES } from "@/lib/experience/catalog";

const DAY_URL = "https://unpkg.com/three-globe@2.31.1/example/img/earth-blue-marble.jpg";
const NIGHT_URL = "https://unpkg.com/three-globe@2.31.1/example/img/earth-night.jpg";
const CLOUD_URL = "https://unpkg.com/three-globe@2.31.1/example/img/earth-clouds.png";
const GLOBE_RADIUS = 2;

interface GlobeTarget {
  latitude: number;
  longitude: number;
  label: string;
}

interface GlobeViewerProps {
  target: GlobeTarget | null;
  onArrival: () => void;
  floodScore?: number | null;
}

export function GlobeViewer({ target, onArrival, floodScore = null }: GlobeViewerProps) {
  const [webgl, setWebgl] = useState(true);
  const readout = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      setWebgl(Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl")));
    } catch {
      setWebgl(false);
    }
  }, []);

  if (!webgl) {
    return (
      <div className="grid h-full place-items-center bg-abyss px-6 text-center">
        <div>
          <div className="mx-auto h-40 w-40 rounded-full bg-[radial-gradient(circle_at_35%_35%,#1c6d78,transparent_40%),radial-gradient(circle_at_50%_50%,#12343c,#071116_70%)] shadow-glass" />
          <p className="mt-6 max-w-sm text-sm text-mist">
            WebGL is unavailable in this browser. Search still runs, and the watershed view opens without the globe.
          </p>
          {target ? (
            <button type="button" className="btn-primary mt-4" onClick={onArrival}>
              Open {target.label.split(",")[0]}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="globe-stage relative h-full w-full">
      <Canvas
        camera={{ position: [2.4, 1.1, 5.8], fov: 42, near: 0.1, far: 200 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      >
        <color attach="background" args={["#090D16"]} />
        <Scene target={target} onArrival={onArrival} floodScore={floodScore} readout={readout} />
      </Canvas>
      <p ref={readout} className="pointer-events-none absolute bottom-6 left-6 min-h-6 rounded-full border border-white/15 bg-black/30 px-3 py-1 font-mono text-[11px] text-foam backdrop-blur" />
      <div className="globe-vignette pointer-events-none absolute inset-0" />
    </div>
  );
}

function Scene({
  target,
  onArrival,
  floodScore,
  readout,
}: GlobeViewerProps & { readout: RefObject<HTMLParagraphElement> }) {
  const [idle, setIdle] = useState(true);
  const [phase, setPhase] = useState<"orbit" | "flight" | "landed">(target ? "flight" : "orbit");
  const arrivalRef = useRef(onArrival);
  arrivalRef.current = onArrival;
  const targetKey = target ? `${target.latitude.toFixed(4)}:${target.longitude.toFixed(4)}` : "";

  useEffect(() => {
    if (!targetKey) return;
    setPhase("flight");
  }, [targetKey]);

  useEffect(() => {
    let timer = window.setTimeout(() => setIdle(true), 8000);
    const bump = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), 8000);
    };
    window.addEventListener("pointerdown", bump);
    window.addEventListener("wheel", bump, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("wheel", bump);
    };
  }, []);

  return (
    <>
      <CameraRig
        latitude={target?.latitude ?? null}
        longitude={target?.longitude ?? null}
        active={phase === "flight"}
        onDone={() => {
          setPhase("landed");
          arrivalRef.current();
        }}
      />
      {phase !== "flight" ? <OrbitControls autoRotate={phase === "orbit" || idle} /> : null}
      <Earth />
      <Clouds />
      <Atmosphere />
      <Hotspots />
      <Satellites />
      <Aurora />
      <CatalogueStars />
      {target ? <Beacon latitude={target.latitude} longitude={target.longitude} /> : null}
      {target && (floodScore ?? 0) >= 60 ? <Rain latitude={target.latitude} longitude={target.longitude} /> : null}
      <PointerReadout readout={readout} />
      <Stars radius={90} depth={30} count={900} factor={2} fade speed={0.15} />
    </>
  );
}

function CameraRig({
  latitude,
  longitude,
  active,
  onDone,
}: {
  latitude: number | null;
  longitude: number | null;
  active: boolean;
  onDone: () => void;
}) {
  const camera = useThree((state) => state.camera);
  const clock = useThree((state) => state.clock);
  const start = useRef(new THREE.Vector3());
  const end = useRef(new THREE.Vector3());
  const control = useRef(new THREE.Vector3());
  const scratch = useRef(new THREE.Vector3());
  const began = useRef(0);
  const finished = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const reduce = useReducedMotion();

  useEffect(() => {
    if (latitude === null || longitude === null || !active) return;
    start.current.copy(camera.position);
    end.current.copy(latLonToVector(latitude, longitude, 2.82));
    const lift = Math.max(start.current.length(), 4.4);
    control.current.copy(start.current).add(end.current).multiplyScalar(0.5).normalize().multiplyScalar(lift);
    began.current = clock.getElapsedTime();
    finished.current = false;
    if (reduce) {
      camera.position.copy(end.current);
      camera.lookAt(0, 0, 0);
      finished.current = true;
      onDoneRef.current();
    }
  }, [latitude, longitude, active, camera, clock, reduce]);

  useFrame(() => {
    if (latitude === null || longitude === null || !active || finished.current || reduce) return;
    const t = smoothstep((clock.getElapsedTime() - began.current) / 3.1);
    const u = 1 - t;
    scratch.current
      .set(0, 0, 0)
      .addScaledVector(start.current, u * u)
      .addScaledVector(control.current, 2 * u * t)
      .addScaledVector(end.current, t * t);
    camera.position.copy(scratch.current);
    camera.lookAt(0, 0, 0);
    if (t >= 1) {
      finished.current = true;
      onDoneRef.current();
    }
  });

  return null;
}

function Earth() {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const procedural = useMemo(() => createPlanetTextures(), []);
  const day = useRemoteTexture(DAY_URL);
  const night = useRemoteTexture(NIGHT_URL);
  const uniforms = useMemo(
    () => ({
      dayMap: { value: procedural.day },
      nightMap: { value: procedural.night },
      sunDirection: { value: solarDirection() },
    }),
    [procedural.day, procedural.night],
  );

  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    material.uniforms.dayMap.value = day ?? procedural.day;
    material.uniforms.nightMap.value = night ?? procedural.night;
  }, [day, night, procedural.day, procedural.night]);

  useFrame(() => {
    const material = materialRef.current;
    if (!material) return;
    material.uniforms.sunDirection.value.copy(solarDirection());
  });

  return (
    <mesh>
      <sphereGeometry args={[GLOBE_RADIUS, 96, 96]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={earthVertex}
        fragmentShader={earthFragment}
        toneMapped={false}
      />
    </mesh>
  );
}

function Clouds() {
  const lower = useRef<THREE.Mesh>(null);
  const upper = useRef<THREE.Mesh>(null);
  const remote = useRemoteTexture(CLOUD_URL);
  const procedural = useMemo(() => createCloudTexture(), []);
  const map = remote ?? procedural;

  useFrame((_, delta) => {
    if (lower.current) lower.current.rotation.y += delta * 0.012;
    if (upper.current) upper.current.rotation.y -= delta * 0.007;
  });

  return (
    <group>
      <mesh ref={lower}>
        <sphereGeometry args={[GLOBE_RADIUS * 1.02, 64, 64]} />
        <meshBasicMaterial map={map} transparent opacity={0.34} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={upper}>
        <sphereGeometry args={[GLOBE_RADIUS * 1.055, 48, 48]} />
        <meshBasicMaterial map={map} transparent opacity={0.18} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Atmosphere() {
  const material = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ sunDirection: { value: solarDirection() } }), []);
  useFrame(() => {
    if (!material.current) return;
    material.current.uniforms.sunDirection.value.copy(solarDirection());
  });
  return (
    <mesh scale={1.12}>
      <sphereGeometry args={[GLOBE_RADIUS, 64, 64]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={atmosphereVertex}
        fragmentShader={atmosphereFragment}
        side={THREE.BackSide}
        transparent
        depthWrite={false}
        toneMapped={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

function Beacon({ latitude, longitude }: { latitude: number; longitude: number }) {
  const placement = useMemo(() => {
    const position = latLonToVector(latitude, longitude, GLOBE_RADIUS * 1.01);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      position.clone().normalize(),
    );
    return { position, quaternion };
  }, [latitude, longitude]);

  return (
    <group position={placement.position} quaternion={placement.quaternion}>
      <mesh position={[0, 0.045, 0]}>
        <sphereGeometry args={[0.02, 18, 18]} />
        <meshBasicMaterial color="#e7a15a" toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.045, 0]}>
        <ringGeometry args={[0.035, 0.05, 32]} />
        <meshBasicMaterial color="#3ddec0" side={THREE.DoubleSide} transparent opacity={0.8} toneMapped={false} />
      </mesh>
    </group>
  );
}

function useRemoteTexture(url: string): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    let active = true;
    loader.load(
      url,
      (next) => {
        if (!active) {
          next.dispose();
          return;
        }
        next.colorSpace = THREE.SRGBColorSpace;
        next.anisotropy = 8;
        setTexture(next);
      },
      undefined,
      () => {
        if (active) setTexture(null);
      },
    );
    return () => {
      active = false;
    };
  }, [url]);

  return texture;
}

function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduce(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return reduce;
}

function Hotspots() {
  return (
    <group>
      {DELTA_HOTSPOTS.map((spot) => (
        <Beacon key={spot.id} latitude={spot.latitude} longitude={spot.longitude} />
      ))}
    </group>
  );
}

function Satellites() {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!group.current) return;
    group.current.children.forEach((child, index) => {
      child.rotation.z = clock.elapsedTime * (0.18 + index * 0.05);
    });
  });
  return (
    <group ref={group}>
      {SATELLITES.map((satellite) => (
        <group key={satellite.id} rotation={[THREE.MathUtils.degToRad(satellite.inclination - 90), satellite.phase, 0]}>
          <mesh>
            <torusGeometry args={[2.62, 0.006, 8, 80]} />
            <meshBasicMaterial color="#7ef6ff" transparent opacity={0.45} toneMapped={false} />
          </mesh>
          <mesh position={[2.62, 0, 0]}>
            <sphereGeometry args={[0.03, 10, 10]} />
            <meshBasicMaterial color="#ffffff" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Aurora() {
  const positions = useMemo(() => {
    const count = 180;
    const values = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const latitude = index % 2 === 0 ? 68 + (index % 12) : -68 - (index % 12);
      const longitude = ((index * 19) % 360) - 180;
      const point = latLonToVector(latitude, longitude, GLOBE_RADIUS * 1.08);
      values[index * 3] = point.x;
      values[index * 3 + 1] = point.y;
      values[index * 3 + 2] = point.z;
    }
    return values;
  }, []);
  const ref = useRef<THREE.Points>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.elapsedTime * 0.02;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#7dffa8" size={0.035} transparent opacity={0.7} depthWrite={false} toneMapped={false} />
    </points>
  );
}

function CatalogueStars() {
  const positions = useMemo(() => {
    const values = new Float32Array(BRIGHT_STARS.length * 3);
    BRIGHT_STARS.forEach((star, index) => {
      const point = latLonToVector(star.dec, star.raHours * 15 - 180, 46);
      values[index * 3] = point.x;
      values[index * 3 + 1] = point.y;
      values[index * 3 + 2] = point.z;
    });
    return values;
  }, []);
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#f4f7ff" size={0.18} sizeAttenuation transparent opacity={0.95} toneMapped={false} />
    </points>
  );
}

function Rain({ latitude, longitude }: { latitude: number; longitude: number }) {
  const count = 80;
  const seeds = useMemo(() => Array.from({ length: count }, (_, index) => index / count), []);
  const ref = useRef<THREE.Points>(null);
  const placement = useMemo(() => latLonToVector(latitude, longitude, GLOBE_RADIUS * 1.02), [latitude, longitude]);
  const positions = useMemo(() => new Float32Array(count * 3), []);
  useFrame(({ clock }) => {
    const geometry = ref.current?.geometry;
    const attribute = geometry?.getAttribute("position");
    if (!attribute) return;
    seeds.forEach((seed, index) => {
      const fall = (clock.elapsedTime * 0.35 + seed) % 1;
      positions[index * 3] = (seed - 0.5) * 0.35;
      positions[index * 3 + 1] = 0.45 - fall * 0.5;
      positions[index * 3 + 2] = ((index % 7) - 3) * 0.03;
    });
    attribute.needsUpdate = true;
  });
  const quaternion = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), placement.clone().normalize()),
    [placement],
  );
  return (
    <points ref={ref} position={placement} quaternion={quaternion}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#b7ecff" size={0.015} transparent opacity={0.8} depthWrite={false} toneMapped={false} />
    </points>
  );
}

function PointerReadout({ readout }: { readout: RefObject<HTMLParagraphElement> }) {
  const camera = useThree((state) => state.camera);
  const pointer = useThree((state) => state.pointer);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const sphere = useMemo(() => new THREE.Sphere(new THREE.Vector3(), GLOBE_RADIUS), []);
  const hit = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const node = readout.current;
    if (!node) return;
    raycaster.setFromCamera(pointer, camera);
    const found = raycaster.ray.intersectSphere(sphere, hit);
    if (!found) {
      node.textContent = "";
      return;
    }
    const place = vectorToLatLon(hit);
    node.textContent = `${place.latitude.toFixed(2)}°, ${place.longitude.toFixed(2)}°`;
  });
  return null;
}

export function latLonToVector(latitude: number, longitude: number, radius: number): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - latitude);
  const theta = THREE.MathUtils.degToRad(longitude + 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function solarDirection(date = new Date()): THREE.Vector3 {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = (date.getTime() - start) / 86400000;
  const declination = 23.44 * Math.sin((2 * Math.PI * (day - 81)) / 365);
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const longitude = -15 * (hours - 12);
  return latLonToVector(declination, longitude, 1).normalize();
}

function vectorToLatLon(vector: THREE.Vector3): { latitude: number; longitude: number } {
  const normal = vector.clone().normalize();
  const latitude = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(normal.y, -1, 1)));
  let longitude = THREE.MathUtils.radToDeg(Math.atan2(normal.z, -normal.x)) - 180;
  if (longitude < -180) longitude += 360;
  if (longitude > 180) longitude -= 360;
  return { latitude, longitude };
}

function smoothstep(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

function createPlanetTextures(): { day: THREE.CanvasTexture; night: THREE.CanvasTexture } {
  const width = 1024;
  const height = 512;
  const dayCanvas = document.createElement("canvas");
  const nightCanvas = document.createElement("canvas");
  dayCanvas.width = width;
  nightCanvas.width = width;
  dayCanvas.height = height;
  nightCanvas.height = height;
  const dayCtx = dayCanvas.getContext("2d");
  const nightCtx = nightCanvas.getContext("2d");
  if (!dayCtx || !nightCtx) {
    const fallback = new THREE.CanvasTexture(dayCanvas);
    return { day: fallback, night: fallback };
  }
  const dayImage = dayCtx.createImageData(width, height);
  const nightImage = nightCtx.createImageData(width, height);

  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);
    const lat = (0.5 - v) * Math.PI;
    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      const lon = (u - 0.5) * Math.PI * 2;
      const mask =
        Math.sin(lat * 3.1 + 0.4) * Math.cos(lon * 2.15) +
        Math.sin(lon * 3.7 + lat * 2.1) * 0.62 +
        Math.cos(lat * 6.2 - lon * 2.8) * 0.33;
      const ice = Math.abs(lat) > 1.22;
      const land = ice || mask > 0.18;
      const offset = (y * width + x) * 4;
      if (land) {
        const shade = ice ? 228 : 92 + Math.floor((mask + 1) * 28);
        dayImage.data[offset] = ice ? shade : 78;
        dayImage.data[offset + 1] = ice ? shade : 118 + Math.floor(mask * 20);
        dayImage.data[offset + 2] = ice ? 232 : 78;
      } else {
        const depth = Math.min(1, Math.max(0, 0.18 - mask));
        dayImage.data[offset] = Math.floor(8 + depth * 20);
        dayImage.data[offset + 1] = Math.floor(42 + (1 - depth) * 50);
        dayImage.data[offset + 2] = Math.floor(58 + (1 - depth) * 28);
      }
      dayImage.data[offset + 3] = 255;

      nightImage.data[offset] = 4;
      nightImage.data[offset + 1] = 10;
      nightImage.data[offset + 2] = 16;
      nightImage.data[offset + 3] = 255;
      if (land && !ice && hash(x, y) > 0.9) {
        nightImage.data[offset] = 232;
        nightImage.data[offset + 1] = 196;
        nightImage.data[offset + 2] = 120;
      }
    }
  }

  dayCtx.putImageData(dayImage, 0, 0);
  nightCtx.putImageData(nightImage, 0, 0);
  const day = new THREE.CanvasTexture(dayCanvas);
  const night = new THREE.CanvasTexture(nightCanvas);
  day.colorSpace = THREE.SRGBColorSpace;
  night.colorSpace = THREE.SRGBColorSpace;
  return { day, night };
}

function createCloudTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  if (!context) return texture;
  context.clearRect(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < 90; index += 1) {
    const x = (index * 97) % canvas.width;
    const y = (index * 53) % canvas.height;
    const radius = 18 + (index % 7) * 8;
    const gradient = context.createRadialGradient(x, y, 4, x, y, radius);
    gradient.addColorStop(0, "rgba(255,255,255,0.55)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.ellipse(x, y, radius * 1.8, radius, index, 0, Math.PI * 2);
    context.fill();
  }
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function hash(x: number, y: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

const earthVertex = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const earthFragment = `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform vec3 sunDirection;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vec3 dayColor = texture2D(dayMap, vUv).rgb;
    vec3 nightColor = texture2D(nightMap, vUv).rgb;
    float height = dot(dayColor, vec3(0.3, 0.59, 0.11));
    float hx = dot(texture2D(dayMap, vUv + vec2(0.0016, 0.0)).rgb, vec3(0.3, 0.59, 0.11));
    float hy = dot(texture2D(dayMap, vUv + vec2(0.0, 0.0016)).rgb, vec3(0.3, 0.59, 0.11));
    vec3 normal = normalize(normalize(vNormal) + vec3(height - hx, hy - height, 0.0) * 1.4);
    float lambert = dot(normal, normalize(sunDirection));
    float dayMix = smoothstep(-0.08, 0.22, lambert);
    vec3 color = mix(nightColor * 1.45, dayColor, dayMix);
    float ocean = smoothstep(0.02, 0.2, dayColor.b - max(dayColor.r, dayColor.g));
    vec3 viewDirection = normalize(cameraPosition - vWorld);
    vec3 halfVector = normalize(normalize(sunDirection) + viewDirection);
    float spec = pow(max(dot(normal, halfVector), 0.0), 42.0) * ocean * dayMix;
    color += spec * vec3(0.75, 0.9, 1.0);
    gl_FragColor = vec4(color, 1.0);
  }
`;

const atmosphereVertex = `
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const atmosphereFragment = `
  uniform vec3 sunDirection;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vec3 viewDirection = normalize(cameraPosition - vWorld);
    vec3 normal = normalize(vNormal);
    float fresnel = pow(1.0 - abs(dot(viewDirection, normal)), 2.8);
    float mie = pow(max(dot(viewDirection, normalize(sunDirection)), 0.0), 10.0);
    vec3 rayleigh = vec3(0.22, 0.48, 0.95) * fresnel;
    vec3 scatter = vec3(1.0, 0.72, 0.42) * mie * fresnel;
    gl_FragColor = vec4((rayleigh + scatter) * 1.35, fresnel);
  }
`;
