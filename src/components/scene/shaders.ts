/**
 * three applies its output colour-space conversion inside its own materials
 * only; a raw ShaderMaterial writes whatever it computes straight into an
 * sRGB-encoded drawing buffer. Since `new THREE.Color('#rrggbb')` decodes to
 * linear on the way in, skipping this leaves every shaded surface roughly
 * gamma-squared too dark.
 */
const encodeSRGB = /* glsl */ `
  vec3 toSRGB(vec3 linear) {
    return mix(
      linear * 12.92,
      1.055 * pow(max(linear, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055,
      step(vec3(0.0031308), linear)
    );
  }
`;

/**
 * Shared by every material in the scene so the spotlight lights the terrain,
 * the water and the foliage as one pool of light. Version-agnostic: uses no
 * GLSL3-only syntax, so it drops into the GLSL1 materials unchanged.
 */
export const spotlightChunk = /* glsl */ `
  uniform vec3 uCamPos;
  uniform vec2 uCursor;
  uniform float uRadius;
  uniform float uReveal;
  uniform float uBaseLight;

  /**
   * Feathered falloff: solid to 40% of the radius, then four stops out to
   * nothing, which gives a soft edge without the banding a single smoothstep
   * produces at this size. Branchless so it stays well-defined wherever it is
   * called from.
   */
  float spotlightFalloff(float d) {
    float a = mix(1.00, 0.75, clamp((d - 0.40) / 0.20, 0.0, 1.0));
    float b = mix(a, 0.40, clamp((d - 0.60) / 0.15, 0.0, 1.0));
    float c = mix(b, 0.12, clamp((d - 0.75) / 0.13, 0.0, 1.0));
    return mix(c, 0.0, clamp((d - 0.88) / 0.12, 0.0, 1.0));
  }

  /**
   * The gamma pulls the mid-falloff down so lit ground dissolves into the black
   * instead of ending on a visible arc.
   */
  float revealAt(vec2 fragCoord) {
    float d = distance(fragCoord, uCursor) / uRadius;
    return max(uBaseLight, pow(spotlightFalloff(d), 1.7) * uReveal * 0.94);
  }
`;

/** Value noise shared by the terrain and the water ripples. */
export const noiseChunk = /* glsl */ `
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
`;

