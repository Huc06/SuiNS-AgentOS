"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";

export interface RadialLiquidProps {
  /** Width of the component in pixels or CSS value */
  width?: number | string;
  /** Height of the component in pixels or CSS value */
  height?: number | string;
  /** Animation speed multiplier */
  speed?: number;
  /** First color in hex format */
  color1?: string;
  /** Second color in hex format */
  color2?: string;
  /** Third color in hex format */
  color3?: string;
  /** Background color in hex format (replaces black areas) */
  backgroundColor?: string;
  /** Number of circle layers to render (1-5) */
  iterations?: number;
  /** Position of the effect */
  position?: "center" | "top" | "bottom" | "left" | "right";
  /** Master opacity control (0-1) */
  overallOpacity?: number;
  /** Size of the wave distortion (0.1-5) */
  waveSize?: number;
  /** Blur/soften ring edges (0-1) */
  edgeSoftness?: number;
  /** Overall scale/zoom (0.1-5) */
  scale?: number;
  /** Rendering quality */
  quality?: "low" | "medium" | "high";
  /** Type of distortion */
  distortionType?: "lava" | "plasma";
  /** Scale of distortion pattern (0.1-10) */
  distortionScale?: number;
  /** RGB color separation effect (0-1) */
  chromaShift?: number;
  /** Enable cursor interaction for liquid movement */
  enableCursorInteraction?: boolean;
  /** Refraction strength at ring edges (0-5) */
  refractionStrength?: number;
  /** Width of the refraction zone at ring edges (0.01-0.5) */
  refractionEdgeWidth?: number;
  /** Speed of wavy refraction animation (0-5) */
  refractionWaveSpeed?: number;
  /** Frequency of refraction waves (1-30) */
  refractionWaveFrequency?: number;
  /** Fresnel intensity - edge glow effect (0-1) */
  fresnelIntensity?: number;
  /** Edge highlight brightness (0-1) */
  edgeHighlight?: number;
  /** Additional CSS classes */
  className?: string;
  /** Content to render on top of the effect */
  children?: React.ReactNode;
}

