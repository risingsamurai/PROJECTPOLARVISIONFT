"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { Iceberg } from "@/lib/mockData";
import { latLonToScene } from "@/lib/geo";
import { usePolarisStore } from "@/lib/store";

// Procedural multi-faceted low-poly iceberg geometry
function createIcebergGeometry(seed: number, sizeClass: string, scale: number) {
  // Tabular or Pinnacle iceberg based on seed
  const isTabular = (seed % 2) === 0;
  let geo: THREE.BufferGeometry;

  if (isTabular) {
    geo = new THREE.CylinderGeometry(scale * 1.2, scale * 1.5, scale * 1.2, 7, 2);
  } else {
    geo = new THREE.DodecahedronGeometry(scale * 1.4, 1);
  }

  const pos = geo.attributes.position;
  const rng = (n: number) => {
    const x = Math.sin(seed * 78.233 + n * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };

  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);

    const noise = (rng(i) - 0.5) * 0.55;
    const heightFactor = py > 0 ? 1.0 + rng(i + 2) * 0.4 : 0.8;

    pos.setXYZ(
      i,
      px * (1 + noise * 0.45),
      py * heightFactor + noise * scale * 0.3,
      pz * (1 + noise * 0.45)
    );
  }

  geo.computeVertexNormals();
  return geo;
}

export function IcebergMesh({ iceberg }: { iceberg: Iceberg }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const selected = usePolarisStore((s) => s.selectedIcebergId === iceberg.id);
  const select = usePolarisStore((s) => s.selectIceberg);
  const showPred = usePolarisStore((s) => s.layers.predictions);
  const [x, , z] = latLonToScene(iceberg.lat, iceberg.lon);

  // Scaled for high visibility in scene, proportional to real size_nm
  const baseScale = Math.max(2.2, 1.8 + iceberg.diameterNm * 1.4);
  const seed = Math.abs(iceberg.lat * 100 + iceberg.lon * 10);

  const geo = useMemo(
    () => createIcebergGeometry(seed, iceberg.sizeClass, baseScale),
    [seed, iceberg.sizeClass, baseScale]
  );

  const pathPts = useMemo(() => {
    return iceberg.predictedPath.map((p) => {
      const [px, , pz] = latLonToScene(p.lat, p.lon);
      return new THREE.Vector3(px, 0.4, pz);
    });
  }, [iceberg.predictedPath]);

  useFrame(({ clock }) => {
    if (meshRef.current) {
      // Gentle ocean bobbing for icebergs
      const t = clock.getElapsedTime() + seed;
      meshRef.current.position.y = baseScale * 0.35 + Math.sin(t * 0.8) * 0.08;
      meshRef.current.rotation.z = Math.sin(t * 0.5) * 0.015;
    }
  });

  return (
    <group position={[x, 0, z]}>
      {/* 3D Iceberg Solid */}
      <mesh
        ref={meshRef}
        geometry={geo}
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
        <meshStandardMaterial
          color={selected ? "#bae6fd" : "#e0f7fa"}
          roughness={0.15}
          metalness={0.1}
          flatShading
          emissive={selected ? "#0284c7" : iceberg.highRisk ? "#38bdf8" : "#64748b"}
          emissiveIntensity={selected ? 0.3 : iceberg.highRisk ? 0.12 : 0.04}
          transparent
          opacity={0.95}
        />
      </mesh>

      {/* Underwater Ice Mass Tint / Halo */}
      <mesh position={[0, -0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[baseScale * 1.35, 16]} />
        <meshBasicMaterial color="#0ea5e9" transparent opacity={0.22} />
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
      <Html position={[0, baseScale * 1.2, 0]} center distanceFactor={15}>
        <div className="px-2 py-1 bg-black/60 backdrop-blur-sm border border-white/20 rounded text-[10px] font-mono text-white/90 whitespace-nowrap">
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

