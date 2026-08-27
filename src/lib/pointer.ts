"use client";

/**
 * Live pointer position in CSS pixels, kept outside React for the same reason as
 * scroll progress: the shader samples it every frame and the parallax grid
 * writes it straight to a transform. Neither needs a re-render.
 *
 * `engaged` stays false until the pointer actually moves, so the spotlight does
 * not sit parked in a corner before the visitor has touched anything — and on
 * touch devices, which never fire pointermove without a press, it never turns on
 * at all. It also drops back to false over a content panel: a pool of light
 * behind copy the visitor is reading is a distraction, and the panel is opaque
 * enough that most of it would be wasted there anyway.
 */
export const pointerState = { x: 0, y: 0, engaged: false };

let subscribers = 0;
let detach: (() => void) | null = null;

export function watchPointer() {
  if (subscribers === 0) {
    const onMove = (event: PointerEvent) => {
      // Coarse pointers report a position on tap; a spotlight that jumps to
      // wherever the visitor last tapped reads as a glitch, not an effect.
      if (event.pointerType !== "mouse") return;
      // Position keeps tracking while the pointer is over a panel, so the
      // spotlight is already in the right place when it comes back out instead
      // of sliding across the valley to catch up.
      pointerState.x = event.clientX;
      pointerState.y = event.clientY;
      const target = event.target;
      pointerState.engaged = !(target instanceof Element && target.closest("[data-panel]"));
    };
    const onLeave = () => {
      pointerState.engaged = false;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    detach = () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }
  subscribers++;

  return () => {
    subscribers--;
    if (subscribers === 0) {
      detach?.();
      detach = null;
    }
  };
}
