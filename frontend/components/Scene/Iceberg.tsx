"use client";

import { useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { Iceberg } from "@/lib/mockData";
import { latLonToScene } from "@/lib/geo";
import { usePolarisStore } from "@/lib/store";

const hash = (x: number, y: number, z: number) => { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); };
const sm = (t: number) => t * t * (3 - 2 * t);
function vnoise(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = sm(x - xi), yf = sm(y - yi), zf = sm(z - zi);
  let r = 0;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++)
    r += (i ? xf : 1 - xf) * (j ? yf : 1 - yf) * (k ? zf : 1 - zf) * hash(xi + i, yi + j, zi + k);
  return r;
}
function fbm(x: number, y: number, z: number, oct = 4) {
  let a = 0.5, f = 1, s = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, z * f); f *= 2; a *= 0.5; }
  return s;
}

type IcebergKind = "berg" | "spire" | "shelf";

const CLIP_ABOVE = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
const CLIP_BELOW = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

const COL_SNOW = new THREE.Color("#f4f9ff");
const COL_SIDE = new THREE.Color("#8fb0cc");
const COL_SHALLOW = new THREE.Color("#bfeaf5");
const COL_MID = new THREE.Color("#4cb4d6");
const COL_DEEP = new THREE.Color("#1c4f86");
const COL_STREAK = new THREE.Color("#7ee8ff");

function snowPeaks(
  hx: number,
  hz: number,
  px: number,
  pz: number,
  y: number,
  height: number,
  o: number,
  kind: IcebergKind
) {
  const peakCount = kind === "shelf" ? 3 : kind === "spire" ? 4 : 6;
  let cluster = 0;
  let dominant = 0;
  for (let k = 0; k < peakCount; k++) {
    const ang = o * 0.4 + k * ((Math.PI * 2) / peakCount);
    const cx = Math.cos(ang) * 0.42;
    const cz = Math.sin(ang) * 0.42;
    const dist = Math.hypot(hx - cx, hz - cz);
    const h = fbm(px * 0.35 + cx + o, pz * 0.35 + cz + o, k * 1.7, 4);
    const spike = Math.exp(-dist * (kind === "spire" ? 5.2 : 3.8)) * Math.pow(h, 1.35);
    if (k === 0) dominant = spike;
    cluster += spike * (k === 0 ? 1.55 : 0.72);
  }
  const ridge = 1 - Math.abs(2 * fbm(px * 0.28 + o, pz * 0.28 + o, 2.1, 5) - 1);
  const rimBoost = Math.pow(ridge, 2.4) * (0.35 + dominant * 1.1);
  const topScale = kind === "shelf" ? 0.18 : kind === "spire" ? 1.35 : 0.52;
  const ledgeStep =
    kind === "shelf"
      ? Math.floor(y * 8 + fbm(hx * 4 + o, hz * 4 + o, 1.2) * 3) * 0.06
      : Math.floor(y * 6 + fbm(hx * 3 + o, hz * 3 + o, 0.4) * 2) * 0.05;
  const peakLift =
    kind === "shelf"
      ? cluster * height * 0.35 + rimBoost * height * 0.25
      : (cluster + rimBoost) * height * (kind === "spire" ? 1.65 : 1.15);
  return y * height * topScale + peakLift + ledgeStep * height;
}

