"use client";

import { useEffect, useRef } from "react";

import { pointerState, watchPointer } from "@/lib/pointer";

const CELL = 48;
const MAX_SHIFT = 16;
const EASE = 0.06;

/**
 * A drafting grid behind the landscape that drifts against the cursor. Its only
 * job is to give the layers something to part from — at 8% opacity it should
 * never be consciously noticed, only felt as depth.
 *
 * Oversized by twice the maximum shift so the edges never enter the viewport.
 */
export default function ParallaxGrid() {
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stopWatching = watchPointer();
    let frame = 0;
    let x = 0;
    let y = 0;

    const tick = () => {
      const targetX = ((pointerState.x / window.innerWidth) * 2 - 1) * MAX_SHIFT;
      const targetY = ((pointerState.y / window.innerHeight) * 2 - 1) * MAX_SHIFT;
      x += (targetX - x) * EASE;
      y += (targetY - y) * EASE;
      if (layer.current) {
        layer.current.style.transform = `translate3d(${-x.toFixed(2)}px, ${-y.toFixed(2)}px, 0)`;
      }
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
      ref={layer}
      className="absolute opacity-[0.08]"
      style={{ inset: `-${MAX_SHIFT * 2}px` }}
      aria-hidden="true"
    >
      <svg className="h-full w-full">
        <defs>
          <pattern id="draft-grid" width={CELL} height={CELL} patternUnits="userSpaceOnUse">
            <path
              d={`M ${CELL} 0 L 0 0 0 ${CELL}`}
              fill="none"
              stroke="#64748b"
              strokeWidth={0.6}
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#draft-grid)" />
      </svg>
    </div>
  );
}
