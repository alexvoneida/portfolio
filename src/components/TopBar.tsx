"use client";

import { useEffect, useState } from "react";

import Monogram from "./Monogram";
import { profile, sections } from "@/content/portfolio";

const navSections = sections.slice(1);

/** Shared by the desktop CTA and the mobile menu's, so the two never drift. */
function AvailabilityDot() {
  return <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />;
}

export default function TopBar() {
  const [activeId, setActiveId] = useState(sections[0].id);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Several sections can straddle the band at once; the one closest to the
        // top of it wins, which matches what the reader is actually looking at.
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveId(visible.target.id as (typeof sections)[number]["id"]);
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );

    for (const section of sections) {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <>
      <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex items-center justify-between px-5 py-4 sm:px-7">
        <a
          href="#hero"
          className="pointer-events-auto text-fg transition-opacity hover:opacity-70"
          aria-label={`${profile.name} — back to top`}
        >
          <Monogram className="h-7 w-7" />
        </a>

        <nav
          aria-label="Sections"
          className="liquid-glass glass-header pointer-events-auto absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 rounded-full px-2 py-1.5 md:flex"
        >
          {navSections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              aria-current={activeId === section.id ? "true" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                activeId === section.id ? "text-fg" : "text-fg/70 hover:text-fg"
              }`}
            >
              {section.label}
            </a>
          ))}
        </nav>

        <a
          href={profile.resume}
          className="liquid-glass glass-header pointer-events-auto hidden items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-fg md:flex"
        >
          <AvailabilityDot />
          Résumé
        </a>

        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-expanded={menuOpen}
          aria-label="Open menu"
          className="liquid-glass glass-header pointer-events-auto flex flex-col items-end gap-1.5 rounded-full px-4 py-3 md:hidden"
        >
          <span className="h-[1.5px] w-5 bg-fg" />
          <span className="h-[1.5px] w-3.5 bg-fg" />
        </button>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-55 flex flex-col bg-[#0a0a0a] md:hidden">
          <div className="flex justify-end px-5 py-4">
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
              className="liquid-glass menu-close-in relative flex h-11 w-11 items-center justify-center rounded-full"
            >
              <span className="absolute h-[1.5px] w-5 rotate-45 bg-fg" />
              <span className="absolute h-[1.5px] w-5 -rotate-45 bg-fg" />
            </button>
          </div>

          <nav
            aria-label="Sections"
            className="flex flex-1 flex-col items-center justify-center gap-6"
          >
            {navSections.map((section, index) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                onClick={() => setMenuOpen(false)}
                className="menu-item-in text-3xl font-medium text-fg/90 sm:text-4xl"
                style={{ animationDelay: `${100 + index * 60}ms` }}
              >
                {section.label}
              </a>
            ))}
          </nav>

          <div className="flex justify-center px-6 pb-14">
            <a
              href={profile.resume}
              onClick={() => setMenuOpen(false)}
              className="liquid-glass menu-item-in flex items-center gap-2 rounded-full px-6 py-3 text-base font-medium text-fg"
              style={{ animationDelay: `${100 + navSections.length * 60}ms` }}
            >
              <AvailabilityDot />
              Résumé
            </a>
          </div>
        </div>
      )}
    </>
  );
}
