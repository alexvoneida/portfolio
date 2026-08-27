"use client";

import { useEffect, useState } from "react";

export type SceneQuality = "off" | "low" | "high";

// three r163+ dropped WebGL1, and the terrain shader relies on GLSL3 derivatives,
// so anything without WebGL2 gets the static fallback rather than a broken canvas.
function supportsWebGL2() {
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}

/**
 * Decides whether the terrain flythrough renders, and how heavy it is allowed to
 * be. Undefined until the check has run so the server markup and the first
 * client paint agree.
 *
 * "low" trades mesh density and pixel ratio for battery on phones; "off" is the
 * static topographic fallback, which carries the same content.
 */
export function useSceneQuality() {
  const [quality, setQuality] = useState<SceneQuality | undefined>(undefined);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const small = window.matchMedia("(max-width: 767px)");

    const evaluate = () => {
      if (reducedMotion.matches || !supportsWebGL2()) {
        setQuality("off");
        return;
      }
      const weakDevice = small.matches || navigator.hardwareConcurrency <= 4;
      setQuality(weakDevice ? "low" : "high");
    };

    evaluate();
    reducedMotion.addEventListener("change", evaluate);
    small.addEventListener("change", evaluate);
    return () => {
      reducedMotion.removeEventListener("change", evaluate);
      small.removeEventListener("change", evaluate);
    };
  }, []);

  return quality;
}
