"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
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
  /** Background fill. `lightBackground` is kept for API compat; `darkBackground` wins when both are set. */
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

/**
 * Morphing squircle shader, rendered with RAW three.js (no @react-three/fiber)
 * so it stays compatible with the app's React/Next version — mirroring the
 * RadialLiquid / Portal components. All WebGL work runs inside useEffect.
 */
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
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const backgroundColor = darkBackground ?? lightBackground;

  // Latest prop values for the render loop without re-initializing WebGL.
  const propsRef = useRef({
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
  });
  propsRef.current = {
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
  };

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let animationFrameId: number;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const uniforms = {
      u_time: { value: 0 },
      u_resolution: { value: new THREE.Vector2(1, 1) },
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
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
    });
    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const resize = () => {
      const { width: w, height: h } = container.getBoundingClientRect();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h, false);
      uniforms.u_resolution.value.set(
        Math.max(1, w),
        Math.max(1, h),
      );
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const start = performance.now();
    const render = (now: number) => {
      const p = propsRef.current;
      uniforms.u_time.value = (now - start) * 0.001;
      uniforms.u_speed.value = p.speed;
      uniforms.u_colorLayers.value = p.colorLayers;
      uniforms.u_gridFrequency.value = p.gridFrequency;
      uniforms.u_gridIntensity.value = p.gridIntensity;
      uniforms.u_waveSpeed.value = p.waveSpeed;
      uniforms.u_waveIntensity.value = p.waveIntensity;
      uniforms.u_spiralIntensity.value = p.spiralIntensity;
      uniforms.u_lineThickness.value = p.lineThickness;
      uniforms.u_falloff.value = p.falloff;
      uniforms.u_centerX.value = p.centerX;
      uniforms.u_centerY.value = p.centerY;
      uniforms.u_colorTint.value.set(p.colorTint);
      uniforms.u_backgroundColor.value.set(p.backgroundColor);
      uniforms.u_brightness.value = p.brightness;
      uniforms.u_phaseOffset.value = p.phaseOffset;
      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(render);
    };
    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const widthStyle = typeof width === "number" ? `${width}px` : width;
  const heightStyle = typeof height === "number" ? `${height}px` : height;

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden", className)}
      style={{ width: widthStyle, height: heightStyle, backgroundColor }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
    </div>
  );
};

SquircleShift.displayName = "SquircleShift";

export default SquircleShift;
