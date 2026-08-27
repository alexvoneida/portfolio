"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { TARN_DISCS, TERRAIN, WATER_LEVEL } from "@/lib/terrain";
import { spotlightUniforms, syncSpotlight, type SpotlightUniforms } from "./sceneState";
import { waterFragmentShader, waterVertexShader } from "./shaders";

const MESH_Z = TERRAIN.zNear - TERRAIN.depth / 2;

type WaterProps = {
  deep: THREE.Color;
  shallow: THREE.Color;
  sheen: THREE.Color;
  haze: THREE.Color;
};

/**
 * One flat quad at the river level spanning the whole valley. The terrain's own
 * depth decides where it is visible, so water shows up exactly in the carved
 * channel and nowhere else — there is no river mesh that could fall out of sync
 * with the heightmap.
 */
export default function Water({ deep, shallow, sheen, haze }: WaterProps) {
  const material = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      ...spotlightUniforms(),
      uDeep: { value: deep },
      uShallow: { value: shallow },
      uSheen: { value: sheen },
      uHaze: { value: haze },
      uTime: { value: 0 },
      // Packed as xz-centre and radius. A uniform array rather than a texture:
      // there are half a dozen of them and they never move.
      uTarns: { value: TARN_DISCS.map(([x, z, radius]) => new THREE.Vector3(x, z, radius)) },
    }),
    [deep, shallow, sheen, haze],
  );

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(TERRAIN.width, TERRAIN.depth, 1, 1);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ clock }) => {
    const live = material.current?.uniforms;
    if (!live) return;
    syncSpotlight(live as unknown as SpotlightUniforms);
    live.uTime.value = clock.elapsedTime;
  });

  return (
    <mesh geometry={geometry} position={[0, WATER_LEVEL, MESH_Z]} frustumCulled={false}>
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        defines={{ TARN_COUNT: TARN_DISCS.length }}
        vertexShader={waterVertexShader}
        fragmentShader={waterFragmentShader}
      />
    </mesh>
  );
}
