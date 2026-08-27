"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import type { SceneQuality } from "@/lib/capabilities";
import { pointerState, watchPointer } from "@/lib/pointer";
import { scrollState, watchScroll } from "@/lib/scroll";
import { TERRAIN, flightPointAt, heightAt, mulberry32 } from "@/lib/terrain";
import { sections } from "@/content/portfolio";
import DistantRange from "./DistantRange";
import { Grass, Trees } from "./Foliage";
import Water from "./Water";
import {
  SPOTLIGHT_RADIUS,
  sceneState,
  spotlightUniforms,
  syncSpotlight,
  type SpotlightUniforms,
} from "./sceneState";
import {
  moteFragmentShader,
  moteVertexShader,
  stakeFragmentShader,
  stakeVertexShader,
  terrainFragmentShader,
  terrainVertexShader,
} from "./shaders";

/**
 * Sampled from the reference terrarium: over half that frame is near-black, the
 * moss averages a very dark olive, and only the clump tips reach chartreuse.
 * Keeping that distribution is what stops the revealed layer from reading as a
 * green filter laid over grey terrain.
 */
const PALETTE = {
  sky: new THREE.Color("#050505"),
  void: new THREE.Color("#080a06"),
  haze: new THREE.Color("#0e1109"),
  mossDeep: new THREE.Color("#14180a"),
  mossMid: new THREE.Color("#3f4a16"),
  mossLit: new THREE.Color("#7d9119"),
  mossHi: new THREE.Color("#aabe43"),
  soil: new THREE.Color("#2a1f16"),
  rockDark: new THREE.Color("#2e2719"),
  rockLit: new THREE.Color("#cfc3ad"),
  line: new THREE.Color("#e8ecd8"),
  accent: new THREE.Color("#6abc92"),
  dust: new THREE.Color("#59614a"),
  grassBase: new THREE.Color("#141d07"),
  grassTip: new THREE.Color("#63741a"),
  canopy: new THREE.Color("#1a2711"),
  waterDeep: new THREE.Color("#060d0a"),
  waterShallow: new THREE.Color("#22403a"),
  waterSheen: new THREE.Color("#cfe8d8"),
};

const MESH_Z = TERRAIN.zNear - TERRAIN.depth / 2;

function useTerrainGeometry(quality: SceneQuality) {
  return useMemo(() => {
    const divisor = quality === "low" ? 2 : 1;
    const geometry = new THREE.PlaneGeometry(
      TERRAIN.width,
      TERRAIN.depth,
      Math.round(TERRAIN.segmentsX / divisor),
      Math.round(TERRAIN.segmentsZ / divisor),
    );
    geometry.rotateX(-Math.PI / 2);

    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      // The mesh is offset in z, so heights must be sampled in world space or
      // the valley the camera follows will not line up with the geometry.
      position.setY(i, heightAt(position.getX(i), position.getZ(i) + MESH_Z));
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }, [quality]);
}

function Terrain({ quality }: { quality: SceneQuality }) {
  const geometry = useTerrainGeometry(quality);

  const uniforms = useMemo(
    () => ({
      ...spotlightUniforms(),
      uVoid: { value: PALETTE.void },
      uHaze: { value: PALETTE.haze },
      uMossDeep: { value: PALETTE.mossDeep },
      uMossMid: { value: PALETTE.mossMid },
      uMossLit: { value: PALETTE.mossLit },
      uMossHi: { value: PALETTE.mossHi },
      uSoil: { value: PALETTE.soil },
      uRockDark: { value: PALETTE.rockDark },
      uRockLit: { value: PALETTE.rockLit },
      uLine: { value: PALETTE.line },
      uPeak: { value: TERRAIN.peakHeight },
    }),
    [],
  );

  // Written through the material rather than through the memoized `uniforms`
  // object: the material is the thing actually bound to the program, and this
  // is the only reference guaranteed to be the committed one.
  const material = useRef<THREE.ShaderMaterial>(null);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(() => {
    const live = material.current?.uniforms;
    if (live) syncSpotlight(live as unknown as SpotlightUniforms);
  });

  return (
    <mesh geometry={geometry} position={[0, 0, MESH_Z]} frustumCulled={false}>
      <shaderMaterial
        ref={material}
        glslVersion={THREE.GLSL3}
        // The moss detail costs four fbm evaluations per fragment, three of
        // them just for the micro-relief normal. Phones get half the octaves.
        defines={{ DETAIL_OCTAVES: quality === "low" ? 2 : 4 }}
        uniforms={uniforms}
        vertexShader={terrainVertexShader}
        fragmentShader={terrainFragmentShader}
      />
    </mesh>
  );
}

