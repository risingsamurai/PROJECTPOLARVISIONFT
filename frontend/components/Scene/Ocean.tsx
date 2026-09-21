"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { ShaderMaterial } from "three";
import * as THREE from "three";

// Prominent rolling Arctic ocean swell configuration:
// Wave 1: Large rolling swell (wavelength 28m, amplitude ~0.49, ~4x increase for clear visual presence)
// Wave 2: Cross swell (wavelength 14m, amplitude ~0.19)
// Wave 3: Wind chop (wavelength 6.5m, amplitude ~0.06)
// Wave 4: Surface detail ripple (wavelength 2.2m, amplitude ~0.012)
const WAVES = [
  { dirX: 0.82, dirY: 0.57, steepness: 0.110, wavelength: 28.0, speed: 1.05 }, // Primary rolling swell
  { dirX: -0.68, dirY: 0.73, steepness: 0.085, wavelength: 14.0, speed: 1.35 }, // Cross swell
  { dirX: 0.38, dirY: -0.92, steepness: 0.060, wavelength: 6.5, speed: 1.80 },  // Wind chop
  { dirX: -0.90, dirY: -0.43, steepness: 0.035, wavelength: 2.2, speed: 2.60 },  // Surface detail ripple
] as const;

/**
 * Reusable per-position wave height calculation for vessel physics, bobbing, and iceberg buoyancy.
 * Synchronized bit-for-bit with vertex shader displacement.
 * World coordinates (x, z) are mapped to plane local coordinates (x, -z).
 */
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

const vertexShader = `
uniform float uTime;
varying vec2 vUv;
varying float vWaveHeight;
varying vec3 vNormal;
varying vec3 vWorldPosition;

// Gerstner wave displacement with partial derivatives for accurate normal vectors
vec3 calculateGerstner(
  vec2 dir,
  float steepness,
  float wavelength,
  float speed,
  vec2 pos,
  float time,
  inout vec3 tangent,
  inout vec3 binormal
) {
  float k = 6.2831853 / wavelength;
  float c = sqrt(9.8 / k) * speed;
  vec2 d = normalize(dir);
  float f = k * (dot(d, pos) - c * time);
  float a = steepness / k;

  // Tangent derivative dP/dx and Binormal derivative dP/dy
  tangent += vec3(
    -d.x * d.x * (steepness * sin(f)),
    -d.x * d.y * (steepness * sin(f)),
    d.x * (steepness * cos(f))
  );

  binormal += vec3(
    -d.x * d.y * (steepness * sin(f)),
    -d.y * d.y * (steepness * sin(f)),
    d.y * (steepness * cos(f))
  );

  return vec3(
    d.x * (a * cos(f)),
    d.y * (a * cos(f)),
    a * sin(f)
  );
}

uniform vec2 uMeshOffset;

void main() {
  vUv = uv;
  vec3 p = position;
  vec2 gridPos = p.xy + uMeshOffset;

  // Initialize tangent along local X and binormal along local Y
  vec3 tangent = vec3(1.0, 0.0, 0.0);
  vec3 binormal = vec3(0.0, 1.0, 0.0);

  // 4 overlapping wave frequencies - large rolling swell + surface detail
  vec3 w1 = calculateGerstner(vec2(0.82, 0.57), 0.110, 28.0, 1.05, gridPos, uTime, tangent, binormal);
  vec3 w2 = calculateGerstner(vec2(-0.68, 0.73), 0.085, 14.0, 1.35, gridPos, uTime, tangent, binormal);
  vec3 w3 = calculateGerstner(vec2(0.38, -0.92), 0.060, 6.5, 1.80, gridPos, uTime, tangent, binormal);
  vec3 w4 = calculateGerstner(vec2(-0.90, -0.43), 0.035, 2.2, 2.60, gridPos, uTime, tangent, binormal);

  vec3 totalDisp = w1 + w2 + w3 + w4;

  // Trochoidal horizontal displacement: sharpens crests and widens troughs
  p.xy -= totalDisp.xy * 0.45;
  // Vertical displacement along local Z (which maps to world +Y after -PI/2 X rotation)
  p.z += totalDisp.z;
  vWaveHeight = totalDisp.z;

  // Correct upward normal: cross(tangent, binormal) points +Z in local space (world +Y)
  vec3 localNormal = normalize(cross(tangent, binormal));
  vNormal = normalize(normalMatrix * localNormal);

  vec4 worldPos = modelMatrix * vec4(p, 1.0);
  vWorldPosition = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const fragmentShader = `
