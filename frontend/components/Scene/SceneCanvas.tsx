"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { latLonToScene } from "@/lib/geo";
import { usePolarisStore } from "@/lib/store";
import { DangerZones } from "./DangerZone";
import { IcebergField } from "./Iceberg";
import { Ocean } from "./Ocean";
import { RouteLine } from "./RouteLine";
import { Vessel } from "./Vessel";
import { AntarcticLandmass } from "./AntarcticLandmass";

function PanoramaEnvironment() {
  const { scene, gl } = useThree();
  const quality = usePolarisStore((s) => s.graphicsQuality || "high");

  useEffect(() => {
    let active = true;
    const loader = new RGBELoader();
    
    loader.load(
      "/hdri/antarctic_pano.hdr",
      (hdrTexture) => {
        if (!active) return;
        hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
        hdrTexture.encoding = THREE.sRGBEncoding;

        const pmremGenerator = new THREE.PMREMGenerator(gl);
        pmremGenerator.compileEquirectangularShader();
        const envMap = pmremGenerator.fromEquirectangular(hdrTexture);

        scene.environment = envMap.texture;
        scene.background = hdrTexture;

        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.85;
        gl.shadowMap.enabled = quality === "high";

        pmremGenerator.dispose();
      },
      undefined,
      (err) => {
        console.warn("Could not load HDR panorama, falling back to polar gradient sky:", err);
      }
    );

    return () => {
      active = false;
    };
  }, [scene, gl, quality]);

  return null;
}

function ChaseCamera() {
  const { camera, gl } = useThree();
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const el = gl.domElement;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 2) return;
      dragging.current = true;
      last.current = { x: e.clientX, y: e.clientY };
      usePolarisStore.getState().setCameraOrbiting(true);
    };
    const onUp = () => {
      dragging.current = false;
      usePolarisStore.getState().setCameraOrbiting(false);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      last.current = { x: e.clientX, y: e.clientY };
      const s = usePolarisStore.getState();
      s.setOrbit(
        s.orbitYaw - dx * 0.006,
        THREE.MathUtils.clamp(s.orbitPitch + dy * 0.005, 0.08, 1.15)
      );
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = usePolarisStore.getState();
      const d = THREE.MathUtils.clamp(
        s.cameraDistance + e.deltaY * 0.035,
        14,
        90
      );
      s.setOrbit(s.orbitYaw, s.orbitPitch, d);
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointermove", onMove);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointermove", onMove);
      el.removeEventListener("wheel", onWheel);
    };
  }, [gl]);

  useFrame(() => {
    const {
      vessel,
      orbitYaw,
      orbitPitch,
      cameraDistance,
      selectedIcebergId,
      icebergs,
      cameraTargetCoord,
    } = usePolarisStore.getState();

    let targetPosition = { lat: vessel.lat, lon: vessel.lon };
    if (cameraTargetCoord) {
      targetPosition = { lat: cameraTargetCoord[0], lon: cameraTargetCoord[1] };
    } else if (selectedIcebergId) {
      const selectedIceberg = icebergs.find((ib) => ib.id === selectedIcebergId);
      if (selectedIceberg) {
        targetPosition = { lat: selectedIceberg.lat, lon: selectedIceberg.lon };
      }
    }
    
    const [x, , z] = latLonToScene(targetPosition.lat, targetPosition.lon);

    const vesselHeadingRad = THREE.MathUtils.degToRad(vessel.headingDeg);
    const totalYaw = vesselHeadingRad + orbitYaw;

    const forwardX = Math.sin(totalYaw);
    const forwardZ = -Math.cos(totalYaw);

    const horizontalDist = cameraDistance * Math.cos(orbitPitch);
    const cx = x - forwardX * horizontalDist;
    const cz = z - forwardZ * horizontalDist;
    const cy = 3.8 + Math.sin(orbitPitch) * cameraDistance;

    const targetPos = new THREE.Vector3(cx, cy, cz);
    const distToTarget = camera.position.distanceTo(targetPos);
    if (distToTarget > 120) {
      camera.position.copy(targetPos);
    } else {
      camera.position.lerp(targetPos, 0.1);
    }

    const lookTarget = new THREE.Vector3(
      x + forwardX * 6,
      1.8,
      z + forwardZ * 6
    );
    camera.lookAt(lookTarget);
  });

  return null;
}

