const ROWS = 9;
const SAMPLES = 96;

// Far ridges sit close to the haze; near ones fall away to almost nothing. On a
// dark ground the far layers are the *lighter* ones, which is the same
// inversion the terrain shader's fog produces.
const FAR = [20, 24, 14];
const NEAR = [6, 7, 5];

/**
 * Deterministic sum-of-sines ridges, filled and stacked back to front. Identical
 * on the server and the client, so this paints in the first HTML response and
 * needs no JS to be correct — it is the whole background when WebGL is absent.
 */
function ridgePath(row: number) {
  const progress = row / (ROWS - 1);
  const baseline = 34 + progress * 52;
  const amplitude = 5 + progress * 17;
  const points: string[] = [];

  for (let i = 0; i <= SAMPLES; i++) {
    const x = (i / SAMPLES) * 100;
    const crest =
      Math.sin(x * 0.09 + row * 1.3) * 0.55 +
      Math.sin(x * 0.23 + row * 2.1) * 0.3 +
      Math.sin(x * 0.47 + row * 0.7) * 0.15;
    const y = baseline - Math.abs(crest) * amplitude;
    points.push(`${x.toFixed(2)} ${y.toFixed(2)}`);
  }

  return `M -2 110 L -2 ${points[0].split(" ")[1]} L ${points.join(" L ")} L 102 110 Z`;
}

const rows = Array.from({ length: ROWS }, (_, row) => {
  const progress = row / (ROWS - 1);
  const channel = (index: number) =>
    Math.round(FAR[index] + (NEAR[index] - FAR[index]) * progress);
  return {
    row,
    d: ridgePath(row),
    fill: `rgb(${channel(0)} ${channel(1)} ${channel(2)})`,
  };
});

export default function StaticRidges() {
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {rows.map(({ row, d, fill }) => (
        <path key={row} d={d} fill={fill} />
      ))}
    </svg>
  );
}