type StakeProps = {
  point: [number, number, number];
  groundY: number;
  color: THREE.Color;
  sectionT: number;
};

/**
 * A survey stake, not a light beacon. In daylight a glowing column would read as
 * science fiction; a dark marker planted on the flank reads as a real traverse.
 */
function Stake({ point, groundY, color, sectionT }: StakeProps) {
  const ring = useRef<THREE.Mesh>(null);
  const uniforms = useMemo(
    () => ({ uColor: { value: color }, uIntensity: { value: 0 } }),
    [color],
  );

  useFrame(() => {
    // Darkens as the camera reaches this waypoint's slice of the flight, with a
    // floor so stakes further down the valley still mark the route ahead.
    const distance = Math.abs(scrollState.progress - sectionT);
    const focus = 1 - Math.min(1, distance / 0.14);
    const intensity = 0.3 + focus * 0.6;
    uniforms.uIntensity.value = intensity;
    if (ring.current) {
      ring.current.scale.setScalar(1 + focus * 0.3);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = intensity * 0.5;
    }
  });

  return (
    <group position={[point[0], groundY, point[2]]}>
      <mesh position={[0, 21, 0]}>
        <cylinderGeometry args={[0.7, 0.7, 42, 6, 1, true]} />
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={stakeVertexShader}
          fragmentShader={stakeFragmentShader}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 1.2, 0]}>
        <ringGeometry args={[7, 7.9, 40]} />
        <meshBasicMaterial color={color} transparent depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Stakes() {
  const placements = useMemo(
    () =>
      sections.map((section, index) => {
        // Set down-path of the section it marks, so it is visible ahead of the
        // camera while that section is being read rather than level with it.
        const point = flightPointAt(section.t + 0.05);
        // Alternate flanks so the route reads as a trail rather than a row of
        // posts, and stand them up the wall where they clear the valley floor.
        const offset = index % 2 === 0 ? 170 : -170;
        const x = point[0] + offset;
        const z = point[2];
        return {
          id: section.id,
          point: [x, 0, z] as [number, number, number],
          groundY: heightAt(x, z),
          color: index % 2 === 0 ? PALETTE.accent : PALETTE.line,
          sectionT: section.t,
        };
      }),
    [],
  );

  return (
    <>
      {placements.map((placement) => (
        <Stake key={placement.id} {...placement} />
      ))}
    </>
  );
}

function Motes({ quality }: { quality: SceneQuality }) {
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSize: { value: 2.0 },
      uColor: { value: PALETTE.dust },
    }),
    [],
  );

  const geometry = useMemo(() => {
    const count = quality === "low" ? 260 : 700;
    const positions = new Float32Array(count * 3);
    // Seeded rather than Math.random so the mote field is identical on every
    // mount — a re-render must not reshuffle the atmosphere.
    const random = mulberry32(0x5eed7a1);
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const [x, , z] = flightPointAt(t);
      positions[i * 3] = x + (random() - 0.5) * 320;
      positions[i * 3 + 1] = 10 + random() * 120;
      positions[i * 3 + 2] = z + (random() - 0.5) * 200;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [quality]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(({ clock }) => {
    uniforms.uTime.value = clock.elapsedTime;
  });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={moteVertexShader}
        fragmentShader={moteFragmentShader}
        transparent
        depthWrite={false}
      />
    </points>
  );
}

const lookTarget = new THREE.Vector3();