uniform float uTime;
uniform vec3 uSunPosition;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;

varying vec2 vUv;
varying float vWaveHeight;
varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  vec3 normal = normalize(vNormal);
  if (!gl_FrontFacing) normal = -normal;

  // Direction to directional sun light
  vec3 lightDir = normalize(uSunPosition);

  // Physically-based Fresnel reflection
  float NdotV = max(dot(normal, viewDir), 0.0);
  float fresnel = 0.03 + 0.97 * pow(1.0 - NdotV, 3.8);

  // Believable Arctic Ocean Blue-Gray Palette with rich depth contrast
  vec3 deepTrough    = vec3(0.025, 0.065, 0.115); // Deep ocean dark navy in wave valleys
  vec3 midSlope      = vec3(0.065, 0.165, 0.245); // Mid-slope maritime blue-gray
  vec3 crestTeal     = vec3(0.120, 0.285, 0.380); // Translucent subsurface scattering on peaks
  vec3 skyReflection = vec3(0.480, 0.600, 0.700); // Cold polar sky reflection
  vec3 foamWhite     = vec3(0.880, 0.940, 0.980); // Crisp foam on steep crests

  // Height and slope based depth color gradient
  float heightT = smoothstep(-0.45, 0.45, vWaveHeight);
  vec3 waterBody = mix(deepTrough, midSlope, heightT);
  waterBody = mix(waterBody, crestTeal, smoothstep(0.15, 0.55, vWaveHeight));

  // Dynamic diffuse lighting responding to wave slopes (crest vs trough shading)
  float diffuse = max(dot(normal, lightDir), 0.0);
  // Sunlight warms the illuminated face; shadows darken the troughs
  waterBody += vec3(0.08, 0.14, 0.18) * diffuse;
  // Ambient occlusion in deep wave troughs
  float troughOcclusion = smoothstep(-0.55, 0.10, vWaveHeight);
  waterBody *= (0.65 + 0.35 * troughOcclusion);

  // Composite water body with polar sky reflection via Fresnel
  vec3 finalColor = mix(waterBody, skyReflection, fresnel * 0.62 + 0.08);

  // Blinn-Phong Specular Sun Highlights glistening on wave crests
  vec3 halfVec = normalize(lightDir + viewDir);
  float NdotH = max(dot(normal, halfVec), 0.0);
  float spec1 = pow(NdotH, 96.0) * 1.8;  // Bright sun highlight
  float spec2 = pow(NdotH, 20.0) * 0.35; // Broad solar sheen across wave slopes
  finalColor += vec3(1.0, 0.97, 0.91) * (spec1 + spec2);

  // Subtle crest foam on the highest, steepest wave crests
  float foamNoise = sin(vWorldPosition.x * 3.2 + uTime * 2.5) * cos(vWorldPosition.z * 3.2 - uTime * 2.0);
  float foamThreshold = 0.38 + foamNoise * 0.08;
  float foamIntensity = smoothstep(foamThreshold, 0.58, vWaveHeight);
  finalColor = mix(finalColor, foamWhite, foamIntensity * 0.50);

  // Atmospheric distance fog integration (gentle, preserves ocean depth)
  float dist = length(vWorldPosition - cameraPosition);
  float fogFactor = clamp((dist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  finalColor = mix(finalColor, uFogColor, fogFactor * 0.80);

  gl_FragColor = vec4(finalColor, 0.98);
}
`;

export function Ocean() {
  const mesh = useRef<THREE.Mesh>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMeshOffset: { value: new THREE.Vector2(0, 0) },
      uSunPosition: { value: new THREE.Vector3(80, 120, 30) },
      uFogColor: { value: new THREE.Color(0x5a6878) },
      uFogNear: { value: 250 },
      uFogFar: { value: 1200 },
    }),
    []
  );

  useFrame(({ camera }, dt) => {
    const mat = mesh.current?.material as ShaderMaterial | undefined;
    if (mat?.uniforms?.uTime) {
      mat.uniforms.uTime.value += dt;
    }
    if (mesh.current) {
      mesh.current.position.x = camera.position.x;
      mesh.current.position.z = camera.position.z;
      if (mat?.uniforms?.uMeshOffset) {
        mat.uniforms.uMeshOffset.value.set(camera.position.x, -camera.position.z);
      }
    }
  });

  return (
    <mesh
      ref={mesh}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.2, 0]}
      receiveShadow
    >
      <planeGeometry args={[1400, 1400, 160, 160]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}
