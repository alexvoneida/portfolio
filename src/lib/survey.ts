import { TERRAIN, flightPointAt, heightAt } from "./terrain";

/**
 * Survey stations are measured in 100-unit chainage, written as `chains+offset`.
 * Deriving the label from the same `t` that drives the camera means a section's
 * station and its position in the flythrough can never disagree.
 */
export function stationLabel(t: number) {
  const distance = t * TERRAIN.depth;
  const chains = Math.floor(distance / 100);
  const offset = Math.round(distance % 100);
  return `${chains}+${String(offset).padStart(2, "0")}`;
}

/** Ridge crest beside the path, offset to a Front Range elevation. */
export function elevationAt(t: number) {
  const [x, , z] = flightPointAt(t);
  const crest = Math.max(heightAt(x + 210, z), heightAt(x - 210, z));
  return Math.round(1720 + crest);
}
