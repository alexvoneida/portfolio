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
  uniform vec3 uCamPos;
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

  // Spotlight, in device pixels. uReveal fades the whole effect in on first
  // pointer movement and back out when the pointer leaves the window.
  uniform vec2 uCursor;
  uniform float uRadius;
  uniform float uReveal;

  // Floor under the spotlight. Without it a device that cannot hover shows an
  // empty black frame, and a desktop visitor sees nothing until they happen to
  // move the mouse.
  uniform float uBaseLight;

  in vec3 vWorld;
  in vec3 vNrm;

  layout(location = 0) out vec4 fragColor;

  ${encodeSRGB}

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

  /**
   * Feathered spotlight falloff. Solid to 40% of the radius, then four stops out
   * to nothing, which gives a soft edge without the banding a single smoothstep
   * produces at this size. Written branchlessly so it stays well-defined
   * wherever it is called from.
   */
  float spotlight(float d) {
    float a = mix(1.00, 0.75, clamp((d - 0.40) / 0.20, 0.0, 1.0));
    float b = mix(a, 0.40, clamp((d - 0.60) / 0.15, 0.0, 1.0));
    float c = mix(b, 0.12, clamp((d - 0.75) / 0.13, 0.0, 1.0));
    return mix(c, 0.0, clamp((d - 0.88) / 0.12, 0.0, 1.0));
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

    float d = distance(gl_FragCoord.xy, uCursor) / uRadius;
    // The gamma pulls the mid-falloff down so the lit moss dissolves into the
    // black instead of ending on a visible arc.
    float reveal = max(uBaseLight, pow(spotlight(d), 1.7) * uReveal * 0.94);

    vec3 color = mix(unlit, living, reveal);
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