export function createIceberg({
  radius = 1,
  height = 0.8,
  seed = 1,
  detail = 5,
  kind = "berg" as IcebergKind,
} = {}) {
  const o = seed * 17.31;
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  const subRatio = kind === "shelf" ? 2.4 : kind === "spire" ? 4.2 : 5.2;

  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p as THREE.BufferAttribute, i);
    const y = v.y;
    const len = Math.hypot(v.x, v.z) || 1e-6;
    const hx = v.x / len;
    const hz = v.z / len;
    const az = Math.atan2(v.z, v.x);

    const outline = 1 + 0.48 * (fbm(hx * 1.6 + o, hz * 1.6 + o, 0) - 0.5);
    const facets = 0.74 + 0.26 * Math.abs(Math.sin(az * 7 + o * 0.65));

    let taper =
      kind === "shelf"
        ? 1 - 0.05 * Math.pow(Math.abs(y), 1.05)
        : kind === "spire"
          ? Math.max(0.2, 1 - 0.52 * Math.pow(Math.abs(y), 2.1))
          : Math.max(0.14, 1 - 0.32 * Math.pow(Math.abs(y), 2.8));

    let rad = radius * outline * facets * taper;
    rad *= 1 + 0.28 * (fbm(hx * 5 + o, hz * 5 + o, y * 1.5) - 0.5);

    const px = hx * rad;
    const pz = hz * rad;
    let yw;

    if (y >= 0) {
      yw = snowPeaks(hx, hz, px, pz, y, height, o, kind);
    } else {
      const depthFrac = Math.min(1, Math.abs(y));
      const wedge = 1 - 0.65 * Math.pow(depthFrac, 1.2);
      const groove = 1 + 0.1 * Math.sin(az * 16 + o * 2.3 + depthFrac * 11);
      rad *= wedge * groove;
      const ledge =
        Math.floor(depthFrac * 9 + fbm(hx * 6 + o, hz * 6 + o, 4.2) * 2.5) * 0.045;
      const px2 = hx * rad;
      const pz2 = hz * rad;
      yw =
        -depthFrac * height * subRatio * (0.9 + 0.22 * fbm(px2 * 0.25 + o, pz2 * 0.25 + o, 6.4)) -
        ledge * height * 0.35;
      p.setXYZ(i, px2, yw, pz2);
      continue;
    }
    p.setXYZ(i, px, yw, pz);
  }
  geo.computeVertexNormals();

  const n = geo.attributes.normal;
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  const maxSub = height * subRatio;

  for (let i = 0; i < p.count; i++) {
    const py = p.getY(i);
    const nx = (n as THREE.BufferAttribute).getX(i);
    const ny = (n as THREE.BufferAttribute).getY(i);
    const nz = (n as THREE.BufferAttribute).getZ(i);
    const up = Math.max(0, ny);

    if (py >= 0) {
      c.copy(COL_SIDE).lerp(COL_SNOW, Math.pow(up, 0.85 + (1 - up) * 0.35));
      if (up > 0.55) c.lerp(COL_SNOW, (up - 0.55) / 0.45);
    } else {
      const d = Math.min(1, -py / maxSub);
      if (d < 0.45) c.copy(COL_SHALLOW).lerp(COL_MID, d / 0.45);
      else c.copy(COL_MID).lerp(COL_DEEP, (d - 0.45) / 0.55);
      const ridge = Math.min(1, (Math.abs(nx) + Math.abs(nz)) * 0.85);
      c.lerp(COL_STREAK, ridge * 0.35 * (1 - d * 0.4));
    }
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return geo;
}

type IceMatProps = {
  selected?: boolean;
  highRisk?: boolean;
};

export function IceSurfaceMaterial({ selected, highRisk }: IceMatProps) {
  return (
    <meshPhysicalMaterial
      vertexColors
      roughness={0.32}
      metalness={0}
      clearcoat={0.5}
      clearcoatRoughness={0.28}
      flatShading
      clippingPlanes={[CLIP_ABOVE]}
      clipShadows
      emissive={selected ? "#0284c7" : highRisk ? "#38bdf8" : "#000000"}
      emissiveIntensity={selected ? 0.4 : highRisk ? 0.25 : 0}
    />
  );
}

export function IceSubmergedMaterial() {
  return (
    <meshPhysicalMaterial
      vertexColors
      roughness={0.28}
      metalness={0}
      clearcoat={0.55}
      clearcoatRoughness={0.22}
      flatShading
      transparent
      opacity={0.82}
      depthWrite={false}
      clippingPlanes={[CLIP_BELOW]}
      clipShadows
    />
  );
}

