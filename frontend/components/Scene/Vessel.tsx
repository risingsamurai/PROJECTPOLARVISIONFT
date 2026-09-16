"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { selectLockedRoute, usePolarisStore } from "@/lib/store";
import { headingToVector, latLonToScene, sceneToLatLon } from "@/lib/geo";

// Animated expanding dual-trail foam wake
function WakeTrail({ speed }: { speed: number }) {
  const wakePoints = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const count = 36;
    for (let i = 0; i < count; i++) {
      const z = 3.2 + i * 0.75;
      const spread = 0.6 + i * 0.14;
      // Port and starboard wake streams
      pts.push(new THREE.Vector3(-spread, 0.08, z));
      pts.push(new THREE.Vector3(spread, 0.08, z));
      // Center turbulence
      if (i % 2 === 0) {
        pts.push(new THREE.Vector3(0, 0.06, z * 0.9));
      }
    }
    return pts;
  }, []);

  const geom = useMemo(() => new THREE.BufferGeometry().setFromPoints(wakePoints), [wakePoints]);

  return (
    <points geometry={geom}>
      <pointsMaterial
        color="#e0f2fe"
        size={Math.max(0.25, 0.2 + speed * 0.045)}
        transparent
        opacity={Math.min(0.65, 0.2 + speed * 0.05)}
        sizeAttenuation
      />
    </points>
  );
}

// 3D Polar Icebreaker Model
function IcebreakerSilhouette() {
  return (
    <group>
      {/* --- LOWER HULL (Polar Crimson Red) --- */}
      {/* Main Hull Body */}
      <mesh position={[0, 0.5, 0.2]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 0.9, 6.2]} />
        <meshStandardMaterial color="#b91c1c" roughness={0.35} metalness={0.1} />
      </mesh>

      {/* Icebreaking Bow Wedge (Angled upward for ice crushing) */}
      <mesh position={[0, 0.6, -3.2]} rotation={[0.42, 0, 0]} castShadow>
        <boxGeometry args={[1.9, 0.85, 1.8]} />
        <meshStandardMaterial color="#991b1b" roughness={0.35} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.35, -3.7]} rotation={[0.75, 0, 0]}>
        <boxGeometry args={[1.5, 0.6, 1.2]} />
        <meshStandardMaterial color="#7f1d1d" roughness={0.4} />
      </mesh>

      {/* Rounded Stern */}
      <mesh position={[0, 0.55, 3.4]} castShadow>
        <cylinderGeometry args={[1.05, 0.9, 0.9, 16]} />
        <meshStandardMaterial color="#b91c1c" roughness={0.35} />
      </mesh>

      {/* Black Boot-topping Waterline Band */}
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[2.25, 0.22, 6.6]} />
        <meshStandardMaterial color="#0f172a" roughness={0.6} />
      </mesh>

      {/* --- MAIN WEATHER DECK (Light Slate) --- */}
      <mesh position={[0, 0.98, 0.1]}>
        <boxGeometry args={[2.15, 0.08, 6.4]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.5} />
      </mesh>

      {/* --- FORWARD SUPERSTRUCTURE (Tier 1 - White) --- */}
      <mesh position={[0, 1.45, -0.6]} castShadow>
        <boxGeometry args={[1.85, 0.9, 2.8]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.3} />
      </mesh>

      {/* --- TIER 2 ACCOMMODATION DECK --- */}
      <mesh position={[0, 2.05, -0.7]} castShadow>
        <boxGeometry args={[1.65, 0.6, 2.2]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.3} />
      </mesh>

      {/* --- NAVIGATION BRIDGE (Command Deck with panoramic windows) --- */}
      <mesh position={[0, 2.55, -0.85]} castShadow>
        <boxGeometry args={[1.9, 0.45, 1.5]} />
        <meshStandardMaterial color="#ffffff" roughness={0.2} />
      </mesh>
      {/* Front & Side Bridge Windows */}
      <mesh position={[0, 2.58, -1.62]}>
        <boxGeometry args={[1.75, 0.22, 0.06]} />
        <meshStandardMaterial color="#0284c7" roughness={0.1} metalness={0.9} />
      </mesh>
      <mesh position={[0.96, 2.58, -0.85]}>
        <boxGeometry args={[0.06, 0.22, 1.2]} />
        <meshStandardMaterial color="#0284c7" roughness={0.1} metalness={0.9} />
      </mesh>
      <mesh position={[-0.96, 2.58, -0.85]}>
        <boxGeometry args={[0.06, 0.22, 1.2]} />
        <meshStandardMaterial color="#0284c7" roughness={0.1} metalness={0.9} />
      </mesh>

      {/* --- RADAR & COMMUNICATIONS MAST --- */}
      {/* Lattice Mast Tower */}
      <mesh position={[0, 3.4, -0.6]}>
        <boxGeometry args={[0.18, 1.4, 0.18]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.4} />
      </mesh>
      <mesh position={[0, 4.0, -0.6]}>
        <cylinderGeometry args={[0.04, 0.04, 0.8, 8]} />
        <meshStandardMaterial color="#94a3b8" />
      </mesh>
      {/* Radar Domes */}
      <mesh position={[0.45, 3.2, -0.6]}>
        <sphereGeometry args={[0.22, 12, 12]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[-0.45, 3.2, -0.6]}>
        <sphereGeometry args={[0.22, 12, 12]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>

      {/* --- EXHAUST FUNNEL (Twin Red/Black stacks) --- */}
      <mesh position={[0, 2.2, 0.85]} castShadow>
        <boxGeometry args={[0.9, 1.4, 0.9]} />
        <meshStandardMaterial color="#b91c1c" roughness={0.4} />
      </mesh>
      <mesh position={[0, 2.95, 0.85]}>
        <boxGeometry args={[0.92, 0.18, 0.92]} />
        <meshStandardMaterial color="#0f172a" roughness={0.6} />
      </mesh>

      {/* --- AFT HELIDECK (Rear Flight Landing Platform) --- */}
      <mesh position={[0, 1.08, 2.4]} receiveShadow>
        <cylinderGeometry args={[1.05, 1.05, 0.08, 18]} />
        <meshStandardMaterial color="#334155" roughness={0.7} />
      </mesh>
      {/* Helipad Yellow Ring & 'H' Marking */}
      <mesh position={[0, 1.13, 2.4]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.65, 0.78, 24]} />
        <meshBasicMaterial color="#eab308" />
      </mesh>

      {/* --- FOREDECK CRANE & WINCH --- */}
      <mesh position={[0, 1.25, -2.2]}>
        <boxGeometry args={[0.3, 0.5, 0.3]} />
        <meshStandardMaterial color="#eab308" roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.7, -2.0]} rotation={[-0.35, 0, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 1.1, 8]} />
        <meshStandardMaterial color="#eab308" roughness={0.4} />
      </mesh>
    </group>
  );
}

