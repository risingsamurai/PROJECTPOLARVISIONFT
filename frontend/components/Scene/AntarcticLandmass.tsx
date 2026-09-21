"use client";

import { useEffect, useState, useMemo } from "react";
import * as THREE from "three";

interface PolygonData {
  id: string;
  points: [number, number][]; // [sceneX, sceneZ]
}

interface CoastlineJson {
  format: string;
  count: number;
  polygons: PolygonData[];
}

export function AntarcticLandmass() {
  const [data, setData] = useState<CoastlineJson | null>(null);

  useEffect(() => {
    fetch("/data/antarctic_coastline.json")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load coastline JSON");
        return res.json();
      })
      .then((json) => setData(json))
      .catch((err) => console.error("Error loading Antarctic coastline data:", err));
  }, []);

  const geometries = useMemo(() => {
    if (!data || !data.polygons) return [];

    const geoms: THREE.BufferGeometry[] = [];

    data.polygons.forEach((poly) => {
      if (!poly.points || poly.points.length < 3) return;

      const shape = new THREE.Shape();
      // First point (sceneX, -sceneZ in shape 2D plane)
      shape.moveTo(poly.points[0][0], -poly.points[0][1]);

      for (let i = 1; i < poly.points.length; i++) {
        shape.lineTo(poly.points[i][0], -poly.points[i][1]);
      }
      shape.closePath();

      try {
        const geom = new THREE.ExtrudeGeometry(shape, {
          depth: 7.0, // Height of Antarctic ice shelf/cliffs above waterline
          bevelEnabled: true,
          bevelSegments: 2,
          steps: 1,
          bevelSize: 0.4,
          bevelThickness: 0.6,
        });
        geoms.push(geom);
      } catch (err) {
        // Skip self-intersecting or degenerate loops
      }
    });

    return geoms;
  }, [data]);

  if (geometries.length === 0) return null;

  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]}>
      {geometries.map((geom, i) => (
        <mesh
          key={i}
          geometry={geom}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial
            color="#e2e8f0"
            roughness={0.78}
            metalness={0.06}
            flatShading
          />
        </mesh>
      ))}
    </group>
  );
}
