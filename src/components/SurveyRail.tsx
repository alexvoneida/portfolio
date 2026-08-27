"use client";

import { useEffect, useRef } from "react";

import { sections } from "@/content/portfolio";
import { scrollState, watchScroll } from "@/lib/scroll";
import { elevationAt, stationLabel } from "@/lib/survey";

/**
 * The page's signature element: a survey rail reading live off the same terrain
 * functions the 3D scene is built from. Station and elevation are not decorative
 * numbers — they are the camera's actual position on the traverse.
 */
export default function SurveyRail() {
  const station = useRef<HTMLSpanElement>(null);
  const elevation = useRef<HTMLSpanElement>(null);
  const marker = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stopWatching = watchScroll();
    let frame = 0;
    let lastStation = "";
    let lastElevation = "";

    const tick = () => {
      const t = Math.min(1, Math.max(0, scrollState.progress));

      const nextStation = stationLabel(t);
      if (nextStation !== lastStation && station.current) {
        station.current.textContent = nextStation;
        lastStation = nextStation;
      }

      const nextElevation = `${elevationAt(t)} m`;
      if (nextElevation !== lastElevation && elevation.current) {
        elevation.current.textContent = nextElevation;
        lastElevation = nextElevation;
      }

      if (marker.current) marker.current.style.top = `${t * 100}%`;

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      stopWatching();
    };
  }, []);

  return (
    <div
      className="pointer-events-none fixed left-8 top-0 z-20 hidden h-screen w-40 flex-col justify-center lg:flex"
      aria-hidden="true"
    >
      <div className="mb-8 space-y-3">
        <div>
          <div className="field-label">Station</div>
          <span ref={station} className="font-mono text-lg tabular-nums text-fg">
            0+00
          </span>
        </div>
        <div>
          <div className="field-label">Crest elev</div>
          <span ref={elevation} className="font-mono text-lg tabular-nums text-accent">
            {elevationAt(0)} m
          </span>
        </div>
      </div>

      <div className="relative h-[42vh] w-px bg-hairline">
        {sections.map((section) => (
          <div
            key={section.id}
            className="absolute -left-1 h-px w-2.5 bg-hairline"
            style={{ top: `${section.t * 100}%` }}
          />
        ))}
        <div
          ref={marker}
          className="absolute -left-[3px] h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-accent"
        />
      </div>
    </div>
  );
}
