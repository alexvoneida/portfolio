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
  uniform vec2 uViewport;

  /**
   * Wide solid core with a short falloff, so the pool of light has a definite
   * edge rather than dissolving across half its own radius. Branchless, so it
   * stays well-defined wherever it is called from.
   */
  float spotlightFalloff(float d) {
    float a = mix(1.00, 0.86, clamp((d - 0.62) / 0.16, 0.0, 1.0));
    float b = mix(a, 0.45, clamp((d - 0.78) / 0.10, 0.0, 1.0));
    float c = mix(b, 0.14, clamp((d - 0.88) / 0.07, 0.0, 1.0));
    return mix(c, 0.0, clamp((d - 0.95) / 0.05, 0.0, 1.0));
  }

  float revealAt(vec2 fragCoord) {
    float d = distance(fragCoord, uCursor) / uRadius;
    return max(uBaseLight, pow(spotlightFalloff(d), 1.15) * uReveal * 0.94);
  }

  /**
   * The spotlight alone, with no ambient floor under it. This is the mask for
   * detail that exists only inside the light — using revealAt() for that would
   * leak the extra detail across the whole valley at the base light level.
   */
  float spotAt(vec2 fragCoord) {
    return spotlightFalloff(distance(fragCoord, uCursor) / uRadius) * uReveal;
  }

  /**
   * The same amount asked from a vertex shader, where there is no fragCoord.
   * Points behind the camera return 0: their clip w is negative and the
   * perspective divide would otherwise fold them back into the frame.
   */
  float spotAtClip(vec4 clip) {
    vec2 screen = (clip.xy / max(abs(clip.w), 1e-4) * 0.5 + 0.5) * uViewport;
    return spotAt(screen) * step(1e-4, clip.w);
  }

  /**
   * A thin bright band at the boundary. Reads as the wall of the glass the
   * landscape is being viewed through, and it is what makes the edge legible
   * as an edge rather than as the end of the lighting.
   */
  float rimAt(vec2 fragCoord) {
    float d = distance(fragCoord, uCursor) / uRadius;
    float band = 1.0 - clamp(abs(d - 0.90) / 0.022, 0.0, 1.0);
    return band * band * uReveal;
  }
`;

/**
 * Value noise shared by the terrain, the water ripples and the sky.
 *
 * Lattice cells are wrapped before hashing. hash21 multiplies by ~123 before
 * taking fract, so a cell coordinate in the thousands lands near 1e6, where a
 * float32 ulp is around 0.0625 — fract then quantises to a handful of values
 * and the field collapses into bands. That happens to distant terrain
 * immediately, and to the animated water after a few minutes, once the flow
 * offset has grown large enough. Wrapping keeps hash inputs small, and because
 * the field is genuinely periodic at the wrap there is no seam.
 */
/**
 * The footpath, in the same closed form as trailCenterX in src/lib/terrain.ts.
 * The two have to agree: the CPU keeps foliage off the path and the GPU draws
 * it, and a path with grass growing down the middle of it is not a path.
 */
export const trailChunk = /* glsl */ `
  float valleyCenterXAt(float z) {
    return sin(z * 0.0045) * 70.0 + sin(z * 0.0013 + 1.7) * 110.0;
  }

  float trailCenterXAt(float z) {
    return valleyCenterXAt(z) + 118.0 + sin(z * 0.017) * 27.0 + sin(z * 0.006 + 2.1) * 41.0;
  }

  float trailHalfAt(float z) {
    return 2.6 * (0.72 + 0.28 * sin(z * 0.009));
  }