/**
 * Drives everything the rest of the scene reads: the camera along the traverse,
 * and the spotlight the terrain, water and foliage all share. Doing this in one
 * place means the four materials cannot end up a frame apart from each other.
 *
 * Runs first in the tree, so `sceneState` is already current by the time the
 * other `useFrame` callbacks copy out of it.
 */
function SceneDriver() {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const dpr = useThree((state) => state.viewport.dpr);

  const smoothed = useRef(0);
  const bank = useRef(0);
  const cursor = useRef(new THREE.Vector2());
  const revealed = useRef(0);
  const primed = useRef(false);

  useEffect(() => watchScroll(), []);
  useEffect(() => watchPointer(), []);

  useFrame(({ clock }, delta) => {
    // Exponential damping expressed against elapsed time, so the feel of the
    // easing does not change between a 60Hz and a 120Hz display.
    const ease = 1 - Math.pow(0.0006, Math.min(delta, 0.1));
    smoothed.current += (scrollState.progress - smoothed.current) * ease;

    const t = smoothed.current;
    const [x, y, z] = flightPointAt(t);
    const bob = Math.sin(clock.elapsedTime * 0.45) * 1.6;
    camera.position.set(x, y + bob, z);
    sceneState.cameraPosition.copy(camera.position);

    // Snap on the first engagement. Lerping from the origin would drag a
    // visible spotlight across the screen from the top-left corner.
    if (pointerState.engaged && !primed.current) {
      cursor.current.set(pointerState.x, pointerState.y);
      primed.current = true;
    }

    const pointerEase = 1 - Math.pow(0.0001, Math.min(delta, 0.1));
    cursor.current.x += (pointerState.x - cursor.current.x) * pointerEase;
    cursor.current.y += (pointerState.y - cursor.current.y) * pointerEase;

    const target = pointerState.engaged ? 1 : 0;
    revealed.current += (target - revealed.current) * Math.min(1, delta * 4);
    sceneState.reveal = revealed.current;

    // gl_FragCoord is measured in device pixels from the bottom-left; the
    // pointer arrives in CSS pixels from the top-left.
    sceneState.cursor.set(cursor.current.x * dpr, (size.height - cursor.current.y) * dpr);
    sceneState.radius = SPOTLIGHT_RADIUS * dpr;

    // Deliberately unclamped: the path is analytic, so looking past t=1 keeps a
    // valid heading at the very end instead of collapsing onto the camera.
    const [ax, ay, az] = flightPointAt(t + 0.04);
    lookTarget.set(ax, ay - 7, az);
    camera.lookAt(lookTarget);

    // Roll into the turns. The valley meanders, so lateral drift is a good
    // proxy for how hard the path is bending here.
    const targetBank = THREE.MathUtils.clamp((ax - x) * 0.006, -0.16, 0.16);
    bank.current += (targetBank - bank.current) * Math.min(1, delta * 3);
    camera.rotateZ(bank.current);
  });

  return null;
}

export default function TerrainScene({ quality }: { quality: SceneQuality }) {
  return (
    <Canvas
      dpr={quality === "low" ? 1 : [1, 1.75]}
      gl={{
        antialias: quality === "high",
        powerPreference: "high-performance",
      }}
      // Far enough to keep the outermost range inside the frustum from the
      // start of the traverse, where it is over 4000 units away.
      camera={{ fov: 62, near: 2, far: 9000 }}
    >
      <color attach="background" args={[PALETTE.sky.getHex()]} />
      <SceneDriver />
      <DistantRange />
      <Terrain quality={quality} />
      <Water
        deep={PALETTE.waterDeep}
        shallow={PALETTE.waterShallow}
        sheen={PALETTE.waterSheen}
        haze={PALETTE.haze}
      />
      <Trees quality={quality} canopy={PALETTE.canopy} haze={PALETTE.haze} />
      <Grass
        quality={quality}
        base={PALETTE.grassBase}
        tip={PALETTE.grassTip}
        haze={PALETTE.haze}
      />
      <Stakes />
      <Motes quality={quality} />
    </Canvas>
  );
}
