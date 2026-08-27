# alexvoneida.com

Personal portfolio. The page is a survey traverse through a valley: scrolling
flies a camera down a procedurally generated heightmap, and each section is a
station along that traverse.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
npm run lint
```

## How it fits together

| Path | What it is |
| --- | --- |
| `src/content/portfolio.ts` | All copy and data. Editing this is how you update the site. |
| `src/lib/terrain.ts` | The heightmap. Ridged multifractal noise, carved by a meandering valley mask. Shared by the 3D scene and the survey readouts. |
| `src/lib/survey.ts` | Station chainage and crest elevation, derived from `terrain.ts`. |
| `src/lib/scroll.ts` | Scroll progress, kept outside React state. |
| `src/lib/pointer.ts` | Pointer position, same treatment, feeding the spotlight and the parallax grid. |
| `src/components/scene/` | React Three Fiber scene, shaders, and the static fallback. |

### The single source of truth

`sections` in `portfolio.ts` carries a `t` for each section — its position along
the flight path, 0 to 1. The camera, the waypoint stakes, the station labels,
and the elevation readouts all derive from that same number, so a section's
label can never drift out of sync with what is on screen behind it.

### Rendering

The page is server-rendered HTML first; the terrain is a dynamically imported
client chunk that paints on top of a static SVG of the same ridges. If the
visitor has `prefers-reduced-motion` set or no WebGL2, the SVG is the whole
background and no three.js is downloaded. Phones and low-core machines get a
reduced-density mesh at `dpr: 1`.

Scroll progress is read every frame inside `useFrame` rather than held in state,
because nothing in the DOM depends on it and re-rendering the tree at 60Hz to
move a camera would be wasteful.

### Shaders

`src/components/scene/shaders.ts`. The terrain pair is authored in GLSL3 —
antialiased contour lines need `fwidth`, which is only core in GLSL ES 3.00.
That means declaring varyings and the fragment output explicitly, since three
does not shim `gl_FragColor` for GLSL3 materials.

Aerial perspective does most of the work: distance and low elevation both drain
colour into the haze, which is what separates the ridges into receding layers.
The haze is deliberately *lighter* than the rock — on a near-black landscape it
is the only thing making one ridge distinguishable from the next.

### The spotlight

The valley has two shaded forms. Outside the cursor it is a near-black
silhouette; inside it is a lit, mossy, macro-detailed landscape — so the cursor
works like the glass of a terrarium, and the greens exist only where you put it.

The living layer is procedural: a coarse value-noise mottle picks the moss tone,
a finer octave drives both the highlight speckle and a perturbed normal for
micro-relief, steep faces fall back to warm rock, and a tight specular lobe
supplies the wet sheen. Palette values are sampled from the reference photograph
and weighted to match its histogram — over half of that frame is near-black, and
spreading the greens evenly is what makes procedural foliage look like a green
filter instead of moss.

Contours and the plan-view grid survive as an *etch* — they darken the moss
rather than drawing bright lines over it, which keeps the survey information
without reintroducing a wireframe.

`uBaseLight` floors the reveal: a hint of landscape on desktop before the first
mouse move, considerably more on devices that cannot hover at all, where a pure
spotlight would leave an empty black frame.

It is a uniform on the terrain shader, not a CSS mask. Masking would mean
producing a full-viewport gradient every frame and handing it to the compositor;
the terrain is already being shaded on the GPU, so the reveal costs one distance
test per fragment.

Three things here are easy to get wrong and were:

- **Colour space.** three applies its output encoding inside its own materials
  only. A raw `ShaderMaterial` writes straight into an sRGB drawing buffer while
  `THREE.Color` decodes to linear on the way in, so without an explicit
  `toSRGB()` on the way out everything renders roughly gamma-squared too dark.
- **Derivatives.** `fwidth` is undefined in non-uniform control flow. The
  contours must be computed unconditionally and only *used* inside the spotlight
  branch, or neighbouring-quad garbage leaks into the fragments that matter.
- **Uniform ownership.** The frame loop writes through a ref to the material's
  own `uniforms`, not through the memoized object passed as a prop. Only the
  material is guaranteed to be the instance bound to the compiled program.
