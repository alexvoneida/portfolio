import { createNoise2D } from "simplex-noise";

export const TERRAIN = {
  width: 900,
  depth: 2000,
  /** World z of the near edge; the far edge is `zNear - depth`. */
  zNear: 200,
  segmentsX: 150,
  segmentsZ: 300,
  /** Camera height above the valley floor. */
  flightHeight: 40,
  /** Half-width of the flat corridor the camera flies down. */
  valleyHalf: 95,
  /** Distance over which the walls rise from the corridor edge to full height. */
  valleyFalloff: 200,
  peakHeight: 200,
  /** Half-width of the river channel cut along the valley centreline. */
  channelHalf: 30,
  channelDepth: 10,
} as const;

/**
 * The river surface. Sits above the channel bed but below the surrounding
 * floor, so water appears exactly where the channel was carved and nowhere
 * else — no separate river mesh to keep in sync with the terrain.
 */
export const WATER_LEVEL = -12;

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const noise2D = createNoise2D(mulberry32(20270517));

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Ridged multifractal: inverting and squaring each octave turns simplex's smooth
 * blobs into sharp crests, which is what makes this read as mountains rather
 * than dunes.
 */
function ridged(x: number, z: number, octaves = 5) {
  let sum = 0;
  let norm = 0;
  let amp = 1;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise2D(x * freq, z * freq));
    sum += n * n * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

/** The valley meanders so the flight path curves instead of running dead straight. */
export function valleyCenterX(z: number) {
  return Math.sin(z * 0.0045) * 70 + Math.sin(z * 0.0013 + 1.7) * 110;
}

export function heightAt(x: number, z: number) {
  const distanceFromCenter = Math.abs(x - valleyCenterX(z));
  const wall = smoothstep(TERRAIN.valleyHalf, TERRAIN.valleyHalf + TERRAIN.valleyFalloff, distanceFromCenter);
  const crest = ridged(x * 0.0042, z * 0.0042);
  const floorDetail = noise2D(x * 0.02, z * 0.02) * 5;

  // The channel follows the same meander as the flight path, so the camera
  // travels along the river rather than across it.
  const channel = 1 - smoothstep(0, TERRAIN.channelHalf, distanceFromCenter);
  const bed = channel * channel * TERRAIN.channelDepth;

  return crest * TERRAIN.peakHeight * wall + floorDetail * (1 - wall) - 6 - bed;
}

/**
 * Surface steepness at a point, 0 flat to 1 vertical. Used to keep scattered
 * foliage off cliff faces, where instances would stick out at right angles to
 * the ground.
 */
export function slopeAt(x: number, z: number, step = 4) {
  const dx = heightAt(x + step, z) - heightAt(x - step, z);
  const dz = heightAt(x, z + step) - heightAt(x, z - step);
  const gradient = Math.hypot(dx, dz) / (2 * step);
  return gradient / Math.hypot(gradient, 1);
}

/** World-space z for a given progress along the flight, 0 at the near edge. */
export function zAtProgress(t: number) {
  return TERRAIN.zNear - 120 - t * (TERRAIN.depth - 320);
}

export function flightPointAt(t: number): [number, number, number] {
  const z = zAtProgress(t);
  return [valleyCenterX(z), TERRAIN.flightHeight, z];
}
