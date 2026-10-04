"use client";

import { useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { Iceberg } from "@/lib/mockData";
import { haversineNm, latLonToScene } from "@/lib/geo";
import { usePolarisStore } from "@/lib/store";

const hash = (x: number, y: number, z: number) => {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
};
const sm = (t: number) => t * t * (3 - 2 * t);
function vnoise(x: number, y: number, z: number) {
  const xi = Math.floor(x),
    yi = Math.floor(y),
    zi = Math.floor(z);
  const xf = sm(x - xi),
    yf = sm(y - yi),
    zf = sm(z - zi);
  let r = 0;
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++)
      for (let k = 0; k < 2; k++)
        r +=
          (i ? xf : 1 - xf) *
          (j ? yf : 1 - yf) *
          (k ? zf : 1 - zf) *
          hash(xi + i, yi + j, zi + k);
  return r;
}
function fbm(x: number, y: number, z: number, oct = 4) {
  let a = 0.5,
    f = 1,
    s = 0;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f, y * f, z * f);
    f *= 2;
    a *= 0.5;
  }
  return s;
}

type IcebergKind = "tabular" | "berg";

const CLIP_ABOVE = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
const CLIP_BELOW = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

const COL_SNOW = new THREE.Color("#f8fafc");
const COL_SIDE = new THREE.Color("#94a3b8");
const COL_SHALLOW = new THREE.Color("#7dd3fc");
const COL_MID = new THREE.Color("#0284c7");
const COL_DEEP = new THREE.Color("#0c4a6e");
const COL_STREAK = new THREE.Color("#38bdf8");

/**
 * Creates authentic polar iceberg geometry:
 * - Tabular: Irregular polygon footprint (16-20 vertices with noise), extruded flat top table with steep rough sides, subtle bevel.
 * - Berg: Chunky icosahedron-based blocks with natural noise displacement and flat facets.
 * - Submerged keel: ~85% total volume below water level.
 */
