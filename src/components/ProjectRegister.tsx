import Link from "next/link";

import type { Project } from "@/content/portfolio";

/**
 * A register, not a card grid: recruiters scan a list far faster than they scan
 * boxes, and the log format matches the survey-record language of the page.
 */
export default function ProjectRegister({ projects }: { projects: Project[] }) {
  return (
    <ul className="border-t border-hairline">
      {projects.map((project) => (
        <li key={project.slug}>
          <Link
            href={`/projects/${project.slug}`}
            className="group grid grid-cols-1 gap-x-8 gap-y-3 border-b border-hairline py-7 sm:grid-cols-[1fr_auto]"
          >
            <div>
              <div className="flex items-center gap-3">
                <span className="h-px w-0 bg-accent transition-all duration-500 group-hover:w-8 group-focus-visible:w-8" />
                <h3 className="display-sm transition-transform duration-500 group-hover:translate-x-1 group-focus-visible:translate-x-1">
                  {project.name}
                </h3>
              </div>
              <p className="mt-2 max-w-md text-[0.95rem] leading-relaxed text-mute">
                {project.blurb}
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:items-end sm:text-right">
              <span className="field-label">{project.year}</span>
              <span className="max-w-[16rem] font-mono text-xs leading-relaxed text-mute">
                {project.stack.join(" · ")}
              </span>
              <span className="font-mono text-xs text-accent opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
                Open record →
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
