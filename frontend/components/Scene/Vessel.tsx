"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { selectLockedRoute, usePolarisStore } from "@/lib/store";
import { haversineNm, headingToVector, latLonToScene, sceneToLatLon } from "@/lib/geo";
import { getWaveHeightAt } from "./Ocean";

function WakeTrail({ speed }: { speed: number }) {
  const wakeLen = 32;
  const geom = useMemo(() => {
    const geo = new THREE.PlaneGeometry(3.5, wakeLen, 4, 16);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = (wakeLen / 2 - y) / wakeLen; 
      let x = pos.getX(i);
      x *= 1.0 + t * 0.9;
      pos.setX(i, x);
    }
    geo.translate(0, -wakeLen / 2 - 3.2, 0);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  return (
    <mesh geometry={geom} position={[0, 0.05, 0]}>
      <meshPhysicalMaterial
        color="#cfe8f5"
        transmission={0.9}
        roughness={0.1}
        ior={1.3}
        transparent={true}
        opacity={0.4}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// 3D Polar Icebreaker Model
function IcebreakerSilhouette() {
  const envMapIntensity = 0.1;

  return (
    <group>
      {/* --- LOWER HULL (Light Red) --- */}
      <mesh position={[0, 0.5, 0.2]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 0.9, 6.2]} />
        <meshStandardMaterial color="#E8686A" roughness={0.85} metalness={0} envMapIntensity={envMapIntensity} emissive={0} toneMapped={false} />
      </mesh>

      {/* Icebreaking Bow Wedge */}
      <mesh position={[0, 0.6, -3.2]} rotation={[0.42, 0, 0]} castShadow>
        <boxGeometry args={[1.9, 0.85, 1.8]} />
        <meshStandardMaterial color="#E8686A" roughness={0.85} metalness={0} envMapIntensity={envMapIntensity} emissive={0} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.35, -3.7]} rotation={[0.75, 0, 0]}>
        <boxGeometry args={[1.5, 0.6, 1.2]} />
        <meshStandardMaterial color="#E8686A" roughness={0.85} metalness={0} envMapIntensity={envMapIntensity} emissive={0} toneMapped={false} />
      </mesh>

      {/* Rounded Stern */}
      <mesh position={[0, 0.55, 3.4]} castShadow>
        <cylinderGeometry args={[1.05, 0.9, 0.9, 16]} />
        <meshStandardMaterial color="#E8686A" roughness={0.85} metalness={0} envMapIntensity={envMapIntensity} emissive={0} toneMapped={false} />
      </mesh>

      {/* Black Boot-topping Waterline Band */}
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[2.25, 0.22, 6.6]} />
        <meshStandardMaterial color="#0f172a" roughness={0.6} envMapIntensity={envMapIntensity} />
      </mesh>

      {/* --- MAIN WEATHER DECK (Light Red) --- */}
      <mesh position={[0, 0.98, 0.1]}>
        <boxGeometry args={[2.15, 0.08, 6.4]} />
        <meshStandardMaterial color="#E8686A" roughness={0.85} metalness={0} envMapIntensity={envMapIntensity} emissive={0} toneMapped={false} />
      </mesh>

      {/* --- FORWARD SUPERSTRUCTURE (Light Red) --- */}
      <mesh position={[0, 1.45, -0.6]} castShadow>
        <boxGeometry args={[1.85, 0.9, 2.8]} />
        <meshStandardMaterial color="#E8686A" roughness={0.85} metalness={0} envMapIntensity={envMapIntensity} emissive={0} toneMapped={false} />
      </mesh>

      {/* --- TIER 2 ACCOMMODATION DECK --- */}
      <mesh position={[0, 2.05, -0.7]} castShadow>
        <boxGeometry args={[1.65, 0.6, 2.2]} />
        <meshStandardMaterial color="#E8686A" roughness={0.85} metalness={0} envMapIntensity={envMapIntensity} emissive={0} toneMapped={false} />
      </mesh>

      {/* --- NAVIGATION BRIDGE --- */}
      <mesh position={[0, 2.55, -0.85]} castShadow>
        <boxGeometry args={[1.9, 0.45, 1.5]} />
        <meshStandardMaterial color="#E8686A" roughness={0.85} metalness={0} envMapIntensity={envMapIntensity} emissive={0} toneMapped={false} />
      </mesh>
      {/* Front & Side Bridge Windows */}
      <mesh position={[0, 2.58, -1.62]}>
        <boxGeometry args={[1.75, 0.22, 0.06]} />
        <meshStandardMaterial color="#0284c7" roughness={0.1} metalness={0.9} envMapIntensity={envMapIntensity} />
      </mesh>
      <mesh position={[0.96, 2.58, -0.85]}>
        <boxGeometry args={[0.06, 0.22, 1.2]} />
        <meshStandardMaterial color="#0284c7" roughness={0.1} metalness={0.9} envMapIntensity={envMapIntensity} />
      </mesh>
      <mesh position={[-0.96, 2.58, -0.85]}>
        <boxGeometry args={[0.06, 0.22, 1.2]} />
        <meshStandardMaterial color="#0284c7" roughness={0.1} metalness={0.9} envMapIntensity={envMapIntensity} />
      </mesh>

      {/* --- RADAR & COMMUNICATIONS MAST --- */}
      <mesh position={[0, 3.4, -0.6]}>
        <boxGeometry args={[0.18, 1.4, 0.18]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.4} envMapIntensity={envMapIntensity} />
      </mesh>
      <mesh position={[0, 4.0, -0.6]}>
        <cylinderGeometry args={[0.04, 0.04, 0.8, 8]} />
        <meshStandardMaterial color="#94a3b8" envMapIntensity={envMapIntensity} />
      </mesh>
      {/* Radar Domes */}
      <mesh position={[0.45, 3.2, -0.6]}>
        <sphereGeometry args={[0.22, 12, 12]} />
        <meshStandardMaterial color="#ffffff" envMapIntensity={envMapIntensity} />
      </mesh>
      <mesh position={[-0.45, 3.2, -0.6]}>
        <sphereGeometry args={[0.22, 12, 12]} />
        <meshStandardMaterial color="#ffffff" envMapIntensity={envMapIntensity} />
      </mesh>

      {/* --- EXHAUST FUNNEL --- */}
      <mesh position={[0, 2.2, 0.85]} castShadow>
        <boxGeometry args={[0.9, 1.4, 0.9]} />
        <meshStandardMaterial color="#E8686A" roughness={0.85} metalness={0} envMapIntensity={envMapIntensity} emissive={0} toneMapped={false} />
      </mesh>
      <mesh position={[0, 2.95, 0.85]}>
        <boxGeometry args={[0.92, 0.18, 0.92]} />
        <meshStandardMaterial color="#0f172a" roughness={0.6} envMapIntensity={envMapIntensity} />
      </mesh>

      {/* --- AFT HELIDECK --- */}
      <mesh position={[0, 1.08, 2.4]} receiveShadow>
        <cylinderGeometry args={[1.05, 1.05, 0.08, 18]} />
        <meshStandardMaterial color="#334155" roughness={0.7} envMapIntensity={envMapIntensity} />
      </mesh>
      {/* Helipad Yellow Ring & 'H' Marking */}
      <mesh position={[0, 1.13, 2.4]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.65, 0.78, 24]} />
        <meshBasicMaterial color="#eab308" />
      </mesh>

      {/* --- FOREDECK CRANE & WINCH --- */}
      <mesh position={[0, 1.25, -2.2]}>
        <boxGeometry args={[0.3, 0.5, 0.3]} />
        <meshStandardMaterial color="#eab308" roughness={0.4} envMapIntensity={envMapIntensity} />
      </mesh>
      <mesh position={[0, 1.7, -2.0]} rotation={[-0.35, 0, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 1.1, 8]} />
        <meshStandardMaterial color="#eab308" roughness={0.4} envMapIntensity={envMapIntensity} />
      </mesh>
    </group>
  );
}