export function createIceberg({
  radius = 1,
  heightRatio = 0.16, // Visible freeboard strictly 10% to 20% of width
  seed = 1,
  detail = 4,
  kind = "tabular" as IcebergKind,
} = {}) {
  const o = seed * 19.41;

  if (kind === "tabular") {
    // Generate Tabular iceberg via irregular polygon extrusion & displacement
    const numVerts = 18;
    const shape = new THREE.Shape();
    const pts2D: THREE.Vector2[] = [];
    for (let i = 0; i < numVerts; i++) {
      const angle = (i / numVerts) * Math.PI * 2;
      const nx = Math.cos(angle);
      const nz = Math.sin(angle);
      const radNoise = 0.85 + 0.3 * (fbm(nx * 2.2 + o, nz * 2.2 + o, 0.5) - 0.5);
      const r = radius * radNoise;
      pts2D.push(new THREE.Vector2(nx * r, nz * r));
    }
    shape.setFromPoints(pts2D);

    const aboveHeight = radius * heightRatio * 2.0;
    const belowDepth = radius * 2.8;

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: aboveHeight + belowDepth,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 3,
      bevelSize: radius * 0.08,
      bevelThickness: radius * 0.08,
    });

    // Translate so z=0 in extrusion aligns with waterline (y=0 in 3D world)
    geo.translate(0, 0, -belowDepth);
    geo.rotateX(-Math.PI / 2);

    // Apply natural facet displacement to top and underwater keel
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i);
      const py = p.getY(i);
      const pz = p.getZ(i);
      if (py >= 0) {
        // Subtle top table undulation
        const topN = fbm(px * 0.4 + o, pz * 0.4 + o, 1.0) * 0.15;
        p.setY(i, Math.max(0.05, py + topN * aboveHeight));
      } else {
        // Keel inward tapering
        const depthFrac = Math.min(1.0, Math.abs(py) / belowDepth);
        const taper = 1.0 - 0.35 * Math.pow(depthFrac, 1.2);
        p.setX(i, px * taper);
        p.setZ(i, pz * taper);
      }
    }
    geo.computeVertexNormals();

    // Vertex color gradient
    const col = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const py = p.getY(i);
      if (py >= 0) {
        c.copy(COL_SIDE).lerp(COL_SNOW, Math.min(1.0, py / (aboveHeight || 1)));
      } else {
        const d = Math.min(1.0, Math.abs(py) / belowDepth);
        if (d < 0.4) c.copy(COL_SHALLOW).lerp(COL_MID, d / 0.4);
        else c.copy(COL_MID).lerp(COL_DEEP, (d - 0.4) / 0.6);
      }
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return geo;
  } else {
    // Chunky rounded irregular block
    const geo = new THREE.IcosahedronGeometry(1, detail);
    const p = geo.attributes.position;
    const v = new THREE.Vector3();

    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p as THREE.BufferAttribute, i);
      const y = v.y;
      const len = Math.hypot(v.x, v.z) || 1e-6;
      const hx = v.x / len;
      const hz = v.z / len;
      const az = Math.atan2(v.z, v.x);

      const outline = 1 + 0.35 * (fbm(hx * 1.8 + o, hz * 1.8 + o, 0) - 0.5);
      const facets = 0.85 + 0.15 * Math.abs(Math.sin(az * 5 + o * 0.65));
      let rad = radius * outline * facets;

      if (y >= 0) {
        rad *= 0.88 - 0.15 * Math.pow(y, 1.5);
        const px = hx * rad;
        const pz = hz * rad;
        const surfaceNoise = 0.85 + 0.3 * fbm(hx * 3.0 + o, hz * 3.0 + o, y * 2.0);
        const yw = Math.max(0.04, y * radius * heightRatio * 2.0 * surfaceNoise);
        p.setXYZ(i, px, yw, pz);
      } else {
        const depthFrac = Math.min(1, Math.abs(y));
        const keelWedge = 1.05 - 0.4 * Math.pow(depthFrac, 1.3);
        rad *= keelWedge;
        const px = hx * rad;
        const pz = hz * rad;
        const keelNoise = 0.9 + 0.2 * fbm(px * 0.3 + o, pz * 0.3 + o, 4.0);
        const yw = -depthFrac * radius * 3.0 * keelNoise;
        p.setXYZ(i, px, yw, pz);
      }
    }
    geo.computeVertexNormals();

    const n = geo.attributes.normal;
    const col = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    const maxSub = radius * 3.0;

    for (let i = 0; i < p.count; i++) {
      const py = p.getY(i);
      const nx = (n as THREE.BufferAttribute).getX(i);
      const nz = (n as THREE.BufferAttribute).getZ(i);
      if (py >= 0) {
        c.copy(COL_SIDE).lerp(COL_SNOW, 0.8);
      } else {
        const d = Math.min(1, -py / maxSub);
        if (d < 0.4) c.copy(COL_SHALLOW).lerp(COL_MID, d / 0.4);
        else c.copy(COL_MID).lerp(COL_DEEP, (d - 0.4) / 0.6);
        const ridge = Math.min(1, (Math.abs(nx) + Math.abs(nz)) * 0.85);
        c.lerp(COL_STREAK, ridge * 0.25 * (1 - d * 0.4));
      }
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return geo;
  }
}

type IceMatProps = {
  selected?: boolean;
  highRisk?: boolean;
};

export function IceSurfaceMaterial({ selected, highRisk }: IceMatProps) {
  return (
    <meshPhysicalMaterial
      vertexColors
      roughness={0.35}
      metalness={0.02}
      clearcoat={0.6}
      clearcoatRoughness={0.25}
      flatShading
      clippingPlanes={[CLIP_ABOVE]}
      clipShadows
      emissive={selected ? "#0284c7" : highRisk ? "#38bdf8" : "#000000"}
      emissiveIntensity={selected ? 0.45 : highRisk ? 0.2 : 0}
    />
  );
}

export function IceSubmergedMaterial() {
  return (
    <meshPhysicalMaterial
      vertexColors
      roughness={0.15}
      metalness={0.05}
      transmission={0.65}
      thickness={2.5}
      ior={1.31}
      transparent
      opacity={0.88}
      clippingPlanes={[CLIP_BELOW]}
      side={THREE.DoubleSide}
      depthWrite={false}
    />
  );
}

function IcebergFoamRing({ radius }: { radius: number }) {
  const quality = usePolarisStore((s) => s.graphicsQuality || "high");
  if (quality === "low") return null;

  return (
    <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[radius * 0.96, radius * 1.14, 32]} />
      <meshBasicMaterial
        color="#e0f2fe"
        transparent
        opacity={0.35}
        depthWrite={false}
      />
    </mesh>
  );
}

