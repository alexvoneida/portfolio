"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { TERRAIN } from "@/lib/terrain";
import { sceneState } from "./sceneState";
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
// Kept dark: these sit behind everything and should read as depth, not as
// subject. `detail` fades the rock and snow out with distance, since the
// farthest range is only a few dozen pixels tall on screen.
const LAYERS = [
  { z: FAR_EDGE - 120, width: 3200, height: 900, seed: 1.7, rough: 0.55, detail: 1, near: "#12160e", far: "#0b0e08" },
  { z: FAR_EDGE - 620, width: 4400, height: 1200, seed: 4.3, rough: 0.4, detail: 0.8, near: "#161b11", far: "#0f130c" },
  { z: FAR_EDGE - 1300, width: 6000, height: 1600, seed: 8.1, rough: 0.3, detail: 0.55, near: "#1b2116", far: "#131810" },
  { z: FAR_EDGE - 2200, width: 8000, height: 2000, seed: 12.9, rough: 0.2, detail: 0.35, near: "#20261b", far: "#171c14" },
];

/** Below the valley floor, so the terrain always occludes the ranges' feet. */
const RANGE_BASE = -60;

function Range({ layer }: { layer: (typeof LAYERS)[number] }) {
  const uniforms = useMemo(
    () => ({
      uNear: { value: new THREE.Color(layer.near) },
      uFar: { value: new THREE.Color(layer.far) },
      uSnow: { value: new THREE.Color("#6c7666") },
      uSeed: { value: layer.seed },
      uRough: { value: layer.rough },
      uDetail: { value: layer.detail },
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

const SKY_WIDTH = 20000;
const SKY_HEIGHT = 12000;
/** Kept well beyond the outermost range so it never sorts in front of one. */
const SKY_DISTANCE = 6000;

function Sky() {
  const mesh = useRef<THREE.Mesh>(null);

  const uniforms = useMemo(
    () => ({
      uHorizon: { value: new THREE.Color("#040603") },
      uZenith: { value: new THREE.Color("#000002") },
      uStar: { value: new THREE.Color("#d6e1ff") },
      uMilkyCore: { value: new THREE.Color("#5b6688") },
      uMilkyEdge: { value: new THREE.Color("#222740") },
      uAspect: { value: SKY_WIDTH / SKY_HEIGHT },
    }),
    [],
  );

  // Rides with the camera. Anchored in world space the stars would slide across
  // the sky over the traverse, which reads as the sky rotating rather than as
  // the camera moving under it.
  useFrame(() => {
    if (!mesh.current) return;
    mesh.current.position.x = sceneState.cameraPosition.x;
    mesh.current.position.z = sceneState.cameraPosition.z - SKY_DISTANCE;
  });

  return (
    <mesh ref={mesh} position={[0, 2000, -SKY_DISTANCE]} frustumCulled={false}>
      <planeGeometry args={[SKY_WIDTH, SKY_HEIGHT]} />
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
