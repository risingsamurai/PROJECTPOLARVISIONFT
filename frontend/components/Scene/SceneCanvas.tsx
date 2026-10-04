"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
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
import { DestinationBeacon } from "./DestinationBeacon";

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
      cameraTargetCoord,
    } = usePolarisStore.getState();

    // Camera targets the vessel (or cameraTargetCoord if waypoint focused), NEVER dragged to distant icebergs
    let targetPosition = { lat: vessel.lat, lon: vessel.lon };
    if (cameraTargetCoord) {
      targetPosition = { lat: cameraTargetCoord[0], lon: cameraTargetCoord[1] };
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

export function SceneCanvas() {
  return (
    <Canvas
      camera={{ position: [0, 16, 32], fov: 52, near: 0.1, far: 3000 }}
      dpr={typeof window !== "undefined" ? Math.min(1.5, window.devicePixelRatio) : 1}
      tabIndex={0}
      onPointerMissed={() => usePolarisStore.getState().selectIceberg(null)}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      style={{ width: "100%", height: "100%", background: "#1e293b" }}
      onCreated={({ scene, gl }) => {
        scene.fog = new THREE.FogExp2(0x3b4b5e, 0.0009);
        gl.setClearColor(0x3b4b5e);
        gl.localClippingEnabled = true;
      }}
    >
      <PanoramaEnvironment />
      <ambientLight intensity={0.55} color="#dbeafe" />
      <directionalLight
        position={[140, 18, -120]}
        intensity={2.1}
        castShadow
        color="#ffedd5"
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
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
      <Vessel />
      <DestinationBeacon />
      <IcebergField />
      <DangerZones />
      <RouteLine />
    </Canvas>
  );
}
