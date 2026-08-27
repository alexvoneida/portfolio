"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import type { SceneQuality } from "@/lib/capabilities";
import {
  TERRAIN,
  WATER_LEVEL,
  flightPointAt,
  heightAt,
  mulberry32,
  slopeAt,
} from "@/lib/terrain";
import { spotlightUniforms, syncSpotlight, type SpotlightUniforms } from "./sceneState";
import {
  grassFragmentShader,
  grassVertexShader,
  treeFragmentShader,
  treeVertexShader,
} from "./shaders";

type Placement = { matrices: Float32Array; tints: Float32Array; count: number };

/**
 * A pair of crossed, upright quads. Tapered to a point in the vertex shader, so
 * the blade silhouette needs no alpha texture, and crossed so a tuft reads from
 * any direction without billboarding.
 */
function makeTuftGeometry() {
  const geometry = new THREE.BufferGeometry();
  const half = 0.5;
  const positions = new Float32Array([
    -half, 0, 0, half, 0, 0, half, 1, 0, -half, 1, 0,
    0, 0, -half, 0, 0, half, 0, 1, half, 0, 1, -half,
  ]);
  const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  return geometry;
}

/**
 * Scatters instances along the flight path. Placement is rejected rather than
 * projected: it is cheaper to throw away a bad sample than to find the nearest
 * good one, and the corridor is wide enough that acceptance stays high.
 */
function scatter(
  count: number,
  seed: number,
  accept: (x: number, z: number, height: number) => boolean,
  transform: (
    random: () => number,
    x: number,
    z: number,
    height: number,
    matrix: THREE.Matrix4,
    tint: THREE.Vector3,
  ) => void,
): Placement {
  const random = mulberry32(seed);
  const matrices = new Float32Array(count * 16);
  const tints = new Float32Array(count * 3);
  const matrix = new THREE.Matrix4();
  const tint = new THREE.Vector3();

  let placed = 0;
  let attempts = 0;
  const limit = count * 24;

  while (placed < count && attempts < limit) {
    attempts++;
    const t = random();
    const [pathX, , z] = flightPointAt(t);
    const x = pathX + (random() - 0.5) * TERRAIN.width * 0.55;
    const height = heightAt(x, z);
    if (!accept(x, z, height)) continue;

    transform(random, x, z, height, matrix, tint);
    matrix.toArray(matrices, placed * 16);
    tints[placed * 3] = tint.x;
    tints[placed * 3 + 1] = tint.y;
    tints[placed * 3 + 2] = tint.z;
    placed++;
  }

  return { matrices, tints, count: placed };
}

function useInstances(placement: Placement, geometry: THREE.BufferGeometry) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const instanced = mesh.current;
    if (!instanced) return;
    instanced.instanceMatrix.array.set(placement.matrices.subarray(0, placement.count * 16));
    instanced.instanceMatrix.needsUpdate = true;
    instanced.count = placement.count;
  }, [placement]);

  useEffect(() => {
    geometry.setAttribute(
      "tint",
      new THREE.InstancedBufferAttribute(placement.tints.subarray(0, placement.count * 3), 3),
    );
  }, [geometry, placement]);

  return mesh;
}

const scratchPosition = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchScale = new THREE.Vector3();
const upAxis = new THREE.Vector3(0, 1, 0);

export function Grass({
  quality,
  base,
  tip,
  haze,
}: {
  quality: SceneQuality;
  base: THREE.Color;
  tip: THREE.Color;
  haze: THREE.Color;
}) {
  const geometry = useMemo(() => makeTuftGeometry(), []);
  const material = useRef<THREE.ShaderMaterial>(null);

  const placement = useMemo(
    () =>
      scatter(
        quality === "low" ? 4500 : 12000,
        0x9c455,
        // Off the cliffs and out of the river; a tuft standing in the water or
        // jutting sideways off a rock face reads as a bug.
        (x, z, height) => height > WATER_LEVEL + 1.5 && slopeAt(x, z) < 0.55,
        (random, x, z, height, matrix, tint) => {
          scratchPosition.set(x, height, z);
          scratchQuaternion.setFromAxisAngle(upAxis, random() * Math.PI);
          // Small and dense. At this camera height taller blades stop reading as
          // ground cover and start reading as individual spikes.
          const blade = 1.1 + random() * 1.5;
          scratchScale.set(0.5 + random() * 0.35, blade, 0.5 + random() * 0.35);
          matrix.compose(scratchPosition, scratchQuaternion, scratchScale);
          const variation = 0.6 + random() * 0.55;
          tint.set(variation, variation * (0.94 + random() * 0.14), variation * 0.8);
        },
      ),
    [quality],
  );

  const mesh = useInstances(placement, geometry);

  const uniforms = useMemo(
    () => ({
      ...spotlightUniforms(),
      uBase: { value: base },
      uTip: { value: tip },
      uHaze: { value: haze },
      uTime: { value: 0 },
    }),
    [base, tip, haze],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ clock }) => {
    const live = material.current?.uniforms;
    if (!live) return;
    syncSpotlight(live as unknown as SpotlightUniforms);
    live.uTime.value = clock.elapsedTime;
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, Math.max(placement.count, 1)]}
      geometry={geometry}
      frustumCulled={false}
    >
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={grassVertexShader}
        fragmentShader={grassFragmentShader}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
}

export function Trees({
  quality,
  canopy,
  haze,
}: {
  quality: SceneQuality;
  canopy: THREE.Color;
  haze: THREE.Color;
}) {
  const geometry = useMemo(() => new THREE.ConeGeometry(1, 1, 7, 1), []);
  const material = useRef<THREE.ShaderMaterial>(null);

  const placement = useMemo(
    () =>
      scatter(
        quality === "low" ? 600 : 1800,
        0x7ee5,
        // A tree line: above the valley floor, below the bare rock, and off the
        // steepest faces.
        (x, z, height) =>
          height > WATER_LEVEL + 6 &&
          height > 4 &&
          height < TERRAIN.peakHeight * 0.42 &&
          slopeAt(x, z) < 0.62,
        (random, x, z, height, matrix, tint) => {
          const trunk = 7 + random() * 9;
          // Cone geometry is centred on its own height, so it must be lifted by
          // half or every tree sinks to its waist.
          scratchPosition.set(x, height + trunk / 2, z);
          scratchQuaternion.setFromAxisAngle(upAxis, random() * Math.PI);
          scratchScale.set(trunk * 0.28, trunk, trunk * 0.28);
          matrix.compose(scratchPosition, scratchQuaternion, scratchScale);
          const variation = 0.7 + random() * 0.55;
          tint.set(variation * 0.9, variation, variation * 0.78);
        },
      ),
    [quality],
  );

  const mesh = useInstances(placement, geometry);

  const uniforms = useMemo(
    () => ({
      ...spotlightUniforms(),
      uCanopy: { value: canopy },
      uHaze: { value: haze },
    }),
    [canopy, haze],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(() => {
    const live = material.current?.uniforms;
    if (live) syncSpotlight(live as unknown as SpotlightUniforms);
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, Math.max(placement.count, 1)]}
      geometry={geometry}
      frustumCulled={false}
    >
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={treeVertexShader}
        fragmentShader={treeFragmentShader}
      />
    </instancedMesh>
  );
}