function IceFloeOverlays() {
  const on = usePolarisStore((s) => s.layers.seaIce);
  const day = usePolarisStore((s) => s.forecastDay);
  if (!on) return null;

  const count = 16 + day * 4;
  const floes = [
    { x: -12, z: -18, scale: 6.2, rot: 0.4 },
    { x: 18, z: -32, scale: 9.5, rot: 1.1 },
    { x: 34, z: 12, scale: 7.8, rot: 2.3 },
    { x: -45, z: 28, scale: 12.0, rot: 0.8 },
    { x: 52, z: -48, scale: 8.4, rot: 1.7 },
    { x: -28, z: -55, scale: 11.2, rot: 2.9 },
    { x: 68, z: 35, scale: 7.0, rot: 0.2 },
    { x: -62, z: -15, scale: 14.5, rot: 1.4 },
    { x: 15, z: 62, scale: 8.8, rot: 2.1 },
    { x: -75, z: 45, scale: 10.5, rot: 0.6 },
    { x: 82, z: -22, scale: 13.0, rot: 1.9 },
    { x: -38, z: 78, scale: 9.2, rot: 2.7 },
    { x: 42, z: 85, scale: 11.8, rot: 0.5 },
    { x: -88, z: -68, scale: 15.0, rot: 1.3 },
    { x: 95, z: 52, scale: 8.1, rot: 2.4 },
    { x: -55, z: -92, scale: 13.4, rot: 0.9 },
  ];

  return (
    <group position={[0, 0.04, 0]}>
      {floes.slice(0, Math.min(count, floes.length)).map((f, i) => (
        <mesh
          key={i}
          position={[f.x, 0, f.z]}
          rotation={[-Math.PI / 2, 0, f.rot]}
        >
          <cylinderGeometry args={[f.scale, f.scale * 1.05, 0.22, 32]} />
          <meshStandardMaterial
            color="#f8fafc"
            roughness={0.8}
            metalness={0.05}
            transparent
            opacity={0.9}
          />
        </mesh>
      ))}
    </group>
  );
}

function DistantIslandsAndIceShelf() {
  return (
    <group>
      {/* Distant Dark Rock Islands */}
      <mesh position={[-380, 8, -450]} rotation={[0, 0.4, 0]}>
        <coneGeometry args={[45, 38, 6]} />
        <meshStandardMaterial color="#1e293b" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[-290, 6, -490]} rotation={[0, 0.9, 0]}>
        <coneGeometry args={[32, 28, 5]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[420, 10, -520]} rotation={[0, -0.6, 0]}>
        <coneGeometry args={[55, 42, 7]} />
        <meshStandardMaterial color="#1e293b" roughness={0.88} flatShading />
      </mesh>

      {/* Distant Low Ice Shelf on Horizon */}
      <mesh position={[0, 3, -650]}>
        <boxGeometry args={[1400, 14, 60]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.75} metalness={0.04} />
      </mesh>
    </group>
  );
}

export function SceneCanvas() {
  return (
    <Canvas
      camera={{ position: [0, 16, 32], fov: 52, near: 0.1, far: 3000 }}
      dpr={typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio) : 1}
      tabIndex={0}
      onPointerMissed={() => usePolarisStore.getState().selectIceberg(null)}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      style={{ width: "100%", height: "100%", background: "#1e293b" }}
      onCreated={({ scene, gl }) => {
        scene.fog = new THREE.FogExp2(0x3b4b5e, 0.0009);
        gl.setClearColor(0x3b4b5e);
      }}
    >
      <PanoramaEnvironment />
      <ambientLight intensity={0.55} color="#dbeafe" />
      <directionalLight
        position={[140, 18, -120]}
        intensity={2.1}
        castShadow
        color="#ffedd5"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={800}
        shadow-camera-left={-160}
        shadow-camera-right={160}
        shadow-camera-top={160}
        shadow-camera-bottom={-160}
        shadow-bias={-0.0003}
      />
      <hemisphereLight args={["#bae6fd", "#0f172a", 0.72]} />

      <ChaseCamera />
      <Ocean />
      <AntarcticLandmass />
      <DistantIslandsAndIceShelf />
      <IceFloeOverlays />
      <Vessel />
      <IcebergField />
      <DangerZones />
      <RouteLine />
    </Canvas>
  );
}