export const SHARED_GEOMETRIES = {
  high: [] as { geo: THREE.BufferGeometry; class: string; kind: IcebergKind }[],
  low: [] as { geo: THREE.BufferGeometry; class: string; kind: IcebergKind }[],
};

if (typeof window !== "undefined") {
  for (const q of [3, 4]) {
    const list = q === 4 ? SHARED_GEOMETRIES.high : SHARED_GEOMETRIES.low;
    // 3 Tabular variants for large icebergs (A83, A85, D33A, etc.)
    for (let v = 1; v <= 3; v++)
      list.push({
        geo: createIceberg({ radius: 1, heightRatio: 0.15, seed: v, detail: q, kind: "tabular" }),
        class: "large",
        kind: "tabular",
      });
    // 3 Blocky / Rounded variants for medium and small bergs (B22F, C16, etc.)
    for (let v = 4; v <= 6; v++)
      list.push({
        geo: createIceberg({ radius: 1, heightRatio: 0.17, seed: v, detail: q, kind: "berg" }),
        class: "medium",
        kind: "berg",
      });
    for (let v = 7; v <= 9; v++)
      list.push({
        geo: createIceberg({ radius: 1, heightRatio: 0.16, seed: v, detail: q, kind: "berg" }),
        class: "small",
        kind: "berg",
      });
  }
}