// The terrain pair is authored in GLSL3 because the contour lines need fwidth,
// which is only core in GLSL ES 3.00. That means declaring the varyings and the
// colour output explicitly — three does not shim gl_FragColor for GLSL3.
export const terrainVertexShader = /* glsl */ `
  out vec3 vWorld;
  out vec3 vNrm;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorld = worldPosition.xyz;
    vNrm = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const terrainFragmentShader = /* glsl */ `
  // uCamPos and the spotlight uniforms arrive with spotlightChunk below.
  uniform vec3 uVoid;
  uniform vec3 uHaze;
  uniform vec3 uMossDeep;
  uniform vec3 uMossMid;
  uniform vec3 uMossLit;
  uniform vec3 uMossHi;
  uniform vec3 uSoil;
  uniform vec3 uRockDark;
  uniform vec3 uRockLit;
  uniform vec3 uLine;
  uniform float uPeak;

  in vec3 vWorld;
  in vec3 vNrm;

  layout(location = 0) out vec4 fragColor;

  ${encodeSRGB}
  ${spotlightChunk}
  ${noiseChunk}

  float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < DETAIL_OCTAVES; i++) {
      sum += amp * valueNoise(p);
      p *= 2.03;
      amp *= 0.5;
    }
    return sum;
  }

  void main() {
    vec3 nrm = normalize(vNrm);
    float dist = distance(vWorld, uCamPos);
    float depth = smoothstep(60.0, 900.0, dist);

    // ---- Unlit layer: what the valley looks like outside the spotlight ----
    // Nearly black, shaped only by a sky term and by haze. The reference frame
    // is over half pure black, and that restraint is what makes the revealed
    // part feel lit rather than merely brighter.
    float sky = 0.5 + 0.5 * nrm.y;
    vec3 unlit = uVoid * (0.55 + sky * 0.85);
    float valleyFog = (1.0 - smoothstep(-6.0, 100.0, vWorld.y)) * 0.35;
    float fog = clamp(pow(depth, 0.75) + valleyFog, 0.0, 1.0);
    unlit = mix(unlit, uHaze, fog);

    // ---- Living layer: the terrarium ----
    // Fine detail is faded out with distance; left on, the high-frequency
    // octaves alias into a shimmering mess across the far ridges.
    float detailFade = 1.0 - smoothstep(140.0, 620.0, dist);

    vec2 coarse = vWorld.xz * 0.07;
    vec2 fineP = vWorld.xz * 0.95;
    float mottle = fbm(coarse);
    float fine = fbm(fineP);

    // Micro-relief. Perturbing the normal by the gradient of the fine noise is
    // what separates "a green surface" from "clumps of moss catching light".
    float e = 0.6;
    float gx = fbm(fineP + vec2(e, 0.0));
    float gz = fbm(fineP + vec2(0.0, e));
    vec3 bumped = normalize(nrm + vec3(fine - gx, 0.0, fine - gz) * 2.4 * detailFade);

    float bare = smoothstep(0.80, 0.34, bumped.y);

    // Weighted hard toward the deep tone: in the reference the moss averages a
    // very dark olive and only the clump tips reach chartreuse. Spreading the
    // greens evenly is what makes procedural foliage read as a green filter.
    vec3 moss = mix(uMossDeep, uMossMid, smoothstep(0.38, 0.86, mottle));
    moss = mix(moss, uMossLit, smoothstep(0.68, 0.98, mottle) * 0.85);
    moss = mix(moss, uMossHi, smoothstep(0.74, 0.99, fine) * 0.5 * detailFade);
    // Bare soil in the hollows, so the revealed ground is not uniformly green.
    moss = mix(uSoil, moss, smoothstep(0.12, 0.44, mottle));

    vec3 rock = mix(uRockDark, uRockLit, smoothstep(0.32, 0.86, mottle));
    vec3 living = mix(moss, rock, bare);

    vec3 lightDir = normalize(vec3(0.28, 0.82, 0.5));
    float ndl = clamp(dot(bumped, lightDir), 0.0, 1.0);
    living *= 0.16 + ndl * 1.3;

    // Wet sheen. Moss in the reference is damp, and the specular is most of why
    // it reads as photographed rather than modelled.
    vec3 view = normalize(uCamPos - vWorld);
    vec3 halfVec = normalize(lightDir + view);
    float sheen = pow(clamp(dot(bumped, halfVec), 0.0, 1.0), 42.0) * (1.0 - bare) * detailFade;
    living += vec3(0.82, 1.0, 0.70) * sheen * 0.4;

    living = mix(living, uHaze, pow(depth, 0.9) * 0.88);

    // ---- Survey linework, etched over the living layer ----
    // Derivatives must be evaluated in uniform control flow, so these are
    // computed for every fragment and only used inside the reveal.
    float band = vWorld.y / 10.0;
    float edge = abs(fract(band) - 0.5) / max(fwidth(band), 1e-5);
    float indexBand = band / 5.0;
    float indexEdge = abs(fract(indexBand) - 0.5) / max(fwidth(indexBand), 1e-5);

    float contour = 1.0 - smoothstep(0.0, 1.3, edge);
    contour *= smoothstep(0.16, 0.58, nrm.y);
    contour *= smoothstep(1.0, 14.0, vWorld.y);

    float indexLine = 1.0 - smoothstep(0.0, 1.6, indexEdge);
    contour = clamp(contour + indexLine * 0.55, 0.0, 1.0);

    vec2 g = vWorld.xz / 25.0;
    vec2 gd = abs(fract(g) - 0.5) / max(fwidth(g), vec2(1e-5));
    float grid = 1.0 - smoothstep(0.0, 1.2, min(gd.x, gd.y));

    float linework = clamp(contour * 0.7 + grid * 0.35 * (1.0 - depth), 0.0, 1.0);
    // Etched rather than drawn: darkening the moss reads as survey ink pressed
    // into the ground, where bright lines on top read as a wireframe sitting
    // over it. Same information, and it keeps the greens intact.
    living = mix(living, living * 0.42, linework * 0.6);

    vec3 color = mix(unlit, living, revealAt(gl_FragCoord.xy));
    fragColor = vec4(toSRGB(color), 1.0);
  }
