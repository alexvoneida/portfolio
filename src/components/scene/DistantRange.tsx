"use client";

import { useMemo } from "react";
import * as THREE from "three";

import { TERRAIN } from "@/lib/terrain";
import { rangeFragmentShader, rangeVertexShader, skyFragmentShader } from "./shaders";

/**
 * The heightmap simply stops at its far edge, so without these the traverse
 * ends looking into empty sky. Four flats standing beyond the valley, each
 * wider, taller and paler than the last, close the horizon and give the end of
 * the scroll somewhere to arrive.
 *
 * Flats rather than geometry: the camera only ever travels down the valley and
 * barely rotates, so there is no angle from which the trick is visible, and the
 * whole backdrop costs eight triangles.
 */
const FAR_EDGE = TERRAIN.zNear - TERRAIN.depth;

// Aerial perspective in reverse order of distance: the farthest range is the
// palest thing in the frame, which is what sells the depth.
// `near` is the base, `far` the crest. Haze pools at the foot of a range, so
// each is lighter at the bottom, and every range sits above the sky value so
// its silhouette separates instead of disappearing into it. Later layers are
// lighter overall, which is the whole of aerial perspective.
const LAYERS = [
  { z: FAR_EDGE - 120, width: 3200, height: 900, seed: 1.7, rough: 0.55, near: "#2a3324", far: "#1c2417" },
  { z: FAR_EDGE - 620, width: 4400, height: 1200, seed: 4.3, rough: 0.4, near: "#333d2b", far: "#232c1d" },
  { z: FAR_EDGE - 1300, width: 6000, height: 1600, seed: 8.1, rough: 0.3, near: "#3e4935", far: "#2b3524" },
  { z: FAR_EDGE - 2200, width: 8000, height: 2000, seed: 12.9, rough: 0.2, near: "#4a5640", far: "#35402d" },
];

/** Below the valley floor, so the terrain always occludes the ranges' feet. */
const RANGE_BASE = -60;

function Range({ layer }: { layer: (typeof LAYERS)[number] }) {
  const uniforms = useMemo(
    () => ({
      uNear: { value: new THREE.Color(layer.near) },
      uFar: { value: new THREE.Color(layer.far) },
      uSeed: { value: layer.seed },
      uRough: { value: layer.rough },
    }),
    [layer],
  );

  return (
    <mesh position={[0, RANGE_BASE + layer.height / 2, layer.z]} frustumCulled={false}>
      <planeGeometry args={[layer.width, layer.height]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={rangeVertexShader}
        fragmentShader={rangeFragmentShader}
        // Written into the depth buffer normally so the near valley walls still
        // occlude the ranges as the camera passes between them.
        depthWrite
      />
    </mesh>
  );
}

function Sky() {
  const uniforms = useMemo(
    () => ({
      uHorizon: { value: new THREE.Color("#10160e") },
      uZenith: { value: new THREE.Color("#050505") },
    }),
    [],
  );

  // Positioned so its lower edge sits just under the horizon line, which puts
  // the whole gradient in the part of the sky the camera can actually see.
  return (
    <mesh position={[0, 2040, FAR_EDGE - 3000]} frustumCulled={false}>
      <planeGeometry args={[14000, 4200]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={rangeVertexShader}
        fragmentShader={skyFragmentShader}
        depthWrite={false}
      />
    </mesh>
  );
}

export default function DistantRange() {
  return (
    <>
      <Sky />
      {LAYERS.map((layer) => (
        <Range key={layer.z} layer={layer} />
      ))}
    </>
  );
}
