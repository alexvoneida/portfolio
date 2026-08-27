"use client";

/**
 * Scroll progress lives outside React on purpose: the 3D scene reads it every
 * frame in `useFrame` and the survey rail writes it straight to the DOM, so
 * routing it through state would re-render the tree 60 times a second for a
 * value no rendered output depends on.
 */
export const scrollState = { progress: 0 };

let subscribers = 0;
let detach: (() => void) | null = null;

function measure() {
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  scrollState.progress = scrollable > 0 ? window.scrollY / scrollable : 0;
}

/**
 * Refcounted so several consumers share one listener, and the listener still
 * goes away when the last of them unmounts.
 */
export function watchScroll() {
  if (subscribers === 0) {
    measure();
    const onScroll = () => measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    detach = () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
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