`;
export const stakeVertexShader = /* glsl */ `
  varying float vHeightFactor;

  void main() {
    vHeightFactor = uv.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const stakeFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;

  varying float vHeightFactor;

  ${encodeSRGB}

  void main() {
    // Solid at the ground and dissolving upward, so a stake fades into the haze
    // the way a real one would rather than ending on a hard edge.
    float falloff = pow(1.0 - vHeightFactor, 1.4);
    gl_FragColor = vec4(toSRGB(uColor), falloff * uIntensity);
  }
`;

export const moteVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uSize;

  varying float vFade;

  void main() {
    vec3 drifted = position;
    drifted.y += sin(uTime * 0.2 + position.x * 0.05) * 5.0;
    drifted.x += cos(uTime * 0.16 + position.z * 0.04) * 4.0;

    vec4 mvPosition = modelViewMatrix * vec4(drifted, 1.0);
    float dist = -mvPosition.z;
    vFade = (1.0 - smoothstep(90.0, 620.0, dist)) * smoothstep(15.0, 70.0, dist);
    gl_PointSize = uSize * (300.0 / max(dist, 1.0));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const moteFragmentShader = /* glsl */ `
  uniform vec3 uColor;

  varying float vFade;

  ${encodeSRGB}

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float alpha = (1.0 - smoothstep(0.0, 0.5, d)) * vFade;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(toSRGB(uColor), alpha * 0.5);
  }
`;

/**
 * Water is two triangles at a fixed level; all of its shape comes from the
 * fragment stage. The terrain's own depth decides where it is visible, so the
 * river appears exactly in the carved channel with no separate river mesh.
 */
export const waterVertexShader = /* glsl */ `
  varying vec3 vWorld;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorld = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const waterFragmentShader = /* glsl */ `
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uSheen;
  uniform vec3 uHaze;
  uniform float uTime;

  varying vec3 vWorld;

  ${encodeSRGB}
  ${spotlightChunk}
  ${noiseChunk}

  /** Two noise fields drifting against each other, so the surface never repeats. */
  float ripple(vec2 p) {
    return valueNoise(p + vec2(uTime * 0.07, uTime * 0.04)) * 0.6
         + valueNoise(p * 2.7 - vec2(uTime * 0.11, uTime * 0.05)) * 0.4;
  }

  void main() {
    vec2 p = vWorld.xz * 0.5;

    // Gradient of the ripple field becomes the surface normal. Sampling by hand
    // rather than with derivatives keeps the wave scale independent of how many
    // pixels the water happens to cover.
    float e = 0.35;
    float h = ripple(p);
    vec3 nrm = normalize(vec3(h - ripple(p + vec2(e, 0.0)), 0.35, h - ripple(p + vec2(0.0, e))));

    vec3 view = normalize(uCamPos - vWorld);
    vec3 lightDir = normalize(vec3(0.28, 0.82, 0.5));
    vec3 halfVec = normalize(lightDir + view);

    // Grazing angles reflect, steep angles look into the water.
    float fresnel = pow(1.0 - clamp(dot(nrm, view), 0.0, 1.0), 3.0);
    vec3 color = mix(uDeep, uShallow, fresnel);

    float glint = pow(clamp(dot(nrm, halfVec), 0.0, 1.0), 90.0);
    color += uSheen * glint * 0.9;

    float dist = distance(vWorld, uCamPos);
    color = mix(color, uHaze, pow(smoothstep(60.0, 900.0, dist), 0.8));

    // Unlit water keeps only its specular, which is what a river looks like at
    // night: black, with the surface picked out in moving highlights.
    vec3 unlit = uDeep * 0.35 + uSheen * glint * 0.5;

    gl_FragColor = vec4(toSRGB(mix(unlit, color, revealAt(gl_FragCoord.xy))), 1.0);
  }
`;

/** Flat vertical gradient standing behind everything, so the sky is not a void. */
export const skyFragmentShader = /* glsl */ `
  uniform vec3 uHorizon;
  uniform vec3 uZenith;

  varying vec2 vUv;

  ${encodeSRGB}

  void main() {
    // Steep falloff: the glow belongs in a band just above the ridges, not
    // spread evenly over four thousand units of sky.
    gl_FragColor = vec4(toSRGB(mix(uHorizon, uZenith, pow(vUv.y, 0.3))), 1.0);
  }
`;

/**
 * Layered ridge flats standing beyond the far edge of the valley. Without them
 * the traverse ends looking into empty sky, since the heightmap simply stops.
 * Cheap by construction: one quad per range, with the silhouette cut in the
 * fragment stage.
 */
