"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import type { SceneQuality } from "@/lib/capabilities";
import {
  TERRAIN,
  WATER_LEVEL,
  heightAt,
  mulberry32,
  slopeAt,
  trailCenterX,
  trailHalfAt,
} from "@/lib/terrain";
import { spotlightUniforms, syncSpotlight, type SpotlightUniforms } from "./sceneState";
import { signFragmentShader, signVertexShader } from "./shaders";

const POST_HEIGHT = 3.6;
const BOARD_WIDTH = 2.7;
const BOARD_HEIGHT = 1.0;

type Placement = { matrices: Float32Array; count: number };

/**
 * Markers walk the path rather than being scattered over it: a sign standing
 * ten units off the trail is litter, and rejection sampling would spend most of
 * its attempts finding that out.
 *
 * Spacing is jittered so they do not fall into a rhythm, and a marker is simply
 * skipped where the ground under it is steep, wet or under water — leaving gaps
 * in the run, which is what a real trail does.
 */
function walkTrail(spacing: number, seed: number): Placement {
  const random = mulberry32(seed);
  const matrices: number[] = [];
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);

  // Overshoots the traverse at both ends, so the path does not begin and end
  // exactly where the camera does.
  const zStart = TERRAIN.zNear - 40;
  const zEnd = zStart - TERRAIN.traverse * 1.2;

  for (let z = zStart; z > zEnd; z -= spacing * (0.7 + random() * 0.6)) {
    // Stood just off the tread rather than in it, alternating sides.
    const side = random() < 0.5 ? -1 : 1;
    const x = trailCenterX(z) + side * (trailHalfAt(z) + 0.9 + random() * 1.4);
    const height = heightAt(x, z);
    if (height < WATER_LEVEL + 2) continue;
    if (slopeAt(x, z, height) > 0.42) continue;

    position.set(x, height, z);
    // Roughly square to the path, with enough slop that they are not a
    // regiment. A marker faces the walker, so it turns with the trail.
    const heading = Math.atan2(trailCenterX(z - 12) - trailCenterX(z + 12), 24);
    quaternion.setFromAxisAngle(up, heading + (random() - 0.5) * 0.5);
    matrix.compose(position, quaternion, scale);
    matrices.push(...matrix.toArray());
  }

  return { matrices: new Float32Array(matrices), count: matrices.length / 16 };
}

function useMarkerMesh(placement: Placement) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const instanced = mesh.current;
    if (!instanced) return;
    instanced.instanceMatrix.array.set(placement.matrices);
    instanced.instanceMatrix.needsUpdate = true;
    instanced.count = placement.count;
  }, [placement]);

  return mesh;
}

/**
 * Waymarks along the footpath. Small on purpose: they are there for someone who
 * takes the spotlight off the route and follows the trail, and at this camera
 * height a marker is a couple of pixels of timber until you put the light on it.
 */
export default function TrailMarkers({
  quality,
  body,
  mark,
  haze,
}: {
  quality: SceneQuality;
  body: THREE.Color;
  mark: THREE.Color;
  haze: THREE.Color;
}) {
  const postMaterial = useRef<THREE.ShaderMaterial>(null);
  const boardMaterial = useRef<THREE.ShaderMaterial>(null);

  const placement = useMemo(
    () => walkTrail(quality === "low" ? 130 : 74, 0x3a17c),
    [quality],
  );

  // A post and a board share one placement, so the two instanced meshes cannot
  // drift apart. Both geometries are lifted off their own centre, since a box
  // is centred on its origin and these are placed by their feet.
  const postGeometry = useMemo(() => {
    const geo = new THREE.BoxGeometry(0.22, POST_HEIGHT, 0.22);
    geo.translate(0, POST_HEIGHT / 2, 0);
    return geo;
  }, []);

  const boardGeometry = useMemo(() => {
    const geo = new THREE.BoxGeometry(BOARD_WIDTH, BOARD_HEIGHT, 0.12);
    geo.translate(0, POST_HEIGHT - BOARD_HEIGHT * 0.62, 0);
    return geo;
  }, []);

  const postUniforms = useMemo(
    () => ({
      ...spotlightUniforms(),
      uBody: { value: body },
      uMark: { value: mark },
      uHaze: { value: haze },
      uBlazed: { value: 0 },
    }),
    [body, mark, haze],
  );

  const boardUniforms = useMemo(
    () => ({
      ...spotlightUniforms(),
      uBody: { value: body },
      uMark: { value: mark },
      uHaze: { value: haze },
      uBlazed: { value: 1 },
    }),
    [body, mark, haze],
  );

  const posts = useMarkerMesh(placement);
  const boards = useMarkerMesh(placement);

  useEffect(
    () => () => {
      postGeometry.dispose();
      boardGeometry.dispose();
    },
    [postGeometry, boardGeometry],
  );

  useFrame(() => {
    for (const material of [postMaterial.current, boardMaterial.current]) {
      if (material) syncSpotlight(material.uniforms as unknown as SpotlightUniforms);
    }
  });

  if (placement.count === 0) return null;

  return (
    <>
      <instancedMesh
        ref={posts}
        args={[undefined, undefined, placement.count]}
        geometry={postGeometry}
        frustumCulled={false}
      >
        <shaderMaterial
          ref={postMaterial}
          uniforms={postUniforms}
          vertexShader={signVertexShader}
          fragmentShader={signFragmentShader}
        />
      </instancedMesh>

      <instancedMesh
        ref={boards}
        args={[undefined, undefined, placement.count]}
        geometry={boardGeometry}
        frustumCulled={false}
      >
        <shaderMaterial
          ref={boardMaterial}
          uniforms={boardUniforms}
          vertexShader={signVertexShader}
          fragmentShader={signFragmentShader}
        />
      </instancedMesh>
    </>
  );
}
