"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { latLonToScene } from "@/lib/geo";
import { usePolarisStore } from "@/lib/store";
import type { RouteOption } from "@/lib/mockData";

const PROFILE_COLORS: Record<string, { main: string; bead: string; glow: string }> = {
  safest: { main: "#0E7A3F", bead: "#0E7A3F", glow: "#0E7A3F" },
  balanced: { main: "#eab308", bead: "#fde047", glow: "#f59e0b" },
  fastest: { main: "#9E1B1B", bead: "#9E1B1B", glow: "#9E1B1B" },
};

function SingleRouteLine({
  route,
  isSelected,
}: {
  route: RouteOption;
  isSelected: boolean;
}) {
  const pointsRef = useRef<THREE.Points>(null);

  const colors = PROFILE_COLORS[route.id] || PROFILE_COLORS.balanced;

  const { positions, linePositions } = useMemo(() => {
    if (!route?.points || route.points.length < 2) {
      return {
        positions: new Float32Array(0),
        linePositions: new Float32Array(0),
      };
    }

    const pts: THREE.Vector3[] = route.points.map((p: { lat: number; lon: number }) => {
      const [px, , pz] = latLonToScene(p.lat, p.lon);
      return new THREE.Vector3(px, 0.45, pz);
    });

    // Generate smooth curve through waypoints
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.5);
    const sampleCount = isSelected ? 120 : 60;
    const sampled = curve.getPoints(sampleCount);

    // Enforce exact bitwise match for line endpoints
    if (sampled.length > 0 && pts.length > 0) {
      sampled[0].copy(pts[0]);
      sampled[sampled.length - 1].copy(pts[pts.length - 1]);
    }

    const lines: number[] = [];
    const beads: number[] = [];

    sampled.forEach((p, i) => {
      lines.push(p.x, p.y, p.z);
      if (isSelected && i % 2 === 0) {
        beads.push(p.x, p.y + 0.08, p.z);
      }
    });

    return {
      positions: new Float32Array(beads),
      linePositions: new Float32Array(lines),
    };
  }, [route, isSelected]);

  useFrame(({ clock }) => {
    if (isSelected && pointsRef.current) {
      const mat = pointsRef.current.material as THREE.PointsMaterial;
      if (mat) {
        mat.size = 1.2 + Math.sin(clock.getElapsedTime() * 3.0) * 0.25;
      }
    }
  });

  if (linePositions.length < 6) return null;

  return (
    <group>
      {/* Route Line Ribbon */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            array={linePositions}
            count={linePositions.length / 3}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial
          color={colors.main}
          transparent
          opacity={route.id !== "balanced" ? 0.9 : (isSelected ? 0.95 : 0.28)}
          linewidth={route.id !== "balanced" ? 3 : (isSelected ? 3 : 1)}
          toneMapped={route.id !== "balanced" ? false : undefined}
        />
      </line>

      {/* Selected Route Animated Beads */}
      {isSelected && positions.length > 0 && (
        <points ref={pointsRef}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              array={positions}
              count={positions.length / 3}
              itemSize={3}
            />
          </bufferGeometry>
          <pointsMaterial
            color={colors.bead}
            size={1.5}
            transparent
            opacity={0.95}
            sizeAttenuation
          />
        </points>
      )}

      {/* Waypoint markers along selected route */}
      {isSelected &&
        route.points.map((pt: { lat: number; lon: number }, i: number) => {
          const [px, , pz] = latLonToScene(pt.lat, pt.lon);
          return (
            <group key={i} position={[px, 0.5, pz]}>
              <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.5, 0.8, 16]} />
                <meshBasicMaterial color={colors.main} transparent opacity={0.4} />
              </mesh>
              <mesh position={[0, 0.15, 0]}>
                <sphereGeometry args={[0.2, 8, 8]} />
                <meshBasicMaterial color={colors.bead} />
              </mesh>
            </group>
          );
        })}
    </group>
  );
}

export function RouteLine() {
  const visible = usePolarisStore((s) => s.layers.route);
  const routes = usePolarisStore((s) => s.routes);
  const lockedRouteId = usePolarisStore((s) => s.lockedRouteId);
  const destination = usePolarisStore((s) => s.destination);
  const beaconRef = useRef<THREE.Group>(null);

  const activeRoute = routes.find((r) => r.id === lockedRouteId) || routes[0];
  const lastPoint = activeRoute?.points?.[activeRoute.points.length - 1];
  const targetDestLat = lastPoint ? lastPoint.lat : destination.lat;
  const targetDestLon = lastPoint ? lastPoint.lon : destination.lon;

  const destScenePos = useMemo(() => {
    const [dx, , dz] = latLonToScene(targetDestLat, targetDestLon);
    return [dx, 0.45, dz] as [number, number, number];
  }, [targetDestLat, targetDestLon]);

  useFrame(({ clock }) => {
    if (beaconRef.current) {
      const t = clock.getElapsedTime();
      beaconRef.current.rotation.y = t * 1.2;
      beaconRef.current.position.y = 0.45 + Math.sin(t * 2.0) * 0.2;
    }
  });

  if (!visible || !routes || routes.length === 0) return null;

  return (
    <group>
      {/* Render all three routes simultaneously in 3D: Safest, Balanced, Fastest */}
      {routes.map((r) => (
        <SingleRouteLine
          key={r.id}
          route={r}
          isSelected={r.id === lockedRouteId}
        />
      ))}

      {/* 3D Destination Target Beacon Marker (aligned exactly with route endpoint) */}
      <group position={destScenePos}>
        {/* Flat pulsing destination rings */}
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[2.0, 2.6, 32]} />
          <meshBasicMaterial color="#10b981" transparent opacity={0.65} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[3.2, 3.6, 32]} />
          <meshBasicMaterial color="#34d399" transparent opacity={0.35} />
        </mesh>

        {/* Vertical light pillar */}
        <mesh position={[0, 3.5, 0]}>
          <cylinderGeometry args={[0.15, 0.25, 7.0, 16]} />
          <meshBasicMaterial color="#34d399" transparent opacity={0.65} />
        </mesh>

        {/* Floating animated target diamond pin */}
        <group ref={beaconRef} position={[0, 6.0, 0]}>
          <mesh rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[1.2, 1.2, 0.2]} />
            <meshStandardMaterial
              color="#10b981"
              emissive="#34d399"
              emissiveIntensity={0.8}
            />
          </mesh>
        </group>

        {/* Clear 3D Destination Billboard Sprite */}
        <DestinationBillboard lat={targetDestLat} lon={targetDestLon} />
      </group>
    </group>
  );
}

function DestinationBillboard({ lat, lon }: { lat: number; lon: number }) {
  const texture = useMemo(() => {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      // High-contrast background pill
      ctx.fillStyle = "#022c22";
      ctx.strokeStyle = "#34d399";
      ctx.lineWidth = 6;
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(8, 8, 496, 112, 28);
      } else {
        ctx.rect(8, 8, 496, 112);
      }
      ctx.fill();
      ctx.stroke();

      // Glowing dot
      ctx.fillStyle = "#10b981";
      ctx.beginPath();
      ctx.arc(48, 64, 16, 0, Math.PI * 2);
      ctx.fill();

      // Coordinates text
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 26px monospace";
      ctx.fillText(`DESTINATION [${lat.toFixed(2)}°, ${lon.toFixed(2)}°]`, 80, 73);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, [lat, lon]);

  if (!texture) return null;

  return (
    <sprite position={[0, 9.5, 0]} scale={[16, 4.0, 1]}>
      <spriteMaterial map={texture} transparent depthTest={false} fog={false} />
    </sprite>
  );
}
