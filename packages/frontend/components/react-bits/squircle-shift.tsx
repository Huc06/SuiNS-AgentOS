"use client";

import React, { useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

export interface SquircleShiftProps {
  width?: string | number;
  height?: string | number;
  className?: string;
  speed?: number;
  colorLayers?: number;
  gridFrequency?: number;
  gridIntensity?: number;
  waveSpeed?: number;
  waveIntensity?: number;
  spiralIntensity?: number;
  lineThickness?: number;
  falloff?: number;
  centerX?: number;
  centerY?: number;
  colorTint?: string;
  lightBackground?: string;
  darkBackground?: string;
  brightness?: number;
  phaseOffset?: number;
}

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
uniform float u_speed;
uniform int u_colorLayers;
uniform float u_gridFrequency;
uniform float u_gridIntensity;
uniform float u_waveSpeed;
uniform float u_waveIntensity;
uniform float u_spiralIntensity;
uniform float u_lineThickness;
uniform float u_falloff;
uniform float u_centerX;
uniform float u_centerY;
uniform vec3 u_colorTint;
uniform vec3 u_backgroundColor;
uniform float u_brightness;
uniform float u_phaseOffset;

varying vec2 vUv;

void main() {
  float animTime = u_time * u_speed;
  vec2 resolution = u_resolution;

  vec3 colorAccum = vec3(0.0);
  float dist = 0.0;
  float depth = animTime;

  for (int layer = 0; layer < 3; layer++) {
    if (layer >= u_colorLayers) break;

    vec2 normalizedPos = vUv;
    vec2 centeredPos = vUv;
    centeredPos.x *= resolution.x / resolution.y;
    centeredPos -= vec2(u_centerX, u_centerY);

    depth += 0.05;
    dist = length(centeredPos);

    float horizontalWave = sin(centeredPos.x * u_gridFrequency + depth);
    float verticalWave = cos(centeredPos.y * u_gridFrequency + depth + u_phaseOffset);
    float gridPattern = u_gridIntensity * horizontalWave * verticalWave;

    float oscillation = sin(depth) + 1.0;
    float radialPulse = abs(sin(dist * 7.0 - depth * u_waveSpeed));
    float waveDisplacement = oscillation * radialPulse * u_waveIntensity;

    normalizedPos += (centeredPos / max(dist, 0.001)) * waveDisplacement * gridPattern;
    normalizedPos = fract(normalizedPos);

    float polarAngle = atan(centeredPos.y, centeredPos.x);
    float polarRadius = dist * 2.0;
    vec2 spiralOffset = vec2(
      cos(polarAngle * polarRadius - depth),
      sin(polarAngle * polarRadius - depth)
    ) * gridPattern * u_spiralIntensity;
    normalizedPos += spiralOffset;

    vec2 gridCell = fract(normalizedPos) - 0.5;
    float intensity = u_lineThickness / length(gridCell);

    if (layer == 0) colorAccum.r = intensity;
    else if (layer == 1) colorAccum.g = intensity;
    else colorAccum.b = intensity;
  }

  colorAccum = colorAccum / (dist + u_falloff);

  colorAccum *= u_brightness;
  vec3 tintedColor = colorAccum * u_colorTint;

  float alpha = clamp(length(colorAccum) * 0.5, 0.0, 1.0);
  vec3 finalColor = mix(u_backgroundColor, tintedColor, alpha);

  gl_FragColor = vec4(finalColor, 1.0);
}
`;

interface ShaderPlaneProps {
  speed: number;
  colorLayers: number;
  gridFrequency: number;
  gridIntensity: number;
  waveSpeed: number;
  waveIntensity: number;
  spiralIntensity: number;
  lineThickness: number;
  falloff: number;
  centerX: number;
  centerY: number;
  colorTint: string;
  backgroundColor: string;
  brightness: number;
  phaseOffset: number;
}

const ShaderPlane: React.FC<ShaderPlaneProps> = ({
  speed,
  colorLayers,
  gridFrequency,
  gridIntensity,
  waveSpeed,
  waveIntensity,
  spiralIntensity,
  lineThickness,
  falloff,
  centerX,
  centerY,
  colorTint,
  backgroundColor,
  brightness,
  phaseOffset,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { viewport } = useThree();

  const uniforms = useMemo(
    () => ({
      u_time: { value: 0 },
      u_resolution: {
        value: new THREE.Vector2(viewport.width * 100, viewport.height * 100),
      },
      u_speed: { value: speed },
      u_colorLayers: { value: colorLayers },
      u_gridFrequency: { value: gridFrequency },
      u_gridIntensity: { value: gridIntensity },
      u_waveSpeed: { value: waveSpeed },
      u_waveIntensity: { value: waveIntensity },
      u_spiralIntensity: { value: spiralIntensity },
      u_lineThickness: { value: lineThickness },
      u_falloff: { value: falloff },
      u_centerX: { value: centerX },
      u_centerY: { value: centerY },
      u_colorTint: { value: new THREE.Color(colorTint) },
      u_backgroundColor: { value: new THREE.Color(backgroundColor) },
      u_brightness: { value: brightness },
      u_phaseOffset: { value: phaseOffset },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.u_time.value = state.clock.elapsedTime;
      materialRef.current.uniforms.u_resolution.value.set(
        viewport.width * 100,
        viewport.height * 100,
      );
      materialRef.current.uniforms.u_speed.value = speed;
      materialRef.current.uniforms.u_colorLayers.value = colorLayers;
      materialRef.current.uniforms.u_gridFrequency.value = gridFrequency;
      materialRef.current.uniforms.u_gridIntensity.value = gridIntensity;
      materialRef.current.uniforms.u_waveSpeed.value = waveSpeed;
      materialRef.current.uniforms.u_waveIntensity.value = waveIntensity;
      materialRef.current.uniforms.u_spiralIntensity.value = spiralIntensity;
      materialRef.current.uniforms.u_lineThickness.value = lineThickness;
      materialRef.current.uniforms.u_falloff.value = falloff;
      materialRef.current.uniforms.u_centerX.value = centerX;
      materialRef.current.uniforms.u_centerY.value = centerY;
      materialRef.current.uniforms.u_colorTint.value.set(colorTint);
      materialRef.current.uniforms.u_backgroundColor.value.set(backgroundColor);
      materialRef.current.uniforms.u_brightness.value = brightness;
      materialRef.current.uniforms.u_phaseOffset.value = phaseOffset;
    }
  });

  return (
    <mesh ref={meshRef} scale={[viewport.width, viewport.height, 1]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
};

const SquircleShift: React.FC<SquircleShiftProps> = ({
  width = "100%",
  height = "100%",
  className = "",
  speed = 0.3,
  colorLayers = 3,
  gridFrequency = 25,
  gridIntensity = 1,
  waveSpeed = 0.2,
  waveIntensity = 0.1,
  spiralIntensity = 1,
  lineThickness = 0.06,
  falloff = 1,
  centerX = 1,
  centerY = 1,
  colorTint = "#c084fc",
  lightBackground = "#ffffff",
  darkBackground = "#000000",
  brightness = 1.5,
  phaseOffset = 10,
}) => {
  const { resolvedTheme } = useTheme();

  const backgroundColor =
    resolvedTheme === "dark" ? darkBackground : lightBackground;

  const widthStyle = typeof width === "number" ? `${width}px` : width;
  const heightStyle = typeof height === "number" ? `${height}px` : height;

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{
        width: widthStyle,
        height: heightStyle,
      }}
    >
      <Canvas
        className="absolute inset-0 h-full w-full"
        gl={{ antialias: true, alpha: false }}
        camera={{ position: [0, 0, 1], fov: 75 }}
      >
        <ShaderPlane
          speed={speed}
          colorLayers={colorLayers}
          gridFrequency={gridFrequency}
          gridIntensity={gridIntensity}
          waveSpeed={waveSpeed}
          waveIntensity={waveIntensity}
          spiralIntensity={spiralIntensity}
          lineThickness={lineThickness}
          falloff={falloff}
          centerX={centerX}
          centerY={centerY}
          colorTint={colorTint}
          backgroundColor={backgroundColor}
          brightness={brightness}
          phaseOffset={phaseOffset}
        />
      </Canvas>
    </div>
  );
};

SquircleShift.displayName = "SquircleShift";

export default SquircleShift;
