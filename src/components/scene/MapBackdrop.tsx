"use client";

import dynamic from "next/dynamic";

import { useSceneQuality } from "@/lib/capabilities";
import ParallaxGrid from "./ParallaxGrid";
import StaticRidges from "./StaticRidges";

// Kept out of the initial bundle: three plus the scene is the single largest
// chunk on the site, and none of the page's content depends on it.
const TerrainScene = dynamic(() => import("./TerrainScene"), { ssr: false });

export default function MapBackdrop() {
  const quality = useSceneQuality();
  const showScene = quality === "high" || quality === "low";

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 bg-[#050505]" aria-hidden="true">
      <StaticRidges />
      {showScene && (
        <div className="absolute inset-0 animate-[fade-in_900ms_ease-out_both]">
          <TerrainScene quality={quality} />
        </div>
      )}
      {/* Above the canvas, not behind it: the canvas paints an opaque frame
          every tick, so a grid underneath would never be seen. */}
      <ParallaxGrid />
      {/* Sinks the top of the frame toward black so the fixed header and the
          hero type always have a quiet field to sit on. */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(5,5,5,0.85)_0%,rgba(5,5,5,0.3)_22%,rgba(5,5,5,0)_50%)]" />
    </div>
  );
}