// Icebreaker movement constants
const MOVEMENT = {
  MAX_FORWARD_SPEED: 150.0,
  MAX_REVERSE_SPEED: 60.0,
  ACCEL_FORWARD: 26.7,
  ACCEL_REVERSE: 14.0,
  DRAG_FACTOR: 0.988,
  MAX_TURN_RATE: 28.0,
  MIN_TURN_SPEED_RATIO: 0.15,
  TURN_ACCEL: 35.0,
  TURN_DAMPING: 0.92,
} as const;

export function Vessel() {
  const group = useRef<THREE.Group>(null);
  const visible = usePolarisStore((s) => s.layers.vessel);
  const vessel = usePolarisStore((s) => s.vessel);
  const insideBergsRef = useRef<Set<string>>(new Set());
  const angularVelocity = useRef(0);
  const currentHeave = useRef(-0.32);
  const currentPitch = useRef(0);
  const currentRoll = useRef(0);

  useFrame((_, dt) => {
    const state = usePolarisStore.getState();
    const {
      vessel,
      keys: currentKeys,
      setVessel,
      tickTime,
      autoMode,
      icebergs,
      pushDetection,
      pushAlert,
    } = state;
    const route = selectLockedRoute(state);

    let heading = vessel.headingDeg;
    const forwardKey = currentKeys.w || currentKeys.up;
    const back = currentKeys.s || currentKeys.down;
    const left = currentKeys.a || currentKeys.left;
    const right = currentKeys.d || currentKeys.right;

    if (autoMode && route.points.length > 1) {
      const [sx, , sz] = latLonToScene(vessel.lat, vessel.lon);
      let best = route.points[route.points.length - 1];
      for (const p of route.points) {
        const [px, , pz] = latLonToScene(p.lat, p.lon);
        const d = Math.hypot(px - sx, pz - sz);
        if (d > 3) {
          best = p;
          break;
        }
      }
      const [tx, , tz] = latLonToScene(best.lat, best.lon);
      const desired = (Math.atan2(tx - sx, -(tz - sz)) * 180) / Math.PI;
      const err = ((desired - heading + 540) % 360) - 180;
      heading = (heading + Math.max(-40 * dt, Math.min(40 * dt, err)) + 360) % 360;
    } else {
      const currentSpeed = Math.abs(vessel.sogKnots);
      const speedRatio = Math.max(
        MOVEMENT.MIN_TURN_SPEED_RATIO,
        Math.min(1.0, currentSpeed / MOVEMENT.MAX_FORWARD_SPEED)
      );
      const effectiveTurnRate = MOVEMENT.MAX_TURN_RATE * speedRatio;

      let targetTurnRate = 0;
      if (left) {
        targetTurnRate = -effectiveTurnRate;
      } else if (right) {
        targetTurnRate = effectiveTurnRate;
      }

      if (left || right) {
        if (targetTurnRate > angularVelocity.current) {
          angularVelocity.current = Math.min(
            targetTurnRate,
            angularVelocity.current + MOVEMENT.TURN_ACCEL * dt
          );
        } else {
          angularVelocity.current = Math.max(
            targetTurnRate,
            angularVelocity.current - MOVEMENT.TURN_ACCEL * dt
          );
        }
      } else {
        const turnDampingFrame = Math.pow(MOVEMENT.TURN_DAMPING, dt * 60);
        angularVelocity.current *= turnDampingFrame;
        if (Math.abs(angularVelocity.current) < 0.05) angularVelocity.current = 0;
      }

      heading += angularVelocity.current * dt;
      heading = (heading + 360) % 360;
    }

    let sog = vessel.sogKnots;
    if (forwardKey) {
      sog = Math.min(MOVEMENT.MAX_FORWARD_SPEED, sog + MOVEMENT.ACCEL_FORWARD * dt);
    } else if (back) {
      sog = Math.max(-MOVEMENT.MAX_REVERSE_SPEED, sog - MOVEMENT.ACCEL_REVERSE * dt);
    } else {
      const dragPerFrame = Math.pow(MOVEMENT.DRAG_FACTOR, dt * 60);
      sog *= dragPerFrame;
      if (Math.abs(sog) < 0.05) sog = 0;
    }

    const [vx, vz] = headingToVector(heading);
    const nmPerSec = Math.abs(sog) / 3600;
    const step = nmPerSec * dt * 90;
    const [x, , z] = latLonToScene(vessel.lat, vessel.lon);
    
    const direction = sog >= 0 ? 1 : -1;
    const nx = x + vx * step * direction;
    const nz = z + vz * step * direction;
    const { lat, lon } = sceneToLatLon(nx, nz);

    setVessel({
      lat,
      lon,
      headingDeg: heading,
      sogKnots: +sog.toFixed(2),
      cogDeg: heading,
    });
    tickTime();
    const t = performance.now() / 1000;

    const nearest = icebergs.reduce(
      (acc, ib) => {
        const d = haversineNm({ lat, lon }, ib);
        return d < acc.d ? { d, ib } : acc;
      },
      { d: 999, ib: icebergs[0] }
    );
    
    if (nearest.ib && nearest.d < 15 && Math.random() < dt * 0.6) {
      pushDetection({
        name: nearest.ib.name,
        confidence: 0.75 + Math.random() * 0.2,
        distanceNm: +nearest.d.toFixed(1),
        lat: nearest.ib.lat,
        lon: nearest.ib.lon,
      });
    }

    for (const ib of icebergs) {
      const isHighRisk = ib.highRisk || (ib.dangerRadiusNm && ib.dangerRadiusNm > 0);
      if (!isHighRisk) continue;

      const distNm = haversineNm({ lat, lon }, ib);
      const dangerRadius = ib.dangerRadiusNm || 5;

      if (distNm <= dangerRadius) {
        if (!insideBergsRef.current.has(ib.id)) {
          insideBergsRef.current.add(ib.id);
          state.triggerProximityAlert(ib);
          pushAlert(
            "CRITICAL",
            `Vessel within ${distNm.toFixed(1)} nm of ${ib.name}`
          );
        }
      } else if (distNm > dangerRadius + 0.5) {
        insideBergsRef.current.delete(ib.id);
      }
    }

    const g = group.current;
    if (!g) return;

    const headingRad = THREE.MathUtils.degToRad(heading);

    const centerWave = getWaveHeightAt(nx, nz, t);
    const targetHeave = -0.32 + centerWave;
    currentHeave.current = THREE.MathUtils.lerp(currentHeave.current, targetHeave, Math.min(1.0, dt * 10));

    const bowX = nx + vx * 2.4;
    const bowZ = nz + vz * 2.4;
    const sternX = nx - vx * 2.4;
    const sternZ = nz - vz * 2.4;
    const hBow = getWaveHeightAt(bowX, bowZ, t);
    const hStern = getWaveHeightAt(sternX, sternZ, t);
    const pitchWave = Math.atan2(hBow - hStern, 4.8);
    const pitchAccel = (forwardKey ? -0.022 : back ? 0.022 : 0) * Math.min(1.0, 0.4 + (Math.abs(sog) / 30) * 0.6);
    const targetPitch = Math.max(-0.065, Math.min(0.065, pitchWave + pitchAccel));
    currentPitch.current = THREE.MathUtils.lerp(currentPitch.current, targetPitch, Math.min(1.0, dt * 8));

    const stbdX = nx - vz * 1.0;
    const stbdZ = nz + vx * 1.0;
    const portX = nx + vz * 1.0;
    const portZ = nz - vx * 1.0;
    const hStbd = getWaveHeightAt(stbdX, stbdZ, t);
    const hPort = getWaveHeightAt(portX, portZ, t);
    const rollWave = Math.atan2(hStbd - hPort, 2.0);
    const rollTurn = -(angularVelocity.current / MOVEMENT.MAX_TURN_RATE) * 0.035;
    const targetRoll = Math.max(-0.065, Math.min(0.065, rollWave + rollTurn));
    currentRoll.current = THREE.MathUtils.lerp(currentRoll.current, targetRoll, Math.min(1.0, dt * 8));

    g.position.set(nx, currentHeave.current, nz);
    g.rotation.set(currentPitch.current, -headingRad, currentRoll.current, "YXZ");
  });

  if (!visible) return null;

  return (
    <group ref={group}>
      <group rotation={[0, Math.PI, 0]}>
        <IcebreakerSilhouette />
      </group>
      <WakeTrail speed={vessel.sogKnots} />
    </group>
  );
}
