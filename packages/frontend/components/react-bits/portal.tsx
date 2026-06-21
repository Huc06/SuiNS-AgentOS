"use client";

import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import * as THREE from "three";

export interface PortalProps {
  className?: string;
  primaryColor?: string;
  secondaryColor?: string;
  centerColor?: string;
  speed?: number;
  density?: number;
  layerCount?: number;
  waveAmplitude?: number;
  waveFrequency?: number;
  verticalDistortion?: number;
  depthIntensity?: number;
  brightness?: number;
  scale?: number;
  ballBgColor?: string;
}

export const Portal = ({
  className,
  primaryColor = "#C084FC",
  secondaryColor = "#E879F9",
  centerColor = "#F0ABFC",
  speed = 1.0,
  density = 1.0,
  layerCount = 7,
  waveAmplitude = 1.0,
  waveFrequency = 0.08,
  verticalDistortion = 0.2,
  depthIntensity = 0.2,
  brightness = 1.0,
  scale = 1.0,
  ballBgColor = "transparent",
}: PortalProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;

    container.appendChild(renderer.domElement);

    const vertexShader = `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform float uTime;
      uniform vec2 uResolution;
      uniform vec3 uPrimaryColor;
      uniform vec3 uSecondaryColor;
      uniform vec3 uCenterColor;
      uniform float uSpeed;
      uniform float uDensity;
      uniform int uLayerCount;
      uniform float uWaveAmplitude;
      uniform float uWaveFrequency;
      uniform float uVerticalDistortion;
      uniform float uDepthIntensity;
      uniform float uBrightness;
      uniform float uScale;
      uniform vec3 uBallBgColor;
      uniform float uBallBgAlpha;

      varying vec2 vUv;

      float generateParticleField(vec2 coord, float scale) {
        float timeOffset = uTime * uSpeed * 2.3;
        coord *= scale;
        coord.x += timeOffset;

        vec2 cellId = floor(coord);
        vec2 localPos = fract(coord);

        vec2 randomSeed = 0.5 + 0.35 * sin(
          11.0 * fract(
            sin((cellId + scale) * mat2(7, 3, 6, 5)) * 5.0
          )
        );

        vec2 particleOffset = randomSeed - localPos;
        float distToParticle = length(particleOffset);

        float particleIntensity = smoothstep(
          0.0,
          distToParticle,
          sin(localPos.x + localPos.y) * 0.003
        );

        return particleIntensity;
      }

      vec3 computePortalEffect(vec2 coord) {
        float depthGradient = 0.5 - length(coord);

        coord.x += sin(uTime * uWaveFrequency) * uWaveAmplitude;
        coord.y += sin(coord.x * 1.4) * uVerticalDistortion;
        coord.x *= 0.1;

        float particleSum = 0.0;

        if (uLayerCount > 0) particleSum += generateParticleField(coord, 30.0 * uDensity) * 0.3;
        if (uLayerCount > 1) particleSum += generateParticleField(coord, 20.0 * uDensity) * 0.5;
        if (uLayerCount > 2) particleSum += generateParticleField(coord, 15.0 * uDensity) * 0.8;
        if (uLayerCount > 3) particleSum += generateParticleField(coord, 10.0 * uDensity);
        if (uLayerCount > 4) particleSum += generateParticleField(coord, 8.0 * uDensity);
        if (uLayerCount > 5) particleSum += generateParticleField(coord, 6.0 * uDensity);
        if (uLayerCount > 6) particleSum += generateParticleField(coord, 5.0 * uDensity);

        particleSum *= uDepthIntensity / depthGradient;

        vec3 portalGlow = mix(uPrimaryColor, uSecondaryColor, 0.5) * particleSum * 30.0 * uBrightness;

        vec3 centerGlow = uCenterColor * 0.02 / depthGradient;

        return portalGlow + centerGlow;
      }

      void main() {
        vec2 coord = (vUv - 0.5) * 2.0;
        coord.x *= uResolution.x / uResolution.y;

        coord /= uScale;

        vec3 portalColor = computePortalEffect(coord);

        float distFromCenter = length(coord);

        float ballRadius = 0.5;
        float ballMaskHard = step(distFromCenter, ballRadius);

        float edgeWidth = fwidth(distFromCenter) * 0.5;
        float ballMaskSoft = smoothstep(ballRadius + edgeWidth, ballRadius - edgeWidth, distFromCenter);

        float portalBrightness = length(portalColor);

        float brightnessThreshold = 0.5;
        float showPortal = smoothstep(brightnessThreshold, brightnessThreshold + 0.4, portalBrightness);

        showPortal = pow(showPortal, 2.0);

        showPortal *= ballMaskHard;

        vec3 finalColor = vec3(0.0);
        float finalAlpha = 0.0;

        if (uBallBgAlpha > 0.0) {
          finalColor = uBallBgColor;
          finalAlpha = ballMaskHard * uBallBgAlpha;

          finalColor = mix(finalColor, portalColor, showPortal);
          finalAlpha = max(finalAlpha, showPortal * ballMaskSoft);
        } else {
          finalColor = portalColor;
          finalAlpha = showPortal * ballMaskSoft;
        }

        gl_FragColor = vec4(finalColor, finalAlpha);
      }
    `;

    const hexToRgb = (hex: string): THREE.Vector3 => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      if (result) {
        return new THREE.Vector3(
          parseInt(result[1], 16) / 255,
          parseInt(result[2], 16) / 255,
          parseInt(result[3], 16) / 255,
        );
      }
      return new THREE.Vector3(0.7, 0.35, 0.9);
    };

    let ballBgColorVec = new THREE.Vector3(0, 0, 0);
    let ballBgAlpha = 0;

    if (ballBgColor && ballBgColor !== "transparent") {
      const rgbaMatch =
        /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/i.exec(
          ballBgColor,
        );
      if (rgbaMatch) {
        ballBgColorVec = new THREE.Vector3(
          parseInt(rgbaMatch[1]) / 255,
          parseInt(rgbaMatch[2]) / 255,
          parseInt(rgbaMatch[3]) / 255,
        );
        ballBgAlpha = rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1;
      } else {
        ballBgColorVec = hexToRgb(ballBgColor);
        ballBgAlpha = 1;
      }
    }

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uPrimaryColor: { value: hexToRgb(primaryColor) },
        uSecondaryColor: { value: hexToRgb(secondaryColor) },
        uCenterColor: { value: hexToRgb(centerColor) },
        uSpeed: { value: speed },
        uDensity: { value: density },
        uLayerCount: { value: layerCount },
        uWaveAmplitude: { value: waveAmplitude },
        uWaveFrequency: { value: waveFrequency },
        uVerticalDistortion: { value: verticalDistortion },
        uDepthIntensity: { value: depthIntensity },
        uBrightness: { value: brightness },
        uScale: { value: scale },
        uBallBgColor: { value: ballBgColorVec },
        uBallBgAlpha: { value: ballBgAlpha },
      },
      transparent: true,
    });
    materialRef.current = material;

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;

      renderer.setSize(width, height);
      material.uniforms.uResolution.value.set(width, height);
    };

    handleResize();

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    let animationId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      const elapsedTime = clock.getElapsedTime();
      material.uniforms.uTime.value = elapsedTime;

      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [
    primaryColor,
    secondaryColor,
    centerColor,
    speed,
    density,
    layerCount,
    waveAmplitude,
    waveFrequency,
    verticalDistortion,
    depthIntensity,
    brightness,
    scale,
    ballBgColor,
  ]);

  return (
    <div ref={containerRef} className={cn("absolute inset-0", className)} />
  );
};

export default Portal;
