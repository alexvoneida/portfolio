import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import StaticRidges from "@/components/scene/StaticRidges";
import { profile, projects } from "@/content/portfolio";

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return projects.map((project) => ({ slug: project.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const project = projects.find((candidate) => candidate.slug === slug);
  if (!project) return {};

  return {
    title: `${project.name} — ${profile.name}`,
    description: project.blurb,
    alternates: { canonical: `/projects/${project.slug}` },
    openGraph: { title: project.name, description: project.blurb },
  };
}

export default async function ProjectPage({ params }: Params) {
  const { slug } = await params;
  const project = projects.find((candidate) => candidate.slug === slug);
  if (!project) notFound();

  return (
    <>
      <div className="pointer-events-none fixed inset-0 -z-10 bg-ground opacity-50" aria-hidden="true">
        <StaticRidges />
      </div>

      <main id="content" className="mx-auto w-full max-w-3xl px-6 pb-28 pt-16 sm:px-8">
        <Link href="/#projects" className="field-label transition-colors hover:text-accent">
          ← Back to the traverse
        </Link>

        <header className="mt-10 border-b border-hairline pb-8">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <span className="field-label">Record · {project.year}</span>
            {project.link && (
              <a
                href={project.link.href}
                className="font-mono text-xs text-accent transition-colors hover:text-fg"
              >
                {project.link.label} ↗
              </a>
            )}
          </div>
          <h1 className="display-xl mt-5">{project.name}</h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-fg/85">{project.blurb}</p>
          <p className="mt-6 font-mono text-xs leading-relaxed text-mute">
            {project.stack.join("  ·  ")}
          </p>
        </header>

        <section className="mt-14">
          <h2 className="field-label">The problem</h2>
          <p className="mt-4 max-w-2xl text-[1.05rem] leading-relaxed text-fg/80">
            {project.detail.problem}
          </p>
        </section>

        <section className="mt-14">
          <h2 className="field-label">What I did</h2>
          <ul className="mt-5 space-y-6">
            {project.detail.approach.map((step) => (
              <li
                key={step}
                className="max-w-2xl border-l border-hairline pl-5 text-[1.05rem] leading-relaxed text-fg/80"
              >
                {step}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-14">
          <h2 className="field-label">Where it landed</h2>
          <p className="mt-4 max-w-2xl text-[1.05rem] leading-relaxed text-fg/80">
            {project.detail.outcome}
          </p>
        </section>

        <section className="mt-14 border-t border-hairline pt-8">
          <h2 className="field-label">At a glance</h2>
          <ul className="mt-5 space-y-3">
            {project.highlights.map((highlight) => (
              <li key={highlight} className="flex gap-4 text-[0.95rem] leading-relaxed text-fg/80">
                <span aria-hidden="true" className="mt-2.5 h-px w-4 shrink-0 bg-accent" />
                {highlight}
              </li>
            ))}
          </ul>
        </section>

        <nav aria-label="Other projects" className="mt-20 border-t border-hairline pt-8">
          <p className="field-label">Other records</p>
          <ul className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
            {projects
              .filter((candidate) => candidate.slug !== project.slug)
              .map((candidate) => (
                <li key={candidate.slug}>
                  <Link
                    href={`/projects/${candidate.slug}`}
                    className="font-mono text-sm text-mute transition-colors hover:text-accent"
                  >
                    {candidate.name} →
                  </Link>
                </li>
              ))}
          </ul>
        </nav>
      </main>
    </>
  );
}