// Icebreaker movement constants - precise physics tuning
const MOVEMENT = {
  MAX_FORWARD_SPEED: 25.0,    // Top speed in knots (fast icebreaker)
  MAX_REVERSE_SPEED: 10.0,   // Max reverse (40% of forward)
  ACCEL_FORWARD: 5.0,        // Forward acceleration (knots/s) - reaches speed quickly
  ACCEL_REVERSE: 3.0,        // Reverse acceleration (slower than forward)
  DRAG_FACTOR: 0.995,        // Per-frame drag for coasting (stops in ~3s from top speed)
  MAX_TURN_RATE: 35.0,       // Max turn rate (degrees/s)
  MIN_TURN_SPEED_RATIO: 0.15, // 15% of max speed for minimal turning
  TURN_ACCEL: 40.0,         // Angular acceleration (degrees/s²)
  TURN_DAMPING: 0.90,        // Angular damping when no turn input
} as const;

export function Vessel() {
  const group = useRef<THREE.Group>(null);
  const visible = usePolarisStore((s) => s.layers.vessel);
  const vessel = usePolarisStore((s) => s.vessel);
  const lastCrit = useRef(0);
  const angularVelocity = useRef(0); // Current turn rate (degrees/s)

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

    // Auto-pilot mode follows route
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
      // Manual control with speed-dependent turning and angular momentum
      const currentSpeed = Math.abs(vessel.sogKnots);
      const speedRatio = Math.max(MOVEMENT.MIN_TURN_SPEED_RATIO, Math.min(1.0, currentSpeed / MOVEMENT.MAX_FORWARD_SPEED));
      const effectiveTurnRate = MOVEMENT.MAX_TURN_RATE * speedRatio;

      // Apply angular acceleration based on input
      if (left) {
        angularVelocity.current = Math.max(-effectiveTurnRate, angularVelocity.current - MOVEMENT.TURN_ACCEL * dt);
      } else if (right) {
        angularVelocity.current = Math.min(effectiveTurnRate, angularVelocity.current + MOVEMENT.TURN_ACCEL * dt);
      } else {
        // Angular damping when no input
        angularVelocity.current *= MOVEMENT.TURN_DAMPING;
      }

      // Apply rotation with smooth damping
      heading += angularVelocity.current * dt;
      heading = (heading + 360) % 360;
    }

    // Speed control with proper physics
    let sog = vessel.sogKnots;
    if (forwardKey) {
      // Forward acceleration: velocity += acceleration * dt
      sog = Math.min(MOVEMENT.MAX_FORWARD_SPEED, sog + MOVEMENT.ACCEL_FORWARD * dt);
    } else if (back) {
      // Reverse acceleration (slower than forward)
      sog = Math.max(-MOVEMENT.MAX_REVERSE_SPEED, sog - MOVEMENT.ACCEL_REVERSE * dt);
    } else {
      // Apply drag force for coasting: velocity *= dragFactor
      sog *= MOVEMENT.DRAG_FACTOR;
      
      // Stop completely when very slow to prevent drift
      if (Math.abs(sog) < 0.01) sog = 0;
    }

    const [vx, vz] = headingToVector(heading);
    const nmPerSec = Math.abs(sog) / 3600;
    const step = nmPerSec * dt * 90;
    const [x, , z] = latLonToScene(vessel.lat, vessel.lon);
    
    // Reverse direction when going backwards
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
        const dlat = ib.lat - lat;
        const dlon = ib.lon - lon;
        const d = Math.sqrt(dlat * dlat + dlon * dlon) * 60;
        return d < acc.d ? { d, ib } : acc;
      },
      { d: 999, ib: icebergs[0] }
    );
    
    // Increased detection range and frequency for better visibility
    if (nearest.ib && nearest.d < 15 && Math.random() < dt * 0.6) {
      pushDetection({
        name: nearest.ib.name,
        confidence: 0.75 + Math.random() * 0.2,
        distanceNm: +nearest.d.toFixed(1),
        lat: nearest.ib.lat,
        lon: nearest.ib.lon,
      });
    }
    if (nearest.d < 5 && t - lastCrit.current > 5) {
      lastCrit.current = t;
      pushAlert(
        "CRITICAL",
        `Vessel within ${nearest.d.toFixed(1)} nm of ${nearest.ib.name}`
      );
    }

    const g = group.current;
    if (!g) return;

    // Accurate heading rotation: Navigational 0° is North (-Z), rotated around Y
    const headingRad = THREE.MathUtils.degToRad(heading);
    
    g.position.set(nx, 0, nz);
    g.rotation.y = -headingRad;

    // Enhanced water physics synced with ocean
    const speedFactor = Math.min(1.0, 0.2 + (Math.abs(sog) / 20) * 0.8);
    const wavePhase = t * 1.2; // Sync with ocean wave frequency
    
    // Bobbing (heave) - vertical motion matching ocean waves
    g.position.y = 0.2 + Math.sin(wavePhase) * 0.08 * speedFactor;
    
    // Pitch - nose up/down based on acceleration and waves
    const pitchInput = (forwardKey ? 1 : 0) - (back ? 1 : 0);
    g.rotation.x = Math.cos(wavePhase * 0.9) * 0.03 * speedFactor + pitchInput * 0.04 * speedFactor;
    
    // Roll - side-to-side tilt while turning, plus wave influence
    const turnRoll = (left ? -1 : 0) + (right ? 1 : 0); // Roll from turning
    const waveRoll = Math.sin(wavePhase * 1.1) * 0.04 * speedFactor; // Roll from waves
    g.rotation.z = waveRoll + turnRoll * 0.03 * speedFactor;
  });

  if (!visible) return null;

  return (
    <group ref={group}>
      <IcebreakerSilhouette />
      <WakeTrail speed={vessel.sogKnots} />
    </group>
  );
}