export const RadialLiquid = ({
  width = "100%",
  height = "100%",
  speed = 0.7,
  color1 = "#ffffff",
  color2 = "#000000",
  color3 = "#000000",
  backgroundColor = "#ffffff",
  iterations = 4,
  position = "bottom",
  overallOpacity = 1.0,
  waveSize = 5.0,
  edgeSoftness = 0.0,
  scale = 1.1,
  quality = "high",
  distortionType = "plasma",
  distortionScale = 0.2,
  chromaShift = 0.0,
  enableCursorInteraction = true,
  refractionStrength = 25.0,
  refractionEdgeWidth = 0.5,
  refractionWaveSpeed = 1.5,
  refractionWaveFrequency = 10.0,
  fresnelIntensity = 0.5,
  edgeHighlight = 0.5,
  className,
  children,
}: RadialLiquidProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5, targetX: 0.5, targetY: 0.5 });

  const propsRef = useRef({
    speed,
    color1,
    color2,
    color3,
    backgroundColor,
    iterations,
    position,
    overallOpacity,
    waveSize,
    edgeSoftness,
    scale,
    quality,
    distortionType,
    distortionScale,
    chromaShift,
    enableCursorInteraction,
    refractionStrength,
    refractionEdgeWidth,
    refractionWaveSpeed,
    refractionWaveFrequency,
    fresnelIntensity,
    edgeHighlight,
  });

  useEffect(() => {
    propsRef.current = {
      speed,
      color1,
      color2,
      color3,
      backgroundColor,
      iterations,
      position,
      overallOpacity,
      waveSize,
      edgeSoftness,
      scale,
      quality,
      distortionType,
      distortionScale,
      chromaShift,
      enableCursorInteraction,
      refractionStrength,
      refractionEdgeWidth,
      refractionWaveSpeed,
      refractionWaveFrequency,
      fresnelIntensity,
      edgeHighlight,
    };
  }, [
    speed,
    color1,
    color2,
    color3,
    backgroundColor,
    iterations,
    position,
    overallOpacity,
    waveSize,
    edgeSoftness,
    scale,
    quality,
    distortionType,
    distortionScale,
    chromaShift,
    enableCursorInteraction,
    refractionStrength,
    refractionEdgeWidth,
    refractionWaveSpeed,
    refractionWaveFrequency,
    fresnelIntensity,
    edgeHighlight,
  ]);

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    const container = containerRef.current;
    const canvas = canvasRef.current;
    let animationFrameId: number;

    const handleMouseMove = (e: MouseEvent) => {
      if (!propsRef.current.enableCursorInteraction) return;
      const rect = container.getBoundingClientRect();
      mouseRef.current.targetX = (e.clientX - rect.left) / rect.width;
      mouseRef.current.targetY = 1.0 - (e.clientY - rect.top) / rect.height;
    };

    const handleMouseLeave = () => {
      mouseRef.current.targetX = 0.5;
      mouseRef.current.targetY = 0.5;
    };

    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeave);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const uniforms = {
      iTime: { value: 0 },
      iResolution: { value: new THREE.Vector3(1, 1, 1) },
      uColor1: { value: new THREE.Color(color1) },
      uColor2: { value: new THREE.Color(color2) },
      uColor3: { value: new THREE.Color(color3) },
      uBackgroundColor: { value: new THREE.Color(backgroundColor) },
      uIterations: { value: iterations },
      uOffset: { value: new THREE.Vector2(0, 0) },
      uOverallOpacity: { value: overallOpacity },
      uWaveSize: { value: waveSize },
      uEdgeSoftness: { value: edgeSoftness },
      uScale: { value: scale },
      uDistortionType: { value: distortionType === "plasma" ? 1 : 0 },
      uDistortionScale: { value: distortionScale },
      uChromaShift: { value: chromaShift },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uEnableCursor: { value: enableCursorInteraction ? 1.0 : 0.0 },
      uRefractionStrength: { value: refractionStrength },
      uRefractionEdgeWidth: { value: refractionEdgeWidth },
      uRefractionWaveSpeed: { value: refractionWaveSpeed },
      uRefractionWaveFrequency: { value: refractionWaveFrequency },
      uFresnelIntensity: { value: fresnelIntensity },
      uEdgeHighlight: { value: edgeHighlight },
    };

    const vertexShader = `
      void main() {
        gl_Position = vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      precision highp float;

      uniform float iTime;
      uniform vec3 iResolution;
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform vec3 uColor3;
      uniform vec3 uBackgroundColor;
      uniform int uIterations;
      uniform vec2 uOffset;
      uniform float uOverallOpacity;
      uniform float uWaveSize;
      uniform float uEdgeSoftness;
      uniform float uScale;
      uniform int uDistortionType;
      uniform float uDistortionScale;
      uniform float uChromaShift;
      uniform vec2 uMouse;
      uniform float uEnableCursor;
      uniform float uRefractionStrength;
      uniform float uRefractionEdgeWidth;
      uniform float uRefractionWaveSpeed;
      uniform float uRefractionWaveFrequency;
      uniform float uFresnelIntensity;
      uniform float uEdgeHighlight;

      #define PI 3.14159265359

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(23.43, 54.12))) * 43758.5453);
      }

      vec3 hash3D(vec3 value) {
        vec3 scaled = value * 34.0 + 1.0;
        return mod(scaled * value, 289.0);
      }

      float simplexNoise(vec2 coord) {
        const vec4 skewConstants = vec4(
          0.211324865405187,
          0.366025403784439,
          -0.577350269189626,
          0.024390243902439
        );

        vec2 skewedCoord = coord + dot(coord, skewConstants.yy);
        vec2 cellOrigin = floor(skewedCoord);
        vec2 offset0 = coord - cellOrigin + dot(cellOrigin, skewConstants.xx);

        vec2 cornerOffset = (offset0.x > offset0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);

        vec4 offsets = offset0.xyxy + skewConstants.xxzz;
        offsets.xy -= cornerOffset;

        cellOrigin = mod(cellOrigin, 289.0);

        vec3 gradientIdx = hash3D(
          hash3D(cellOrigin.y + vec3(0.0, cornerOffset.y, 1.0)) +
          cellOrigin.x + vec3(0.0, cornerOffset.x, 1.0)
        );

        vec3 weights = max(
          0.5 - vec3(
            dot(offset0, offset0),
            dot(offsets.xy, offsets.xy),
            dot(offsets.zw, offsets.zw)
          ),
          0.0
        );
        weights = weights * weights;
        weights = weights * weights;

        vec3 gradX = 2.0 * fract(gradientIdx * skewConstants.www) - 1.0;
        vec3 gradY = abs(gradX) - 0.5;
        vec3 roundedX = floor(gradX + 0.5);
        vec3 finalGradX = gradX - roundedX;

        weights *= 1.79284291400159 - 0.85373472095314 * (finalGradX * finalGradX + gradY * gradY);

        vec3 gradients;
        gradients.x = finalGradX.x * offset0.x + gradY.x * offset0.y;
        gradients.yz = finalGradX.yz * offsets.xz + gradY.yz * offsets.yw;

        return 130.0 * dot(weights, gradients);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }

      float satinLiquid(vec2 coord, float direction, float ringIdx) {
        float n = 0.0;
        vec2 p = coord;
        float ringAngle = hash(vec2(ringIdx, 42.0)) * PI * 2.0;
        float t = iTime * 0.3 * direction;

        float cs = cos(ringAngle);
        float sn = sin(ringAngle);
        p = mat2(cs, -sn, sn, cs) * p;

        float n1 = noise(p * 1.5 + t * 0.2);
        p = p * 0.65 + vec2(n1 * 0.5);
        n += noise(p + t * 0.15) * 2.0;

        float n2 = noise(p * 1.2 + t * 0.15);
        p = p * 0.65 + vec2(n2 * 0.3, -n2 * 0.3);
        n += noise(p + t * 0.1) * 1.5;

        return n;
      }

      float plasma(vec2 coord, float direction, float ringIdx) {
        float ringAngle = hash(vec2(ringIdx, 123.0)) * PI * 2.0;
        float cs = cos(ringAngle);
        float sn = sin(ringAngle);
        coord = mat2(cs, -sn, sn, cs) * coord;

        float t = iTime * 0.3 * direction;
        vec2 scaledUV = coord * 0.5;

        float s1 = simplexNoise(scaledUV + t * 0.2);
        float s2 = simplexNoise(scaledUV * 1.5 + t * 0.15 + s1 * 0.15);

        float result = s1 + s2 * 0.7;
        return result * 1.4;
      }

      void mainImage(out vec4 fragColor, in vec2 fragCoord) {
        vec2 coord = 12.0 * (fragCoord.xy - iResolution.xy * 0.5) / min(iResolution.x, iResolution.y);
        coord = coord / uScale - uOffset * 6.0;

        float coordLen = length(coord);
        vec2 radialDir = coord / max(coordLen, 0.001);

        float adjustedFreq = 1.5 / max(0.1, uScale);
        float ringPhase = coordLen * adjustedFreq + PI;
        float circle = sin(ringPhase);

        float ringIdx = floor((ringPhase - PI) / PI);

        vec2 refractionOffset = vec2(0.0);
        float edgeGlow = 0.0;

        if (uRefractionStrength > 0.001) {
          float phaseInRing = mod(ringPhase, PI);

          float innerEdgeDist = phaseInRing / PI;
          float outerEdgeDist = 1.0 - innerEdgeDist;

          float edgeWidth = uRefractionEdgeWidth;

          if (innerEdgeDist < edgeWidth) {
            float t = 1.0 - innerEdgeDist / edgeWidth;
            float curve = t * t * t;
            float waveOffset = sin(coordLen * uRefractionWaveFrequency + iTime * uRefractionWaveSpeed) * 0.3;
            refractionOffset = -radialDir * curve * uRefractionStrength * 0.15 * (1.0 + waveOffset);
            edgeGlow = max(edgeGlow, curve);
          }

          if (outerEdgeDist < edgeWidth) {
            float t = 1.0 - outerEdgeDist / edgeWidth;
            float curve = t * t * t;
            float waveOffset = sin(coordLen * uRefractionWaveFrequency + iTime * uRefractionWaveSpeed + PI) * 0.3;
            refractionOffset = radialDir * curve * uRefractionStrength * 0.15 * (1.0 + waveOffset);
            edgeGlow = max(edgeGlow, curve);
          }
        }

        vec2 refractedCoord = coord + refractionOffset;
        float refractedLen = length(refractedCoord);

        float aaWidth = fwidth(ringPhase) * 0.5;
        float edgeRange = 0.1 + uEdgeSoftness * 0.3 + aaWidth;
        float edgeMin = 0.1 - aaWidth;
        float edgeMax = 0.1 + edgeRange;
        float circleMask = 1.0 - smoothstep(edgeMin, edgeMax, circle);
        float circleMask2 = smoothstep(edgeMin, edgeMax, circle);

        float maxPhase = (float(uIterations) + 1.0) * PI;
        float maxRadius = (maxPhase - PI) / adjustedFreq;
        float radiusAA = fwidth(coordLen) * 0.5;
        float distanceMask = 1.0 - smoothstep(maxRadius - 0.2 - radiusAA, maxRadius + radiusAA, coordLen);

        vec2 scaledCoord = refractedCoord * uDistortionScale;
        vec2 cursorOffset = vec2(0.0);
        if (uEnableCursor > 0.5) {
          cursorOffset = (uMouse - 0.5) * 2.0;
        }

        float dist1, dist2;

        if (uDistortionType == 0) {
          dist1 = satinLiquid(scaledCoord + cursorOffset, -1.0, ringIdx);
          dist2 = satinLiquid(scaledCoord + cursorOffset, 1.0, ringIdx);
        } else {
          dist1 = plasma(scaledCoord + cursorOffset, -1.0, ringIdx);
          dist2 = plasma(scaledCoord + cursorOffset, 1.0, ringIdx);
        }

        float fx = (dist1 * circleMask + dist2 * circleMask2) * uWaveSize;

        float fxX = dFdx(fx);
        float fxY = dFdy(fx);
        vec3 N = normalize(vec3(-fxX * 8.0, -fxY * 8.0, 0.3));
        vec3 L = normalize(vec3(0.4, 0.7, 1.0));
        vec3 V = normalize(vec3(0.6, 0.4, 1.0));
        vec3 H = normalize(L + V);

        float hn = max(dot(H, N), 0.0);
        float sheen = pow(hn, 12.0) * 0.6;
        float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.5) * 0.3;
        float lighting = sheen + fresnel;

        float colorMix1 = sin(fx * 0.5 + refractedLen * 0.3) * 0.5 + 0.5;
        float colorMix2 = cos(fx * 0.3 - refractedLen * 0.2 + iTime * 0.2) * 0.5 + 0.5;

        vec3 color = mix(uColor1, uColor2, colorMix1);
        color = mix(color, uColor3, colorMix2 * 0.6);

        color = mix(color, vec3(1.0), lighting * 0.4);

        if (uChromaShift > 0.01) {
          float chromaOffset = uChromaShift * 0.3;
          float mixR = sin((fx + chromaOffset) * 0.5 + refractedLen * 0.3) * 0.5 + 0.5;
          float mixB = cos((fx - chromaOffset) * 0.3 - refractedLen * 0.2) * 0.5 + 0.5;

          color.r = mix(color.r, mix(uColor1.r, uColor2.r, mixR), uChromaShift * 0.5);
          color.b = mix(color.b, mix(uColor2.b, uColor3.b, mixB), uChromaShift * 0.5);
        }

        if (uFresnelIntensity > 0.001) {
          float fresnelGlow = edgeGlow * uFresnelIntensity;
          vec3 glowColor = mix(uColor1, uColor2, 0.5);
          color += glowColor * fresnelGlow * 0.5;
        }

        if (uEdgeHighlight > 0.001) {
          color += vec3(1.0) * edgeGlow * uEdgeHighlight;
        }

        float alpha = uOverallOpacity * distanceMask;

        fragColor = vec4(color, alpha);
      }

      void main() {
        vec4 color = vec4(0.0);
        mainImage(color, gl_FragCoord.xy);
        gl_FragColor = color;
      }
    `;

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const resize = () => {
      if (!container || !canvas) return;
      const { width, height } = container.getBoundingClientRect();
      const { quality, position } = propsRef.current;

      let qualityMultiplier = 1.0;
      if (quality === "low") qualityMultiplier = 0.5;
      else if (quality === "medium") qualityMultiplier = 0.75;

      const pixelRatio = Math.min(
        window.devicePixelRatio * qualityMultiplier,
        2,
      );

      renderer.setSize(width, height, false);
      renderer.setPixelRatio(pixelRatio);

      const bufferWidth = width * pixelRatio;
      const bufferHeight = height * pixelRatio;
      uniforms.iResolution.value.set(bufferWidth, bufferHeight, 1.0);

      let offsetX = 0.0;
      let offsetY = 0.0;
      if (position === "top") {
        offsetY = Math.max(1.0, height / width);
      } else if (position === "bottom") {
        offsetY = -Math.max(1.0, height / width);
      } else if (position === "left") {
        offsetX = -Math.max(1.0, width / height);
      } else if (position === "right") {
        offsetX = Math.max(1.0, width / height);
      }
      uniforms.uOffset.value.set(offsetX, offsetY);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const startTime = performance.now();
    let lastTime = startTime;

    const render = (time: number) => {
      if (time - lastTime < 16) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }
      lastTime = time;

      const {
        speed,
        color1,
        color2,
        color3,
        backgroundColor,
        iterations,
        overallOpacity,
        waveSize,
        edgeSoftness,
        scale,
        distortionType,
        distortionScale,
        chromaShift,
        enableCursorInteraction,
        refractionStrength,
        refractionEdgeWidth,
        refractionWaveSpeed,
        refractionWaveFrequency,
        fresnelIntensity,
        edgeHighlight,
      } = propsRef.current;

      const lerpFactor = 0.05;
      mouseRef.current.x +=
        (mouseRef.current.targetX - mouseRef.current.x) * lerpFactor;
      mouseRef.current.y +=
        (mouseRef.current.targetY - mouseRef.current.y) * lerpFactor;

      const elapsed = (time - startTime) * 0.001 * speed;
      uniforms.iTime.value = elapsed;

      uniforms.uColor1.value.set(color1);
      uniforms.uColor2.value.set(color2);
      uniforms.uColor3.value.set(color3);
      uniforms.uBackgroundColor.value.set(backgroundColor);
      uniforms.uIterations.value = iterations;
      uniforms.uOverallOpacity.value = overallOpacity;
      uniforms.uWaveSize.value = waveSize;
      uniforms.uEdgeSoftness.value = edgeSoftness;
      uniforms.uScale.value = scale;
      uniforms.uDistortionType.value = distortionType === "lava" ? 0 : 1;
      uniforms.uDistortionScale.value = distortionScale;
      uniforms.uChromaShift.value = chromaShift;
      uniforms.uMouse.value.set(mouseRef.current.x, mouseRef.current.y);
      uniforms.uEnableCursor.value = enableCursorInteraction ? 1.0 : 0.0;
      uniforms.uRefractionStrength.value = refractionStrength;
      uniforms.uRefractionEdgeWidth.value = refractionEdgeWidth;
      uniforms.uRefractionWaveSpeed.value = refractionWaveSpeed;
      uniforms.uRefractionWaveFrequency.value = refractionWaveFrequency;
      uniforms.uFresnelIntensity.value = fresnelIntensity;
      uniforms.uEdgeHighlight.value = edgeHighlight;

      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, [quality]);

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden", className)}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
        backgroundColor: backgroundColor,
      }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block w-full h-full"
      />
      {children && (
        <div className="relative z-10 w-full h-full pointer-events-none">
          {children}
        </div>
      )}
    </div>
  );
};

export default RadialLiquid;
