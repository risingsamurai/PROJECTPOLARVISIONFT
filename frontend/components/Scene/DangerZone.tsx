"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { haversineNm, latLonToScene } from "@/lib/geo";
import { usePolarisStore } from "@/lib/store";

export function DangerZone({
  lat,
  lon,
  radiusNm,
  highRisk,
}: {
  lat: number;
  lon: number;
  radiusNm: number;
  highRisk?: boolean;
}) {
  const [x, , z] = latLonToScene(lat, lon);
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ringRef.current) {
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      if (mat) mat.opacity = 0.45 + Math.sin(t * 2.0) * 0.15;
    }
  });

  const r = Math.max(3.0, radiusNm);
  const col = highRisk ? "#ef4444" : "#eab308";

  return (
    <group position={[x, 0.05, z]}>
      {/* Semi-transparent hazard disk on water */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[r, 48]} />
        <meshBasicMaterial color={col} transparent opacity={0.08} depthWrite={false} />
      </mesh>

      {/* Solid Outer Warning Ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r * 0.95, r, 48]} />
        <meshBasicMaterial color={col} transparent opacity={0.6} depthWrite={false} />
      </mesh>

      {/* Inner Pulsing Warning Ring */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r * 0.85, r * 0.88, 48]} />
        <meshBasicMaterial color={col} transparent opacity={0.4} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function DangerZones() {
  // Danger rings are now rendered directly inside IcebergMesh to prevent duplicate geometry
  return null;
}
