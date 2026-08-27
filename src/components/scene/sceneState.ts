"use client";

import * as THREE from "three";

/** Spotlight radius in CSS pixels, scaled to device pixels by the driver. */
export const SPOTLIGHT_RADIUS = 260;

/**
 * A device either has a hovering pointer for the whole visit or it does not,
 * and this only decides how much of the landscape is lit without one.
 */
const canHover =
  typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches;

/**
 * Per-frame scene state shared by every material. The terrain, the water, the
 * grass and the trees all need the same camera position and the same spotlight,
 * and recomputing the pointer easing in four `useFrame` callbacks would let them
 * drift a frame apart from each other.
 */
export const sceneState = {
  cameraPosition: new THREE.Vector3(),
  cursor: new THREE.Vector2(),
  radius: SPOTLIGHT_RADIUS,
  reveal: 0,
  /**
   * Floor under the spotlight: a hint of landscape on desktop before the first
   * mouse move, much more on devices that cannot hover, where a pure spotlight
   * would leave an empty black frame.
   */
  // Low, because the lit layer now contains bright rock, foliage and water:
  // a few percent of that is already plainly visible, and the near-black frame
  // is what makes the spotlight read as light rather than as a brightness pass.
  baseLight: canHover ? 0.07 : 0.3,
};

export type SpotlightUniforms = {
  uCamPos: { value: THREE.Vector3 };
  uCursor: { value: THREE.Vector2 };
  uRadius: { value: number };
  uReveal: { value: number };
  uBaseLight: { value: number };
};

export function spotlightUniforms(): SpotlightUniforms {
  return {
    uCamPos: { value: new THREE.Vector3() },
    uCursor: { value: new THREE.Vector2() },
    uRadius: { value: SPOTLIGHT_RADIUS },
    uReveal: { value: 0 },
    uBaseLight: { value: sceneState.baseLight },
  };
}

/** Copies the frame's shared state into one material's uniforms. */
export function syncSpotlight(uniforms: SpotlightUniforms) {
  uniforms.uCamPos.value.copy(sceneState.cameraPosition);
  uniforms.uCursor.value.copy(sceneState.cursor);
  uniforms.uRadius.value = sceneState.radius;
  uniforms.uReveal.value = sceneState.reveal;
  uniforms.uBaseLight.value = sceneState.baseLight;
}
