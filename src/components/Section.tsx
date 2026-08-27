import type { ReactNode } from "react";

import { elevationAt, stationLabel } from "@/lib/survey";

/**
 * Content sits right of centre on wide screens so the left half of the valley
 * stays visible behind it, and the survey rail has room to live there.
 */
export default function Section({
  id,
  label,
  t,
  children,
}: {
  id: string;
  label: string;
  t: number;
  children: ReactNode;
}) {
  return (
    <section id={id} className="my-[26vh] scroll-mt-20 px-4 sm:px-8 lg:pl-[34%] lg:pr-10">
      <div
        data-panel
        className="inset-panel mx-auto w-full max-w-2xl px-6 py-12 sm:py-14 lg:mx-0 lg:max-w-xl lg:px-10"
      >
        <div className="mb-10 flex items-baseline justify-between gap-4 border-b border-hairline pb-3">
          <h2 className="field-label text-fg!">
            <span className="text-mute">Sta {stationLabel(t)}</span> · {label}
          </h2>
          <span className="field-label">Elev {elevationAt(t)} m</span>
        </div>
        {children}
      </div>
    </section>
  );
}