export function IcebergMesh({
  iceberg,
  showLabel,
}: {
  iceberg: Iceberg;
  showLabel: boolean;
}) {
  const bodyRef = useRef<THREE.Group>(null);
  const selected = usePolarisStore((s) => s.selectedIcebergId === iceberg.id);
  const select = usePolarisStore((s) => s.selectIceberg);
  const showPred = usePolarisStore((s) => s.layers.predictions);
  const showRiskZones = usePolarisStore((s) => s.layers.riskZones);
  const [x, , z] = latLonToScene(iceberg.lat, iceberg.lon);

  const dangerRadius = iceberg.dangerRadiusNm || 7.0;

  // Visual footprint radius: max(0.45 * dangerRadius, 5.0) capped at 0.75 * dangerRadius
  const visualRadius = THREE.MathUtils.clamp(
    dangerRadius * 0.48,
    4.5,
    dangerRadius * 0.75
  );

  // Tabular classification: name starts with A, D or diameter >= 3 NM
  const isTabular =
    iceberg.name?.startsWith("A") ||
    iceberg.name?.startsWith("D") ||
    (iceberg.diameterNm && iceberg.diameterNm >= 2.5);

  const sizeClass = isTabular ? "large" : visualRadius > 6.0 ? "medium" : "small";
  const quality = usePolarisStore((s) => s.graphicsQuality || "high");

  const geo = useMemo(() => {
    let hashVal = 0;
    for (let i = 0; i < iceberg.id.length; i++) hashVal += iceberg.id.charCodeAt(i);
    const list = quality === "low" ? SHARED_GEOMETRIES.low : SHARED_GEOMETRIES.high;
    const valid = list.filter((g) => g.class === sizeClass);
    return (valid[hashVal % valid.length] || list[0]).geo;
  }, [iceberg.id, sizeClass, quality]);

  const pathPts = useMemo(() => {
    if (!iceberg.predictedPath) return [];
    return iceberg.predictedPath.map((p) => {
      const [px, , pz] = latLonToScene(p.lat, p.lon);
      return new THREE.Vector3(px, 0.3, pz);
    });
  }, [iceberg.predictedPath]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + iceberg.lat * 5;
    if (bodyRef.current) {
      bodyRef.current.position.y = Math.sin(t * 0.6) * 0.03;
      bodyRef.current.rotation.z = Math.sin(t * 0.3) * 0.008;
    }
  });

  return (
    <group position={[x, 0, z]}>
      {/* 3D Iceberg Body (Solid tabular / chunky mass with underwater keel) */}
      <group
        ref={bodyRef}
        scale={[visualRadius, visualRadius, visualRadius]}
        rotation={[0, (iceberg.headingDeg * Math.PI) / 180, 0]}
      >
        <mesh
          geometry={geo}
          castShadow
          receiveShadow
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
        >
          <IceSurfaceMaterial selected={selected} highRisk={iceberg.highRisk} />
        </mesh>
        <mesh geometry={geo} receiveShadow>
          <IceSubmergedMaterial />
        </mesh>
        <IcebergFoamRing radius={1.12} />
      </group>

      {/* Danger Zone Ring: Flat on the water surface at true radius */}
      {showRiskZones && (
        <group position={[0, 0.04, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[dangerRadius, 48]} />
            <meshBasicMaterial
              color={iceberg.highRisk ? "#ef4444" : "#eab308"}
              transparent
              opacity={0.08}
              depthWrite={false}
            />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[dangerRadius * 0.96, dangerRadius, 48]} />
            <meshBasicMaterial
              color={iceberg.highRisk ? "#ef4444" : "#eab308"}
              transparent
              opacity={0.55}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}

      {/* Selected Iceberg Indicator Ring */}
      {selected && (
        <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[visualRadius * 1.25, visualRadius * 1.4, 32]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.9} />
        </mesh>
      )}

      {/* Predicted Drift Trajectory Line */}
      {showPred && pathPts.length > 1 && (
        <line>
          <bufferGeometry attach="geometry">
            <bufferAttribute
              attach="attributes-position"
              array={new Float32Array(pathPts.flatMap((p) => [p.x - x, p.y, p.z - z]))}
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

      {/* Floating 3D Sprite Iceberg Label (Only nearest 5 or selected) */}
      {showLabel && (
        <IcebergSpriteLabel
          name={iceberg.name}
          isHighRisk={iceberg.highRisk}
          isSelected={selected}
          yPos={visualRadius * 0.45 + 1.2}
        />
      )}
    </group>
  );
}

function IcebergSpriteLabel({
  name,
  isHighRisk,
  isSelected,
  yPos,
}: {
  name: string;
  isHighRisk: boolean;
  isSelected: boolean;
  yPos: number;
}) {
  const texture = useMemo(() => {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = isSelected
      ? "rgba(8, 47, 73, 0.92)"
      : isHighRisk
      ? "rgba(69, 10, 10, 0.88)"
      : "rgba(15, 23, 42, 0.88)";
    ctx.strokeStyle = isSelected
      ? "#38bdf8"
      : isHighRisk
      ? "#ef4444"
      : "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 3;
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(4, 4, 248, 56, 12);
    } else {
      ctx.rect(4, 4, 248, 56);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isSelected
      ? "#bae6fd"
      : isHighRisk
      ? "#fca5a5"
      : "#f8fafc";
    ctx.font = "bold 22px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${name}${isHighRisk ? " ⚠️" : ""}`, 128, 33);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, [name, isHighRisk, isSelected]);

  if (!texture) return null;

  return (
    <sprite position={[0, yPos, 0]} scale={[7.0, 1.8, 1]}>
      <spriteMaterial map={texture} transparent depthTest={false} fog={false} />
    </sprite>
  );
}

export function IcebergField() {
  const icebergs = usePolarisStore((s) => s.icebergs);
  const vessel = usePolarisStore((s) => s.vessel);
  const selectedIcebergId = usePolarisStore((s) => s.selectedIcebergId);
  const cameraTargetCoord = usePolarisStore((s) => s.cameraTargetCoord);
  const visible = usePolarisStore((s) => s.layers.icebergs);

  const centerLat = cameraTargetCoord ? cameraTargetCoord[0] : vessel.lat;
  const centerLon = cameraTargetCoord ? cameraTargetCoord[1] : vessel.lon;

  // Filter icebergs within 50 NM of ship (or selected iceberg), sort by distance
  const nearbyIcebergs = useMemo(() => {
    if (!icebergs || icebergs.length === 0) return [];
    const center = { lat: centerLat, lon: centerLon };
    const items = icebergs.map((ib) => ({
      ib,
      dist: haversineNm(center, { lat: ib.lat, lon: ib.lon }),
    }));
    return items
      .filter((item) => item.dist <= 50 || item.ib.id === selectedIcebergId)
      .sort((a, b) => a.dist - b.dist);
  }, [icebergs, centerLat, centerLon, selectedIcebergId]);

  if (!visible) return null;

  return (
    <group>
      {nearbyIcebergs.map(({ ib }, idx) => (
        <IcebergMesh
          key={ib.id}
          iceberg={ib}
          showLabel={idx < 5 || ib.id === selectedIcebergId}
        />
      ))}
    </group>
  );
}