function IcebergWaterEffectsInner({ footprint }: { footprint: number }) {
  const rayRefs = useRef<THREE.Mesh[]>([]);
  const rays = [0, 1.05, -0.9];

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    rayRefs.current.forEach((m, i) => {
      const mat = m.material as THREE.MeshBasicMaterial;
      if (mat) mat.opacity = 0.04 + Math.sin(t * 0.7 + i) * 0.015;
    });
  });

  return (
    <group>
      <mesh position={[0, -footprint * 0.15, 0]}>
        <sphereGeometry args={[footprint * 1.05, 16, 12]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.06} depthWrite={false} />
      </mesh>
      {rays.map((off, i) => (
        <mesh
          key={i}
          ref={(el) => {
            if (el) rayRefs.current[i] = el;
          }}
          position={[off * footprint * 0.35, footprint * 0.55, off * footprint * 0.2]}
          rotation={[0, off * 0.4, 0]}
        >
          <coneGeometry args={[footprint * 0.22, footprint * 1.8, 8, 1, true]} />
          <meshBasicMaterial
            color="#a5f3fc"
            transparent
            opacity={0.04}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

function IcebergWaterEffects({ footprint, quality }: { footprint: number; quality: string }) {
  if (quality === "low" || footprint < 3.5 || footprint > 40) return null;
  return <IcebergWaterEffectsInner footprint={footprint} />;
}

export function IcebergFoamRing({ radius }: { radius: number }) {
  return (
    <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <torusGeometry args={[radius * 1.38, Math.max(0.08, radius * 0.04), 8, 40]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.42} depthWrite={false} />
    </mesh>
  );
}

type IceBodyProps = {
  geometry: THREE.BufferGeometry;
  scale: [number, number, number];
  rotation?: [number, number, number];
  quality: string;
  footprint: number;
  interactive?: boolean;
  selected?: boolean;
  highRisk?: boolean;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  onPointerOver?: (e: ThreeEvent<MouseEvent>) => void;
  onPointerOut?: () => void;
  showEffects?: boolean;
};

export function IcebergBodyLayers({
  geometry,
  scale,
  rotation = [0, 0, 0],
  quality,
  footprint,
  interactive,
  selected,
  highRisk,
  onClick,
  onPointerOver,
  onPointerOut,
  showEffects = true,
}: IceBodyProps) {
  const worldFoot = Math.max(scale[0], scale[2]) * footprint;

  return (
    <group scale={scale} rotation={rotation}>
      <mesh
        geometry={geometry}
        castShadow
        receiveShadow
        onClick={interactive ? onClick : undefined}
        onPointerOver={interactive ? onPointerOver : undefined}
        onPointerOut={interactive ? onPointerOut : undefined}
      >
        <IceSurfaceMaterial selected={selected} highRisk={highRisk} />
      </mesh>
      <mesh geometry={geometry} receiveShadow>
        <IceSubmergedMaterial />
      </mesh>
      {showEffects && <IcebergWaterEffects footprint={worldFoot} quality={quality} />}
      <IcebergFoamRing radius={footprint} />
    </group>
  );
}

export const SHARED_GEOMETRIES = {
  high: [] as { geo: THREE.BufferGeometry, class: string }[],
  low: [] as { geo: THREE.BufferGeometry, class: string }[]
};
if (typeof window !== "undefined") {
  for (const q of [3, 5]) {
    const list = q === 5 ? SHARED_GEOMETRIES.high : SHARED_GEOMETRIES.low;
    for (let v = 1; v <= 3; v++)
      list.push({
        geo: createIceberg({ radius: 1, height: 0.85, seed: v, detail: q, kind: "berg" }),
        class: "medium",
      });
    for (let v = 4; v <= 6; v++)
      list.push({
        geo: createIceberg({ radius: 1, height: 0.65, seed: v, detail: q, kind: "berg" }),
        class: "large",
      });
    for (let v = 7; v <= 8; v++)
      list.push({
        geo: createIceberg({ radius: 0.42, height: 2.2, seed: v, detail: q, kind: "spire" }),
        class: "spire",
      });
  }
}

export function IcebergMesh({ iceberg }: { iceberg: Iceberg }) {
  const bodyRef = useRef<THREE.Group>(null);
  const selected = usePolarisStore((s) => s.selectedIcebergId === iceberg.id);
  const select = usePolarisStore((s) => s.selectIceberg);
  const showPred = usePolarisStore((s) => s.layers.predictions);
  const [x, , z] = latLonToScene(iceberg.lat, iceberg.lon);

  const baseScale = Math.max(2.6, 2.0 + (iceberg.diameterNm || 1) * 1.5);
  const sizeClass =
    baseScale > 6 ? "large" : baseScale > 4.5 ? "medium" : "spire";
  const quality = usePolarisStore((s) => s.graphicsQuality || "high");

  const geo = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < iceberg.id.length; i++) hash += iceberg.id.charCodeAt(i);
    const list = quality === "low" ? SHARED_GEOMETRIES.low : SHARED_GEOMETRIES.high;
    const valid = list.filter((g) => g.class === sizeClass);
    return valid[hash % valid.length].geo;
  }, [iceberg.id, sizeClass, quality]);

  const meshScale = useMemo((): [number, number, number] => {
    if (sizeClass === "spire") {
      const r = baseScale * 0.52;
      return [r, baseScale * 1.35, r];
    }
    if (sizeClass === "large") {
      return [baseScale, baseScale * 0.72, baseScale];
    }
    return [baseScale, baseScale * 0.88, baseScale];
  }, [baseScale, sizeClass]);

  const pathPts = useMemo(() => {
    return iceberg.predictedPath.map((p) => {
      const [px, , pz] = latLonToScene(p.lat, p.lon);
      return new THREE.Vector3(px, 0.4, pz);
    });
  }, [iceberg.predictedPath]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + iceberg.lat * 10;
    if (bodyRef.current) {
      bodyRef.current.position.y = Math.sin(t * 0.8) * 0.06;
      bodyRef.current.rotation.z = Math.sin(t * 0.5) * 0.015;
    }
  });

  return (
    <group position={[x, 0, z]}>
      <group ref={bodyRef}>
        <IcebergBodyLayers
          geometry={geo}
          scale={meshScale}
          rotation={[0, (iceberg.headingDeg * Math.PI) / 180, 0]}
          quality={quality}
          footprint={1.38}
          interactive
          showEffects
          selected={selected}
          highRisk={iceberg.highRisk}
          onClick={(e) => {
            e.stopPropagation();
            select(iceberg.id);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            document.body.style.cursor = "auto";
          }}
        />
      </group>

      {/* Selected Target Ring */}
      {selected && (
        <mesh position={[0, 0.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[meshScale[0] * 1.5, meshScale[0] * 1.68, 32]} />
          <meshBasicMaterial color="#38bdf8" />
        </mesh>
      )}

      {/* Predicted Drift Trajectory */}
      {showPred && pathPts.length > 1 && (
        <line>
          <bufferGeometry attach="geometry">
            <bufferAttribute
              attach="attributes-position"
              array={
                new Float32Array(
                  pathPts.flatMap((p) => [p.x - x, p.y, p.z - z])
                )
              }
              count={pathPts.length}
              itemSize={3}
            />
          </bufferGeometry>
          <lineDashedMaterial
            color="#38bdf8"
            dashSize={0.8}
            gapSize={0.4}
            transparent
            opacity={0.85}
          />
        </line>
      )}

      {/* Floating Iceberg Label */}
      <Html position={[0, baseScale * 1.25, 0]} center distanceFactor={15}>
        <div className="px-2 py-1 bg-black/60 backdrop-blur-sm border border-white/20 rounded text-[10px] font-mono text-white/90 whitespace-nowrap shadow-lg">
          {iceberg.name}
        </div>
      </Html>
    </group>
  );
}

export function IcebergField() {
  const icebergs = usePolarisStore((s) => s.icebergs);
  const visible = usePolarisStore((s) => s.layers.icebergs);
  if (!visible) return null;
  return (
    <group>
      {icebergs.map((ib) => (
        <IcebergMesh key={ib.id} iceberg={ib} />
      ))}
    </group>
  );
}
