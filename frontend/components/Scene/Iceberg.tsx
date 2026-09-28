"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { Iceberg } from "@/lib/mockData";
import { latLonToScene } from "@/lib/geo";
import { usePolarisStore } from "@/lib/store";

// Procedural solid, closed, chunky low-poly iceberg geometry
function createIcebergGeometry(id: string, scale: number) {
  // Stable integer seed derived from iceberg ID string
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const seed = Math.abs(hash);

  // Closed low-poly Icosahedron (detail 1: 80 triangles, clean faceted volume)
  const geo = new THREE.IcosahedronGeometry(scale, 1);
  const pos = geo.attributes.position;

  const pseudoRng = (n: number) => {
    const v = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453123;
    return v - Math.floor(v);
  };

  // Displace vertices non-uniformly into a solid, wide, blocky iceberg formation
  for (let i = 0; i < pos.count; i++) {
    let px = pos.getX(i);
    let py = pos.getY(i);
    let pz = pos.getZ(i);

    // Non-uniform aspect ratio: wider than tall (scale X and Z by 1.25)
    px *= 1.25;
    pz *= 1.25;

    // Stable radial noise variation
    const noise = (pseudoRng(i) - 0.5) * 0.45;
    const radial = 1.0 + noise;

    // Distribute bulk volume above waterline as a blocky chunk with a stable base
    if (py > 0) {
      py = py * 0.95 + pseudoRng(i + 4) * scale * 0.35;
    } else {
      py = py * 0.5; // Flattened submerged base
    }

    pos.setXYZ(i, px * radial, py, pz * radial);
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
  const baseScale = Math.max(2.4, 1.8 + (iceberg.diameterNm || 1) * 1.4);

  const geo = useMemo(
    () => createIcebergGeometry(iceberg.id, baseScale),
    [iceberg.id, baseScale]
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
      const t = clock.getElapsedTime() + (iceberg.lat * 10);
      meshRef.current.position.y = baseScale * 0.35 + Math.sin(t * 0.8) * 0.08;
      meshRef.current.rotation.z = Math.sin(t * 0.5) * 0.015;
    }
  });

  return (
    <group position={[x, 0, z]}>
      {/* 3D Solid Closed Iceberg */}
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
          color={selected ? "#bae6fd" : "#f1f5f9"}
          roughness={0.8}
          metalness={0.04}
          flatShading
          emissive={selected ? "#0284c7" : iceberg.highRisk ? "#38bdf8" : "#0f172a"}
          emissiveIntensity={selected ? 0.3 : iceberg.highRisk ? 0.1 : 0.02}
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

