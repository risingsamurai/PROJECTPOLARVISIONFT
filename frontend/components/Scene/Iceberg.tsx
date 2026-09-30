"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
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

function createIcebergGeo({ radius = 1, height = 0.8, seed = 1 } = {}) {
  const o = seed * 17.31;
  const geo = new THREE.IcosahedronGeometry(1, 5);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();

  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p as THREE.BufferAttribute, i);
    const y = v.y;
    const len = Math.hypot(v.x, v.z) || 1e-6;
    const hx = v.x / len, hz = v.z / len;

    const outline = 1 + 0.45 * (fbm(hx * 1.6 + o, hz * 1.6 + o, 0) - 0.5);
    let rad = radius * outline * Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(y), 10)));
    rad *= 1 + 0.22 * (fbm(hx * 5 + o, hz * 5 + o, y * 1.5) - 0.5);

    const px = hx * rad, pz = hz * rad;
    let yw;
    if (y >= 0) {
      const ridge = 1 - Math.abs(2 * fbm(px * 0.22 + o, pz * 0.22 + o, 3.3, 5) - 1);
      const peaks = Math.pow(ridge, 2.5) * 1.5 * (0.35 + 0.65 * (1 - Math.min(1, rad / radius)));
      const ledge = Math.floor(y * 4) * 0.04;
      yw = y * height * (0.35 + peaks) + ledge * height;
    } else {
      yw = y * height * 3.2 * (0.75 + 0.5 * fbm(px * 0.3 + o, pz * 0.3 + o, 7.1));
    }
    p.setXYZ(i, px, yw, pz);
  }
  geo.computeVertexNormals();

  const n = geo.attributes.normal;
  const col = new Float32Array(p.count * 3);
  const snow = new THREE.Color("#f2f8ff"), ice = new THREE.Color("#7fa6c9"), deep = new THREE.Color("#3f86a8"), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const up = Math.max(0, (n as THREE.BufferAttribute).getY(i));
    c.copy(ice).lerp(snow, Math.pow(up, 1.5));
    if (p.getY(i) < 0) c.lerp(deep, Math.min(1, -p.getY(i) / (height * 1.5)));
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return geo;
}

const SHARED_GEOMETRIES: THREE.BufferGeometry[] = [];
if (typeof window !== "undefined") {
  for (let variant = 1; variant <= 6; variant++) {
    SHARED_GEOMETRIES.push(createIcebergGeo({ radius: 1, height: 0.8, seed: variant }));
  }
}

export function IcebergMesh({ iceberg }: { iceberg: Iceberg }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const selected = usePolarisStore((s) => s.selectedIcebergId === iceberg.id);
  const select = usePolarisStore((s) => s.selectIceberg);
  const showPred = usePolarisStore((s) => s.layers.predictions);
  const [x, , z] = latLonToScene(iceberg.lat, iceberg.lon);

  const baseScale = Math.max(2.6, 2.0 + (iceberg.diameterNm || 1) * 1.5);

  const geoIndex = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < iceberg.id.length; i++) hash += iceberg.id.charCodeAt(i);
    return hash % 6;
  }, [iceberg.id]);

  const geo = SHARED_GEOMETRIES[geoIndex];

  const pathPts = useMemo(() => {
    return iceberg.predictedPath.map((p) => {
      const [px, , pz] = latLonToScene(p.lat, p.lon);
      return new THREE.Vector3(px, 0.4, pz);
    });
  }, [iceberg.predictedPath]);

  useFrame(({ clock }) => {
    if (meshRef.current) {
      const t = clock.getElapsedTime() + (iceberg.lat * 10);
      meshRef.current.position.y = baseScale * 0.35 + Math.sin(t * 0.8) * 0.08;
      meshRef.current.rotation.z = Math.sin(t * 0.5) * 0.015;
    }
  });

  return (
    <group position={[x, 0, z]}>
      {/* High-Detail Physical Iceberg Mesh */}
      <mesh
        ref={meshRef}
        geometry={geo}
        scale={[baseScale, baseScale, baseScale]}
        position={[0, baseScale * 0.35, 0]}
        rotation={[0, (iceberg.headingDeg * Math.PI) / 180, 0]}
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
        castShadow
        receiveShadow
      >
        <meshPhysicalMaterial
          vertexColors={true}
          roughness={0.38}
          metalness={0}
          clearcoat={0.6}
          clearcoatRoughness={0.3}
          flatShading
          emissive={selected ? "#0284c7" : iceberg.highRisk ? "#38bdf8" : "#000000"}
          emissiveIntensity={selected ? 0.4 : iceberg.highRisk ? 0.25 : 0}
        />
      </mesh>

      {/* Soft Foam Ring at Waterline */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[baseScale * 1.4, 0.3, 8, 32]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.35} />
      </mesh>

      {/* Selected Target Ring */}
      {selected && (
        <mesh position={[0, 0.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[baseScale * 1.5, baseScale * 1.68, 32]} />
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
