"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { ShaderMaterial } from "three";
import * as THREE from "three";

// JavaScript equivalent of wave height calculation for ship physics
export function getWaveHeightAt(x: number, z: number, time: number): number {
  const wave1 = calculateWaveJS(1.0, 0.3, 0.28, 38.0, 0.9, x, z, time);
  const wave2 = calculateWaveJS(-0.4, 0.9, 0.22, 22.0, 1.1, x, z, time);
  const wave3 = calculateWaveJS(0.6, -0.8, 0.16, 12.0, 1.4, x, z, time);
  const wave4 = calculateWaveJS(-0.8, -0.3, 0.10, 6.5, 1.8, x, z, time);
  
  return wave1.z + wave2.z + wave3.z + wave4.z;
}

function calculateWaveJS(dirX: number, dirY: number, steepness: number, wavelength: number, speed: number, x: number, z: number, time: number) {
  const k = 6.2831853 / wavelength;
  const c = Math.sqrt(9.8 / k) * speed;
  const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
  const dx = dirX / dirLen;
  const dy = dirY / dirLen;
  const f = k * (dx * x + dy * z - c * time);
  const a = steepness / k;
  
  return {
    x: dx * (a * Math.cos(f)),
    y: dy * (a * Math.cos(f)),
    z: a * Math.sin(f)
  };
}

const vertexShader = `
uniform float uTime;
varying vec2 vUv;
varying float vWaveHeight;
varying vec3 vNormal;
varying vec3 vWorldPosition;

// Gerstner wave displacement
vec3 calculateWave(vec2 dir, float steepness, float wavelength, float speed, vec2 pos, float time, inout vec3 tangent, inout vec3 binormal) {
  float k = 6.2831853 / wavelength;
  float c = sqrt(9.8 / k) * speed;
  vec2 d = normalize(dir);
  float f = k * (dot(d, pos) - c * time);
  float a = steepness / k;

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

// Wave height calculation function (same as used in shader)
float getWaveHeightAt(vec2 pos, float time) {
  vec3 tangent = vec3(1.0, 0.0, 0.0);
  vec3 binormal = vec3(0.0, 1.0, 0.0);
  
  vec3 wave1 = calculateWave(vec2(1.0, 0.3), 0.28, 38.0, 0.9, pos, time, tangent, binormal);
  vec3 wave2 = calculateWave(vec2(-0.4, 0.9), 0.22, 22.0, 1.1, pos, time, tangent, binormal);
  vec3 wave3 = calculateWave(vec2(0.6, -0.8), 0.16, 12.0, 1.4, pos, time, tangent, binormal);
  vec3 wave4 = calculateWave(vec2(-0.8, -0.3), 0.10, 6.5, 1.8, pos, time, tangent, binormal);
  
  vec3 totalDisp = wave1 + wave2 + wave3 + wave4;
  return totalDisp.z;
}

void main() {
  vUv = uv;
  vec3 p = position;
  vec2 gridPos = p.xy;

  vec3 tangent = vec3(1.0, 0.0, 0.0);
  vec3 binormal = vec3(0.0, 1.0, 0.0);

  // Combine 4 wave octaves for Arctic ocean choppiness
  vec3 wave1 = calculateWave(vec2(1.0, 0.3), 0.28, 38.0, 0.9, gridPos, uTime, tangent, binormal);
  vec3 wave2 = calculateWave(vec2(-0.4, 0.9), 0.22, 22.0, 1.1, gridPos, uTime, tangent, binormal);
  vec3 wave3 = calculateWave(vec2(0.6, -0.8), 0.16, 12.0, 1.4, gridPos, uTime, tangent, binormal);
  vec3 wave4 = calculateWave(vec2(-0.8, -0.3), 0.10, 6.5, 1.8, gridPos, uTime, tangent, binormal);

  vec3 totalDisp = wave1 + wave2 + wave3 + wave4;
  p.xy -= totalDisp.xy * 0.45;
  p.z += totalDisp.z;

  vWaveHeight = totalDisp.z;

  // Compute normal in local space then rotate to world
  vec3 localNormal = normalize(cross(binormal, tangent));
  // Since plane is rotated -PI/2 around X:
  // Local (x, y, z) -> World (x, z, -y) or through normalMatrix
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

  // Sun / Light direction
  vec3 lightDir = normalize(uSunPosition);

  // Fresnel term
  float fresnel = clamp(1.0 - dot(viewDir, normal), 0.0, 1.0);
  float fresnelFactor = pow(fresnel, 3.5);

  // Arctic Water Color Palette
  vec3 deepColor = vec3(0.03, 0.08, 0.15);     // Deep arctic navy
  vec3 shallowColor = vec3(0.09, 0.24, 0.35);  // Mid-depth blue-gray
  vec3 crestColor = vec3(0.18, 0.42, 0.52);    // Cyan crest subsurface
  vec3 skyReflection = vec3(0.55, 0.65, 0.75); // Cold sky reflection
  vec3 foamColor = vec3(0.88, 0.94, 0.98);     // White sea foam

  // Base water gradient
  float depthMix = smoothstep(-1.2, 1.5, vWaveHeight);
  vec3 waterColor = mix(deepColor, shallowColor, depthMix);
  waterColor = mix(waterColor, crestColor, smoothstep(0.4, 1.8, vWaveHeight));

  // Blend in sky reflection via Fresnel
  vec3 finalColor = mix(waterColor, skyReflection, fresnelFactor * 0.75 + 0.15);

  // Specular Sun Highlight
  vec3 halfVec = normalize(lightDir + viewDir);
  float spec = pow(max(dot(normal, halfVec), 0.0), 64.0);
  finalColor += vec3(1.0, 0.96, 0.9) * spec * 0.65;

  // Wave crest foam
  float foamMask = smoothstep(0.9, 1.8, vWaveHeight + sin(vWorldPosition.x * 2.0 + uTime * 3.0) * 0.2);
  finalColor = mix(finalColor, foamColor, foamMask * 0.7);

  // Micro-glint sparkle
  float sparkle = pow(max(0.0, sin(vWorldPosition.x * 3.5 + uTime * 2.0) * cos(vWorldPosition.z * 3.5 - uTime * 1.5)), 12.0);
  finalColor += vec3(0.9, 0.95, 1.0) * sparkle * 0.3;

  // Distance fog integration
  float dist = length(vWorldPosition - cameraPosition);
  float fogFactor = clamp((dist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  finalColor = mix(finalColor, uFogColor, fogFactor);

  gl_FragColor = vec4(finalColor, 0.96);
}
`;

export function Ocean() {
  const mesh = useRef<THREE.Mesh>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSunPosition: { value: new THREE.Vector3(40, 80, 20) },
      uFogColor: { value: new THREE.Color(0x6b7788) },
      uFogNear: { value: 60 },
      uFogFar: { value: 350 },
    }),
    []
  );

  useFrame((_, dt) => {
    const mat = mesh.current?.material as ShaderMaterial | undefined;
    if (mat?.uniforms?.uTime) mat.uniforms.uTime.value += dt;
  });

  return (
    <mesh
      ref={mesh}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.2, 0]}
      receiveShadow
    >
      <planeGeometry args={[650, 650, 200, 200]} />
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

