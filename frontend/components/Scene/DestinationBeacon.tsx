"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { latLonToScene } from "@/lib/geo";
import { usePolarisStore } from "@/lib/store";

export function DestinationBeacon() {
  const destination = usePolarisStore((s) => s.destination);
  const ringRef = useRef<THREE.Mesh>(null);
  const beaconColRef = useRef<THREE.Mesh>(null);

  const [x, , z] = latLonToScene(destination.lat, destination.lon);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ringRef.current) {
      const scale = 1.0 + Math.sin(t * 3) * 0.1;
      ringRef.current.scale.set(scale, scale, 1);
    }
    if (beaconColRef.current) {
      const mat = beaconColRef.current.material as THREE.MeshBasicMaterial;
      if (mat) mat.opacity = 0.35 + Math.sin(t * 2) * 0.15;
    }
  });

  return (
    <group position={[x, 0, z]}>
      {/* Luminous vertical destination beam */}
      <mesh ref={beaconColRef} position={[0, 18, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 36, 16]} />
        <meshBasicMaterial
          color="#06b6d4"
          transparent
          opacity={0.45}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Outer pulsing ground ring */}
      <mesh ref={ringRef} position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[4.5, 5.0, 32]} />
        <meshBasicMaterial
          color="#06b6d4"
          transparent
          opacity={0.8}
          depthWrite={false}
        />
      </mesh>

      {/* Destination marker base circle */}
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.5, 32]} />
        <meshBasicMaterial
          color="#22d3ee"
          transparent
          opacity={0.25}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
