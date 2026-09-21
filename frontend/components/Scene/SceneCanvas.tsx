"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { latLonToScene } from "@/lib/geo";
import { usePolarisStore } from "@/lib/store";
import { DangerZones } from "./DangerZone";
import { IcebergField } from "./Iceberg";
import { Ocean } from "./Ocean";
import { RouteLine } from "./RouteLine";
import { Vessel } from "./Vessel";
import { AntarcticLandmass } from "./AntarcticLandmass";

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
    const { vessel, orbitYaw, orbitPitch, cameraDistance, selectedIcebergId, icebergs } =
      usePolarisStore.getState();
    
    // Check if an iceberg is selected for camera targeting
    let targetPosition = { lat: vessel.lat, lon: vessel.lon };
    if (selectedIcebergId) {
      const selectedIceberg = icebergs.find(ib => ib.id === selectedIcebergId);
      if (selectedIceberg) {
        targetPosition = { lat: selectedIceberg.lat, lon: selectedIceberg.lon };
      }
    }
    
    const [x, , z] = latLonToScene(targetPosition.lat, targetPosition.lon);

    // Navigational heading: 0° is North (-Z), 90° is East (+X)
    const vesselHeadingRad = THREE.MathUtils.degToRad(vessel.headingDeg);
    const totalYaw = vesselHeadingRad + orbitYaw;

    // Camera placed behind and above vessel
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

    // Look slightly ahead of the vessel at deck level
    const lookTarget = new THREE.Vector3(
      x + forwardX * 6,
      1.8,
      z + forwardZ * 6
    );
    camera.lookAt(lookTarget);
  });

  return null;
}

function IceHeatPatch() {
  const on = usePolarisStore((s) => s.layers.seaIce);
  const day = usePolarisStore((s) => s.forecastDay);
  if (!on) return null;
  const radius = 26 + day * 3.5;
  const opacity = 0.14 + day * 0.03;
  const color = day >= 6 ? "#ffffff" : day >= 4 ? "#93c5fd" : "#38bdf8";
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[18, 0.05, -12]}>
      <circleGeometry args={[radius, 64]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} />
    </mesh>
  );
}

export function SceneCanvas() {
  return (
    <Canvas
      camera={{ position: [0, 16, 32], fov: 52, near: 0.1, far: 3000 }}
      tabIndex={0}
      onPointerMissed={() => usePolarisStore.getState().selectIceberg(null)}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      style={{ width: "100%", height: "100%", background: "#5a6878" }}
      onCreated={({ scene, gl }) => {
        scene.fog = new THREE.Fog(0x5a6878, 80, 2000);
        gl.setClearColor(0x5a6878);
      }}
    >
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[80, 120, 30]}
        intensity={1.2}
        castShadow
        color="#f0f9ff"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={500}
        shadow-camera-left={-100}
        shadow-camera-right={100}
        shadow-camera-top={100}
        shadow-camera-bottom={-100}
      />
      <hemisphereLight args={["#e0f2fe", "#1e3a8a", 0.6]} />
      
      {/* Sun Glow */}
      <mesh position={[80, 120, 30]}>
        <sphereGeometry args={[8, 32, 32]} />
        <meshBasicMaterial color="#fef3c7" transparent opacity={0.3} />
      </mesh>
      <mesh position={[80, 120, 30]}>
        <sphereGeometry args={[12, 32, 32]} />
        <meshBasicMaterial color="#fde68a" transparent opacity={0.15} />
      </mesh>
      <ChaseCamera />
      <Ocean />
      <AntarcticLandmass />
      <IceHeatPatch />
      <Vessel />
      <IcebergField />
      <DangerZones />
      <RouteLine />
    </Canvas>
  );
}
