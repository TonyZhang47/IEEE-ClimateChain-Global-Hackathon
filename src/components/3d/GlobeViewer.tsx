"use client";

import { Stars } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "@/components/3d/OrbitControls";

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
}

export function GlobeViewer({ target, onArrival }: GlobeViewerProps) {
  const [webgl, setWebgl] = useState(true);

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
    <Canvas
      camera={{ position: [2.4, 1.1, 5.8], fov: 42, near: 0.1, far: 100 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
    >
      <color attach="background" args={["#071116"]} />
      <Scene target={target} onArrival={onArrival} />
    </Canvas>
  );
}

function Scene({ target, onArrival }: GlobeViewerProps) {
  const [phase, setPhase] = useState<"orbit" | "flight" | "landed">(target ? "flight" : "orbit");
  const arrivalRef = useRef(onArrival);
  arrivalRef.current = onArrival;
  const targetKey = target ? `${target.latitude.toFixed(4)}:${target.longitude.toFixed(4)}` : "";

  useEffect(() => {
    if (!targetKey) return;
    setPhase("flight");
  }, [targetKey]);

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
      {phase !== "flight" ? <OrbitControls autoRotate={phase === "orbit"} /> : null}
      <Earth />
      <Clouds />
      <Atmosphere />
      {target ? <Beacon latitude={target.latitude} longitude={target.longitude} /> : null}
      <Stars radius={80} depth={40} count={1600} factor={2.2} fade speed={0.2} />
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
  const began = useRef(0);
  const finished = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const reduce = useReducedMotion();

  useEffect(() => {
    if (latitude === null || longitude === null || !active) return;
    start.current.copy(camera.position);
    end.current.copy(latLonToVector(latitude, longitude, 2.82));
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
    const t = smoothstep((clock.getElapsedTime() - began.current) / 2.7);
    camera.position.lerpVectors(start.current, end.current, t);
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
  const sun = useRef(new THREE.Vector3(4, 0.6, 2).normalize());

  const uniforms = useMemo(
    () => ({
      dayMap: { value: procedural.day },
      nightMap: { value: procedural.night },
      sunDirection: { value: sun.current.clone() },
    }),
    [procedural.day, procedural.night],
  );

  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    material.uniforms.dayMap.value = day ?? procedural.day;
    material.uniforms.nightMap.value = night ?? procedural.night;
  }, [day, night, procedural.day, procedural.night]);

  useFrame(({ clock }) => {
    const material = materialRef.current;
    if (!material) return;
    const angle = clock.getElapsedTime() * 0.05;
    sun.current.set(Math.cos(angle) * 4, 0.55, Math.sin(angle) * 4).normalize();
    material.uniforms.sunDirection.value.copy(sun.current);
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
  const ref = useRef<THREE.Mesh>(null);
  const remote = useRemoteTexture(CLOUD_URL);
  const procedural = useMemo(() => createCloudTexture(), []);

  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.rotation.y += delta * 0.012;
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[GLOBE_RADIUS * 1.025, 64, 64]} />
      <meshBasicMaterial
        map={remote ?? procedural}
        transparent
        opacity={0.42}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

function Atmosphere() {
  return (
    <mesh scale={1.08}>
      <sphereGeometry args={[GLOBE_RADIUS, 64, 64]} />
      <shaderMaterial
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

export function latLonToVector(latitude: number, longitude: number, radius: number): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - latitude);
  const theta = THREE.MathUtils.degToRad(longitude + 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
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
  void main() {
    vec3 dayColor = texture2D(dayMap, vUv).rgb;
    vec3 nightColor = texture2D(nightMap, vUv).rgb;
    float lambert = dot(normalize(vNormal), normalize(sunDirection));
    float dayMix = smoothstep(-0.12, 0.28, lambert);
    vec3 color = mix(nightColor * 1.35, dayColor, dayMix);
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
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vec3 viewDirection = normalize(cameraPosition - vWorld);
    float fresnel = pow(1.0 - abs(dot(viewDirection, normalize(vNormal))), 2.6);
    gl_FragColor = vec4(0.45, 0.82, 0.78, 1.0) * fresnel;
  }
`;