export const rangeVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const rangeFragmentShader = /* glsl */ `
  uniform vec3 uNear;
  uniform vec3 uFar;
  uniform float uSeed;
  uniform float uRough;

  varying vec2 vUv;

  ${encodeSRGB}
  ${noiseChunk}

  /** Sum of octaves along the ridge line, biased upward into peaks. */
  float ridgeLine(float x) {
    float s = valueNoise(vec2(x * 3.0 + uSeed, uSeed)) * 0.55
            + valueNoise(vec2(x * 7.0 + uSeed, uSeed * 1.7)) * 0.28
            + valueNoise(vec2(x * 17.0 + uSeed, uSeed * 2.3)) * 0.17;
    return pow(s, 1.0 + uRough);
  }

  void main() {
    float ridge = 0.24 + ridgeLine(vUv.x) * 0.72;
    if (vUv.y > ridge) discard;

    // Lighter toward the ridge line, so each range reads as haze catching the
    // sky rather than as a flat cut-out.
    float toCrest = clamp(vUv.y / max(ridge, 1e-4), 0.0, 1.0);
    vec3 color = mix(uNear, uFar, toCrest * toCrest);

    gl_FragColor = vec4(toSRGB(color), 1.0);
  }
`;

/**
 * Grass tufts. Each instance is a pair of crossed quads tapered to a point, so
 * the silhouette is a blade without needing an alpha texture, and the whole
 * clump reads from any angle without billboarding.
 */
export const grassVertexShader = /* glsl */ `
  uniform float uTime;

  attribute vec3 tint;

  varying vec3 vWorld;
  varying vec3 vTint;
  varying float vHeightFactor;

  void main() {
    vHeightFactor = uv.y;
    vTint = tint;

    vec3 local = position;
    // Taper to a point: the quad becomes a blade. Both lateral axes, because
    // the crossed pair lies in two different planes.
    local.xz *= 1.0 - uv.y * 0.92;

    vec4 world = instanceMatrix * vec4(local, 1.0);

    // Wind. Displacement scales with the square of height so the base stays
    // planted and only the tips travel.
    float sway = sin(uTime * 1.1 + world.x * 0.09 + world.z * 0.07);
    world.x += sway * uv.y * uv.y * 1.5;
    world.z += cos(uTime * 0.8 + world.x * 0.05) * uv.y * uv.y * 0.9;

    world = modelMatrix * world;
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const grassFragmentShader = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uTip;
  uniform vec3 uHaze;

  varying vec3 vWorld;
  varying vec3 vTint;
  varying float vHeightFactor;

  ${encodeSRGB}
  ${spotlightChunk}

  void main() {
    vec3 color = mix(uBase, uTip, vHeightFactor * vHeightFactor) * vTint;

    float dist = distance(vWorld, uCamPos);
    color = mix(color, uHaze, pow(smoothstep(60.0, 700.0, dist), 0.9));

    // Barely present outside the light: unlit grass should read as texture on
    // the silhouette, not as a field of grey blades.
    vec3 unlit = color * 0.07;
    gl_FragColor = vec4(toSRGB(mix(unlit, color, revealAt(gl_FragCoord.xy))), 1.0);
  }
`;

/** Conifers on the valley walls, lit by the same key as the terrain. */
export const treeVertexShader = /* glsl */ `
  attribute vec3 tint;

  varying vec3 vWorld;
  varying vec3 vNrm;
  varying vec3 vTint;

  void main() {
    vTint = tint;
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNrm = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const treeFragmentShader = /* glsl */ `
  uniform vec3 uCanopy;
  uniform vec3 uHaze;

  varying vec3 vWorld;
  varying vec3 vNrm;
  varying vec3 vTint;

  ${encodeSRGB}
  ${spotlightChunk}

  void main() {
    vec3 nrm = normalize(vNrm);
    vec3 lightDir = normalize(vec3(0.28, 0.82, 0.5));
    float ndl = clamp(dot(nrm, lightDir), 0.0, 1.0);

    vec3 color = uCanopy * vTint * (0.30 + ndl * 1.1);

    float dist = distance(vWorld, uCamPos);
    color = mix(color, uHaze, pow(smoothstep(80.0, 850.0, dist), 0.85));

    vec3 unlit = color * 0.07;
    gl_FragColor = vec4(toSRGB(mix(unlit, color, revealAt(gl_FragCoord.xy))), 1.0);
  }
`;
