"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, extend } from "@react-three/fiber";
import * as THREE from "three";
import { Water } from "three/examples/jsm/objects/Water.js";
import { usePolarisStore } from "@/lib/store";

extend({ Water });

declare global {
  namespace JSX {
    interface IntrinsicElements {
      water: any;
    }
  }
}

// Prominent rolling Arctic ocean swell configuration:
const WAVES = [
  { dirX: 0.82, dirY: 0.57, steepness: 0.110, wavelength: 28.0, speed: 1.05 },
  { dirX: -0.68, dirY: 0.73, steepness: 0.085, wavelength: 14.0, speed: 1.35 },
  { dirX: 0.38, dirY: -0.92, steepness: 0.060, wavelength: 6.5, speed: 1.80 },
  { dirX: -0.90, dirY: -0.43, steepness: 0.035, wavelength: 2.2, speed: 2.60 },
] as const;

export function getWaveHeightAt(x: number, z: number, time: number): number {
  const localX = x;
  const localY = -z;
  let totalHeight = 0;

  for (let i = 0; i < WAVES.length; i++) {
    const w = WAVES[i];
    const k = 6.2831853 / w.wavelength;
    const c = Math.sqrt(9.8 / k) * w.speed;
    const len = Math.hypot(w.dirX, w.dirY);
    const dx = w.dirX / len;
    const dy = w.dirY / len;
    const f = k * (dx * localX + dy * localY - c * time);
    const a = w.steepness / k;
    totalHeight += a * Math.sin(f);
  }

  return totalHeight;
}

export function Ocean() {
  const ref = useRef<any>(null);
  const quality = usePolarisStore((s) => s.graphicsQuality || "high");

  const [geom, waterNormals] = useMemo(() => {
    // 120,000 unit radius infinite ocean plane
    const g = new THREE.PlaneGeometry(120000, 120000, 64, 64);
    const loader = new THREE.TextureLoader();
    const norm = loader.load("/textures/waternormals.jpg", (texture) => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    });
    return [g, norm];
  }, []);

  const config = useMemo(
    () => ({
      textureWidth: quality === "high" ? 512 : 256,
      textureHeight: quality === "high" ? 512 : 256,
      waterNormals,
      sunDirection: new THREE.Vector3(140, 18, -120).normalize(),
      sunColor: 0x8899aa, // Dimmer sun to avoid flat white reflection
      waterColor: 0x031522, // Deeper navy polar sea
      distortionScale: 3.7,
      alpha: 0.82, // Enable translucency for submerged objects
      fog: true,
    }),
    [waterNormals, quality]
  );

  useFrame(({ camera }, dt) => {
    if (ref.current) {
      if (ref.current.material?.uniforms?.time) {
        ref.current.material.uniforms.time.value += dt * 0.8;
      }
      // Snap x and z to wave wavelength (28.0) so waves do not swim when camera moves
      const snapStep = 28.0;
      ref.current.position.x = Math.floor(camera.position.x / snapStep) * snapStep;
      ref.current.position.z = Math.floor(camera.position.z / snapStep) * snapStep;
    }
  });

  return (
    <water
      ref={ref}
      args={[geom, config]}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.2, 0]}
    />
  );
}