`;

export const noiseChunk = /* glsl */ `
  const float NOISE_PERIOD = 1024.0;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float latticeHash(vec2 cell) {
    return hash21(mod(cell, NOISE_PERIOD));
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(latticeHash(i), latticeHash(i + vec2(1.0, 0.0)), u.x),
      mix(latticeHash(i + vec2(0.0, 1.0)), latticeHash(i + vec2(1.0, 1.0)), u.x),
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
  ${trailChunk}

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
    // How much of the light this fragment is standing in, with no ambient floor.
    // Everything gated on this exists only inside the pool.
    float spot = spotAt(gl_FragCoord.xy);

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
    // A third scale, an order finer again. Only ever visible inside the light,
    // which is exactly where the eye has time to look for it.
    float grain = valueNoise(vWorld.xz * 5.5) * 0.6 + valueNoise(vWorld.xz * 13.0) * 0.4;
    // A fourth scale, finer again, and paid for only where the light is: at
    // this frequency it would alias into static across the rest of the frame,
    // and nobody would be looking at it there anyway.
    // Held close as well as inside the light: at this frequency the field
    // crosses one cycle per pixel somewhere past a hundred units out, and
    // beyond that it aliases into salt and pepper instead of resolving.
    float microFade = spot * (1.0 - smoothstep(30.0, 130.0, dist));
    float micro = valueNoise(vWorld.xz * 10.0) * 0.6 + valueNoise(vWorld.xz * 24.0) * 0.4;

    // Micro-relief. Perturbing the normal by the gradient of the fine noise is
    // what separates "a green surface" from "clumps of moss catching light".
    float e = 0.6;
    float gx = fbm(fineP + vec2(e, 0.0));
    float gz = fbm(fineP + vec2(0.0, e));
    // Two scales of micro-relief: clumps from the fine octave, and a sharper
    // grain on top so the clumps themselves have surface.
    float grainFade = 1.0 - smoothstep(60.0, 260.0, dist);
    float ggx = valueNoise(vWorld.xz * 5.5 + vec2(0.14, 0.0));
    float ggz = valueNoise(vWorld.xz * 5.5 + vec2(0.0, 0.14));
    float mgx = valueNoise(vWorld.xz * 10.0 + vec2(0.08, 0.0));
    float mgz = valueNoise(vWorld.xz * 10.0 + vec2(0.0, 0.08));
    vec3 relief = vec3(fine - gx, 0.0, fine - gz) * 2.4 * detailFade
                + vec3(grain - ggx, 0.0, grain - ggz) * 1.5 * grainFade
                + vec3(micro - mgx, 0.0, micro - mgz) * 1.4 * microFade;
    vec3 bumped = normalize(nrm + relief);

    float bare = smoothstep(0.80, 0.34, bumped.y);

    // Weighted hard toward the deep tone: in the reference the moss averages a
    // very dark olive and only the clump tips reach chartreuse. Spreading the
    // greens evenly is what makes procedural foliage read as a green filter.
    vec3 moss = mix(uMossDeep, uMossMid, smoothstep(0.38, 0.86, mottle));
    moss = mix(moss, uMossLit, smoothstep(0.68, 0.98, mottle) * 0.85);
    moss = mix(moss, uMossHi, smoothstep(0.74, 0.99, fine) * 0.5 * detailFade);
    // Individual bright tips, sparse enough to read as separate specks.
    moss = mix(moss, uMossHi, smoothstep(0.80, 0.99, grain) * 0.4 * grainFade);
    // Bare soil in the hollows, so the revealed ground is not uniformly green.
    moss = mix(uSoil, moss, smoothstep(0.12, 0.44, mottle));
    // Inside the light the clumps break into individual heads: bright tips on
    // the micro scale, and grit showing between them.
    moss = mix(moss, uMossHi, smoothstep(0.72, 0.97, micro) * 0.55 * microFade);
    moss = mix(moss, uSoil, smoothstep(0.30, 0.02, micro) * 0.35 * microFade);

    vec3 rock = mix(uRockDark, uRockLit, smoothstep(0.32, 0.86, mottle));
    vec3 living = mix(moss, rock, bare);

    vec3 lightDir = normalize(vec3(0.28, 0.82, 0.5));
    float ndl = clamp(dot(bumped, lightDir), 0.0, 1.0);
    living *= 0.16 + ndl * 1.3;

    // Wet sheen. Moss in the reference is damp, and the specular is most of why
    // it reads as photographed rather than modelled.
    vec3 view = normalize(uCamPos - vWorld);
    vec3 halfVec = normalize(lightDir + view);
    float ndh = clamp(dot(bumped, halfVec), 0.0, 1.0);
    float sheen = pow(ndh, 42.0) * (1.0 - bare) * detailFade;
    living += vec3(0.82, 1.0, 0.70) * sheen * 0.4;
    // A second, much tighter lobe riding the micro-relief. Only inside the
    // light, where the normals are detailed enough for it to land on
    // individual clump heads instead of scintillating over the whole slope.
    living += vec3(0.88, 1.0, 0.78) * pow(ndh, 160.0) * (1.0 - bare) * microFade * 0.3;

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

    // The footpath: moss worn back to grit. Held to ground shallow enough to
    // walk, so it stops at the foot of a wall instead of climbing it, and kept
    // low-contrast — it should be something you come across, not a stripe
    // painted down the valley.
    float treadHalf = trailHalfAt(vWorld.z);
    float offPath = abs(vWorld.x - trailCenterXAt(vWorld.z));
    float tread = 1.0 - smoothstep(treadHalf * 0.55, treadHalf, offPath);
    tread *= smoothstep(0.62, 0.88, nrm.y) * detailFade;
    // Keyed off the dark rock rather than the lit rock: pale grit reads as a
    // ribbon painted down the valley, which is the opposite of something you
    // have to go and find.
    vec3 grit = mix(uSoil, uRockDark, 0.30 + grain * 0.34) * (0.55 + ndl * 0.75);
    living = mix(living, grit, tread * 0.5);

    vec3 color = mix(unlit, living, revealAt(gl_FragCoord.xy));
    // Pale rather than green: the rim should read as the wall of the glass, not
    // as more moss.
    color += uLine * rimAt(gl_FragCoord.xy) * 0.11;
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
  /** Centre xz and radius of each tarn, so still water can be told from river. */
  uniform vec3 uTarns[TARN_COUNT];

  varying vec3 vWorld;

  ${encodeSRGB}
  ${spotlightChunk}
  ${noiseChunk}

  /**
   * 1 well inside a tarn, 0 out on the river. The same quad serves both, so
   * without this the tarns would be lit by a current running through them.
   */
  float stillness(vec2 p) {
    float still = 0.0;
    for (int i = 0; i < TARN_COUNT; i++) {
      float d = distance(p, uTarns[i].xy) / max(uTarns[i].z, 1e-3);
      still = max(still, 1.0 - smoothstep(0.55, 1.05, d));
    }
    return still;
  }

  /**
   * Three scales carried downstream at different rates. The sampling offset is
   * negated in z so the current runs toward the camera rather than away from
   * it: a feature sampled at (p + d) appears at (p - d), so a positive drift
   * would push the water down-valley.
   *
   * The slower cross-drift keeps the pattern from reading as a texture on a
   * conveyor belt.
   */
  float ripple(vec2 p) {
    float flow = uTime * 2.1;
    return valueNoise(p + vec2(uTime * 0.06, -flow * 0.55)) * 0.5
         + valueNoise(p * 2.3 + vec2(-uTime * 0.10, -flow * 0.85)) * 0.32
         + valueNoise(p * 5.7 + vec2(uTime * 0.16, -flow * 1.30)) * 0.18;
  }

  /**
   * A fourth and fifth scale, an order finer and running faster. Rendered only
   * inside the spotlight: across the rest of the river these frequencies fall
   * below a pixel and boil.
   */
  float chop(vec2 p) {
    float flow = uTime * 3.4;
    return valueNoise(p * 11.0 + vec2(uTime * 0.20, -flow)) * 0.6
         + valueNoise(p * 23.0 + vec2(-uTime * 0.30, -flow * 1.5)) * 0.4;
  }

  void main() {
    vec2 p = vWorld.xz * 0.5;
    float dist = distance(vWorld, uCamPos);
    float still = stillness(vWorld.xz);
    float spot = spotAt(gl_FragCoord.xy);
    float chopFade = spot * (1.0 - smoothstep(40.0, 200.0, dist));

    // Flatten the surface with distance. A pixel of far water covers many
    // ripples, and a full-strength normal there aliases into static rather than
    // resolving into waves.
    float rippleFade = 1.0 - smoothstep(90.0, 420.0, dist);

    // Gradient of the ripple field becomes the surface normal. Sampling by hand
    // rather than with derivatives keeps the wave scale independent of how many
    // pixels the water happens to cover.
    float e = 0.3;
    float h = ripple(p);
    float dx = (h - ripple(p + vec2(e, 0.0))) * rippleFade;
    float dz = (h - ripple(p + vec2(0.0, e))) * rippleFade;

    float fe = 0.05;
    float fh = chop(p);
    dx += (fh - chop(p + vec2(fe, 0.0))) * chopFade * 1.6;
    dz += (fh - chop(p + vec2(0.0, fe))) * chopFade * 1.6;
    // The low y term is what gives the surface visible relief: near 1.0 the
    // normals barely tilt and the river reads as flat glass.
    // Flatter and glassier in a tarn: standing water has no chop of its own,
    // and leaving the relief up is what would give a pond a current.
    vec3 nrm = normalize(vec3(dx * 2.0 * (1.0 - still * 0.82), 0.3, dz * 2.0 * (1.0 - still * 0.82)));

    vec3 view = normalize(uCamPos - vWorld);
    vec3 lightDir = normalize(vec3(0.28, 0.82, 0.5));
    vec3 halfVec = normalize(lightDir + view);

    // Grazing angles reflect, steep angles look into the water.
    float fresnel = pow(1.0 - clamp(dot(nrm, view), 0.0, 1.0), 3.0);
    // Standing water at night is dark — it mirrors a black sky. Flattening the
    // relief for a tarn also points every normal at the camera, so on the
    // river's own fresnel and specular gain a pond blows out to white.
    fresnel *= 1.0 - still * 0.6;
    vec3 color = mix(uDeep, uShallow, fresnel);

    float ndh = clamp(dot(nrm, halfVec), 0.0, 1.0);
    // Two lobes: a broad sheen for the body of the river and a tighter one for
    // the highlights on the wave crests. The tight lobe is kept modest — it
    // scintillates in place rather than travelling, so leaning on it makes the
    // water twinkle instead of flow.
    float sheen = pow(ndh, 12.0);
    float sparkle = pow(ndh, 90.0) * rippleFade;
    color += uSheen * (sheen * 0.3 + sparkle * 0.32) * (1.0 - still * 0.72);

    // Transverse crests, stretched across the channel and compressed along it,
    // marching upstream toward the camera. This is the term that actually reads
    // as current: a coherent band that translates, rather than noise that
    // reshuffles.
    float crest = valueNoise(vec2(p.x * 2.2, p.y * 0.5 - uTime * 1.9));
    crest = crest * 0.65 + valueNoise(vec2(p.x * 4.5, p.y * 1.1 - uTime * 2.6)) * 0.35;
    color += uSheen * smoothstep(0.58, 0.94, crest) * 0.22 * rippleFade * (1.0 - still);

    // Broken water on the chop: individual glints, tight enough to read as
    // separate points of light on separate wavelets.
    color += uSheen * smoothstep(0.76, 0.98, fh) * 0.34 * chopFade * (1.0 - still * 0.9);

    color = mix(color, uHaze, pow(smoothstep(60.0, 900.0, dist), 0.8));

    // Unlit water keeps a trace of its highlights, which is what a river looks
    // like at night: black, with the surface picked out in moving glints.
    vec3 unlit = uDeep * 0.3 + uSheen * sparkle * 0.22;

    vec3 lit = mix(unlit, color, revealAt(gl_FragCoord.xy));
    lit += uSheen * rimAt(gl_FragCoord.xy) * 0.2;
    gl_FragColor = vec4(toSRGB(lit), 1.0);
  }
`;

/**
 * The night sky: a horizon gradient, three star layers and a banded milky way.
 * All procedural, so it costs one quad and no texture download.
 */
export const skyFragmentShader = /* glsl */ `
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uStar;
  uniform vec3 uMilkyCore;
  uniform vec3 uMilkyEdge;
  uniform float uAspect;

  varying vec2 vUv;

  ${encodeSRGB}
  ${noiseChunk}

  float fbmSky(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
      sum += amp * valueNoise(p);
      p *= 2.11;
      amp *= 0.5;
    }
    return sum;
  }

  /**
   * One star per grid cell, most cells empty. Cells are kept square by the
   * aspect term, or stars stretch into dashes on a wide quad.
   */
  float starLayer(vec2 uv, float density, float threshold, float size) {
    vec2 grid = uv * vec2(density * uAspect, density);
    vec2 cell = floor(grid);
    vec2 f = fract(grid);

    float occupancy = hash21(cell);
    float present = step(threshold, occupancy);

    vec2 at = vec2(hash21(cell + 11.3), hash21(cell + 47.7));
    float d = length(f - at);
    float point = pow(clamp(1.0 - d / size, 0.0, 1.0), 9.0);

    // Brightness varies per star, and the very brightest are rare.
    float magnitude = pow(hash21(cell + 3.1), 2.2);
    return point * present * (0.25 + magnitude * 1.35);
  }

  void main() {
    vec3 color = mix(uHorizon, uZenith, pow(vUv.y, 0.3));

    // Fade everything out toward the horizon, where haze would drown it.
    float altitude = smoothstep(0.34, 0.58, vUv.y);

    // A diagonal band. The offset keeps it clear of the horizon at the left
    // edge, where the ridges are tallest.
    float across = (vUv.y - 0.60 - (vUv.x - 0.5) * 0.30) / 0.17;
    float band = exp(-across * across);

    vec2 cloudUv = vec2(vUv.x * uAspect, vUv.y) * 7.0;
    float clouds = fbmSky(cloudUv);
    // Dust lanes: a second, finer field subtracted from the band so it breaks
    // into strands instead of reading as an airbrushed smear.
    float lanes = smoothstep(0.35, 0.72, fbmSky(cloudUv * 2.3 + 19.0));

    float milky = band * (0.35 + clouds * 0.95) * (0.45 + lanes * 0.75);
    color += mix(uMilkyEdge, uMilkyCore, clamp(band * 1.25, 0.0, 1.0)) * milky * altitude * 0.24;

    // Dense faint field, a mid layer, and a few bright foreground stars. The
    // milky way carries extra stars, which is most of why it reads as depth.
    float stars = starLayer(vUv, 210.0, 0.93, 0.16) * (0.55 + milky * 1.5);
    stars += starLayer(vUv, 96.0, 0.965, 0.20);
    stars += starLayer(vUv, 38.0, 0.986, 0.26) * 1.5;

    color += uStar * stars * altitude * 0.8;

    gl_FragColor = vec4(toSRGB(color), 1.0);
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
  uniform vec3 uSnow;
  uniform float uSeed;
  uniform float uRough;
  uniform float uDetail;
  /**
   * The quad's width as a multiple of the reference width, applied to every
   * horizontal frequency below. The flats have to be wide enough that their
   * ends never enter frame, and without this a wider quad would simply stretch
   * the same handful of peaks across it.
   */
  uniform float uSpan;

  varying vec2 vUv;

  ${encodeSRGB}
  ${noiseChunk}

  /**
   * Folded octaves along the ridge line. Each sample is reflected about its
   * midpoint — a triangle wave of the noise — which puts a hard crease at every
   * maximum. A plain sum of value noise has smooth maxima by construction, so
   * it can only ever produce rounded shoulders; the fold is what makes a
   * skyline read as crests rather than as hills.
   *
   * Deliberately not squared, unlike the terrain's ridged multifractal: squaring
   * biases the sum upward but rounds the very corners this exists to keep.
   * uRough deepens the saddles instead, most on the nearest range.
   */
  float ridgeLine(float x) {
    float sum = 0.0;
    float norm = 0.0;
    float amp = 1.0;
    float freq = 3.0;
    for (int i = 0; i < 4; i++) {
      float n = valueNoise(vec2(x * freq + uSeed, uSeed * (1.0 + float(i) * 0.7)));
      sum += (1.0 - abs(n * 2.0 - 1.0)) * amp;
      norm += amp;
      amp *= 0.52;
      freq *= 2.17;
    }
    return pow(sum / norm, 1.0 + uRough * 1.6);
  }

  void main() {
    float ridge = 0.24 + ridgeLine(vUv.x * uSpan) * 0.72;
    if (vUv.y > ridge) discard;

    // Lighter toward the ridge line, so each range reads as haze catching the
    // sky rather than as a flat cut-out.
    float toCrest = clamp(vUv.y / max(ridge, 1e-4), 0.0, 1.0);
    vec3 color = mix(uNear, uFar, toCrest * toCrest);

    // Just enough relief to stop the flats reading as paper. Anisotropic on
    // purpose: stretched vertically, the noise falls into gullies rather than
    // mottling like lichen.
    vec2 faceUv = vec2(vUv.x * uSpan * 190.0, vUv.y * 34.0);
    float rock = valueNoise(faceUv) * 0.6 + valueNoise(faceUv * 2.6) * 0.4;
    color *= 1.0 + (rock - 0.5) * 0.5 * uDetail;

    // A snow line at a fixed altitude, so only the peaks that actually rise
    // above it are capped and the saddles between them stay bare. A term based
    // on height-as-a-fraction-of-this-peak instead puts the same band on every
    // summit regardless of how tall it is, which reads as paint.
    float snowline = 0.58 + valueNoise(vec2(vUv.x * uSpan * 9.0 + uSeed, 3.0)) * 0.09;
    float capped = smoothstep(snowline, snowline + 0.12, vUv.y);
    // Broken by its own coarse field, not by the rock noise: the rock term runs
    // hundreds of cycles across the quad, and snow keyed to it comes out as
    // salt-and-pepper camouflage rather than as drifts. Wide smoothstep for the
    // same reason — a tight one turns a smooth field back into speckle.
    float drift = valueNoise(vec2(vUv.x * uSpan * 13.0 + uSeed, vUv.y * 5.0));
    float alpine = capped * smoothstep(0.28, 0.85, drift) * smoothstep(0.58, 0.90, toCrest);
    color = mix(color, uSnow, alpine * 0.5 * uDetail);

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
  /** 1 on the detail layer, whose clumps exist only inside the spotlight. */
  uniform float uSpotOnly;

  attribute vec3 tint;
  attribute vec3 bladeCenter;

  varying vec3 vWorld;
  varying vec3 vTint;
  varying float vHeightFactor;

  ${spotlightChunk}

  void main() {
    vHeightFactor = uv.y;
    vTint = tint;

    // Taper to a point: the quad becomes a blade. Measured from the blade's own
    // axis, so blades keep their offsets within the clump instead of all
    // converging on its centre as they rise.
    float taper = 1.0 - uv.y * 0.92;
    vec3 local = vec3(
      bladeCenter.x + (position.x - bladeCenter.x) * taper,
      position.y,
      bladeCenter.z + (position.z - bladeCenter.z) * taper
    );

    // The detail layer grows in under the pool of light and collapses to a
    // point outside it, so tens of thousands of extra clumps cost nothing but
    // their vertex transform anywhere else in the frame. Measured at the clump
    // origin rather than per vertex, or a tuft straddling the edge would shear.
    vec4 originClip = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float grown = mix(1.0, smoothstep(0.02, 0.5, spotAtClip(originClip)), uSpotOnly);
    local *= grown;

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

/**
 * Trail markers: a post and a small board, drawn by the same key as everything
 * else so they are only legible inside the spotlight. Deliberately unlettered —
 * at this camera height a board is a few pixels tall, and the two painted
 * blazes read as a marker where text would only read as noise.
 */
export const signVertexShader = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNrm;
  varying vec2 vUvOut;

  void main() {
    vUvOut = uv;
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNrm = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const signFragmentShader = /* glsl */ `
  uniform vec3 uBody;
  uniform vec3 uMark;
  uniform vec3 uHaze;
  /** 0 on the posts, 1 on the boards, which are the only part that carries a blaze. */
  uniform float uBlazed;

  varying vec3 vWorld;
  varying vec3 vNrm;
  varying vec2 vUvOut;

  ${encodeSRGB}
  ${spotlightChunk}
  ${noiseChunk}

  void main() {
    vec3 nrm = normalize(vNrm);
    vec3 lightDir = normalize(vec3(0.28, 0.82, 0.5));
    float dist = distance(vWorld, uCamPos);
    float detailFade = 1.0 - smoothstep(50.0, 200.0, dist);

    // Weathered timber: grain along the length, and never quite the same tone
    // twice, sampled in world space so neighbouring markers differ.
    float grain = valueNoise(vWorld.xz * 7.0 + vWorld.y * 4.0);
    vec3 color = uBody * (0.78 + grain * 0.42 * detailFade);
    color *= 0.34 + clamp(dot(nrm, lightDir), 0.0, 1.0) * 1.05;

    // Two blazes across the board.
    float blaze = step(0.30, vUvOut.y) * step(vUvOut.y, 0.44)
                + step(0.56, vUvOut.y) * step(vUvOut.y, 0.70);
    blaze *= step(0.12, vUvOut.x) * step(vUvOut.x, 0.88) * uBlazed;
    color = mix(color, uMark, blaze * 0.75 * detailFade);

    color = mix(color, uHaze, pow(smoothstep(70.0, 600.0, dist), 0.85));

    vec3 unlit = color * 0.07;
    gl_FragColor = vec4(toSRGB(mix(unlit, color, revealAt(gl_FragCoord.xy))), 1.0);
  }
`;

/** Conifers on the valley walls, lit by the same key as the terrain. */
export const treeVertexShader = /* glsl */ `
  uniform float uTime;

  attribute vec3 tint;

  varying vec3 vWorld;
  varying vec3 vNrm;
  varying vec3 vTint;
  varying float vUpFactor;

  ${spotlightChunk}

  void main() {
    vTint = tint;
    // 0 at the skirt, 1 at the leader. Cone uvs run bottom to top.
    vUpFactor = uv.y;
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);

    // Only the trees standing in the light move. A whole valley of swaying
    // conifers at this distance reads as the mesh crawling; confined to the
    // pool it reads as wind, and it is one more thing the spotlight has that
    // the rest of the frame does not.
    //
    // Sampled once at the instance origin rather than per vertex, so a canopy
    // straddling the edge of the pool bends as one tree instead of tearing
    // down the middle.
    vec4 originClip = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float lit = spotAtClip(originClip);
    // Two periods beating against each other so gusts arrive irregularly, and
    // displacement scaling with the square of height so the trunk stays put.
    float gust = sin(uTime * 0.85 + world.x * 0.05 + world.z * 0.04) * 0.62
               + sin(uTime * 1.63 + world.x * 0.11) * 0.38;
    float bend = vUpFactor * vUpFactor * lit;
    world.x += gust * bend * 2.4;
    world.z += cos(uTime * 0.71 + world.z * 0.06) * bend * 1.4;

    vWorld = world.xyz;
    vNrm = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const treeFragmentShader = /* glsl */ `
  uniform vec3 uCanopy;
  uniform vec3 uCanopyLit;
  uniform vec3 uFrost;
  uniform vec3 uHaze;

  varying vec3 vWorld;
  varying vec3 vNrm;
  varying vec3 vTint;
  varying float vUpFactor;

  ${encodeSRGB}
  ${spotlightChunk}
  ${noiseChunk}

  void main() {
    vec3 nrm = normalize(vNrm);
    vec3 lightDir = normalize(vec3(0.28, 0.82, 0.5));
    float dist = distance(vWorld, uCamPos);
    float detailFade = 1.0 - smoothstep(90.0, 380.0, dist);

    // Needle break-up, sampled in world space so neighbouring trees never share
    // a pattern. The vertical term keeps it from banding around the cone.
    vec2 needleUv = vWorld.xz * 3.2 + vWorld.y * 0.9;
    float needles = valueNoise(needleUv) * 0.6 + valueNoise(needleUv * 2.7) * 0.4;

    // Denser and darker toward the skirt, thinning out at the leader.
    float depthInCanopy = 1.0 - vUpFactor;
    vec3 color = mix(uCanopyLit, uCanopy, depthInCanopy * 0.75);
    color *= vTint;
    color *= 0.72 + needles * 0.55 * detailFade;

    float ndl = clamp(dot(nrm, lightDir), 0.0, 1.0);
    color *= 0.30 + ndl * 1.1;

    // Frost catching on upward faces near the top, where snow would sit.
    float frost = smoothstep(0.55, 0.95, nrm.y) * smoothstep(0.45, 0.9, vUpFactor);
    color += uFrost * frost * smoothstep(0.5, 0.85, needles) * 0.35 * detailFade;

    color = mix(color, uHaze, pow(smoothstep(80.0, 850.0, dist), 0.85));

    vec3 unlit = color * 0.07;
    gl_FragColor = vec4(toSRGB(mix(unlit, color, revealAt(gl_FragCoord.xy))), 1.0);
  }
`;
