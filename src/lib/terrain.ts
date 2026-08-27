import { createNoise2D } from "simplex-noise";

export const TERRAIN = {
  width: 900,
  /**
   * Mesh extent. Deliberately longer than the traverse: if the geometry ended
   * where the camera stops, the valley walls would be cut off mid-frame at the
   * end of the scroll and the ranges would sit in the gap.
   */
  depth: 2900,
  /** Distance the camera actually covers, from t=0 to t=1. */
  traverse: 1680,
  /** World z of the near edge; the far edge is `zNear - depth`. */
  zNear: 200,
  segmentsX: 150,
  segmentsZ: 430,
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

/** World-space z for a given progress along the flight, 0 at the near edge. */
export function zAtProgress(t: number) {
  return TERRAIN.zNear - 120 - t * TERRAIN.traverse;
}

export function flightPointAt(t: number): [number, number, number] {
  const z = zAtProgress(t);
  return [valleyCenterX(z), TERRAIN.flightHeight, z];
}

/**
 * Tarns along the valley floor, authored against flight progress so they can be
 * spaced between the sections rather than by eye in world coordinates.
 *
 * All on the west side, because the footpath runs up the east side and a trail
 * that walks into a pond is worse than one that passes it. `offset` is far
 * enough out to be off the route and clear of the channel, but not up on the
 * shoulders: water dug into a slope is hidden behind its own near rim from a
 * camera flying only fifty units above it, which is a thing you cannot see in a
 * screenshot of somewhere the tarn is not.
 */
const TARNS = [
  { t: 0.12, offset: -128, radius: 34, depth: 6 },
  { t: 0.30, offset: -142, radius: 30, depth: 5 },
  { t: 0.46, offset: -134, radius: 36, depth: 7 },
  { t: 0.62, offset: -150, radius: 31, depth: 5 },
  { t: 0.79, offset: -126, radius: 35, depth: 6 },
  { t: 0.93, offset: -138, radius: 32, depth: 6 },
].map(({ t, offset, radius, depth }) => {
  const z = zAtProgress(t);
  return { x: valleyCenterX(z) + offset, z, radius, bed: WATER_LEVEL - depth };
});

/** Centre and radius of each tarn, for the water shader to still its surface. */
export const TARN_DISCS = TARNS.map(({ x, z, radius }) => [x, z, radius] as const);

/** Shoreline sits just clear of the water, so a tarn has a beach, not a kerb. */
const TARN_SHORE = WATER_LEVEL + 1.5;

/**
 * Carves a tarn in two stages: a long shallow apron down to a shore just above
 * the water line, then the bed below it.
 *
 * The apron is the part that matters and the reason a single blend is not
 * enough. The camera flies about fifty units above the water, so its sightline
 * into a tarn two hundred units away descends at only ten or so degrees; any
 * bank steeper than that hides the surface behind itself, and the tarn is
 * carved perfectly and visible from nowhere.
 */
function withTarns(height: number, x: number, z: number) {
  for (const tarn of TARNS) {
    const distance = Math.hypot(x - tarn.x, z - tarn.z) / tarn.radius;
    if (distance >= 1.7) continue;
    const apron = 1 - smoothstep(0.75, 1.7, distance);
    let carved = height * (1 - apron) + TARN_SHORE * apron;
    const pan = 1 - smoothstep(0.2, 0.75, distance);
    carved = carved * (1 - pan) + tarn.bed * pan;
    height = carved;
  }
  return height;
}

/**
 * A footpath contouring along one side of the valley. Analytic rather than
 * baked, because the terrain shader has to draw the same line the placement
 * pass keeps foliage off — a texture or a spline would have to be shared
 * between the CPU and the GPU, where two identical expressions do not.
 */
export function trailCenterX(z: number) {
  return valleyCenterX(z) + 118 + Math.sin(z * 0.017) * 27 + Math.sin(z * 0.006 + 2.1) * 41;
}

/** Half-width, breathing along the path so it narrows and opens like a real one. */
export function trailHalfAt(z: number) {
  return 2.6 * (0.72 + 0.28 * Math.sin(z * 0.009));
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

  const surface = crest * TERRAIN.peakHeight * wall + floorDetail * (1 - wall) - 6 - bed;
  return withTarns(surface, x, z);
}

/**
 * Surface steepness at a point, 0 flat to 1 vertical. Used to keep scattered
 * foliage off cliff faces, where instances would stick out at right angles to
 * the ground.
 *
 * Forward differences against a height the caller already has, rather than
 * central differences: this runs once per scatter attempt across tens of
 * thousands of them, and halving the samples halves the cost of the whole
 * placement pass. The extra accuracy of a centred gradient buys nothing for
 * what is only ever a threshold test.
 */
export function slopeAt(x: number, z: number, height: number, step = 4) {
  const dx = heightAt(x + step, z) - height;
  const dz = heightAt(x, z + step) - height;
  const gradient = Math.hypot(dx, dz) / step;
  return gradient / Math.hypot(gradient, 1);
}

