import ContactForm from "@/components/ContactForm";
import MapBackdrop from "@/components/scene/MapBackdrop";
import ProjectRegister from "@/components/ProjectRegister";
import Reveal from "@/components/Reveal";
import Section from "@/components/Section";
import SurveyRail from "@/components/SurveyRail";
import TopBar from "@/components/TopBar";
import { education, experience, profile, projects, sections, skills } from "@/content/portfolio";

const stationOf = (id: string) => sections.find((section) => section.id === id)!;

export default function Home() {
  return (
    <>
      <MapBackdrop />
      <TopBar />
      <SurveyRail />

      <main id="content">
        <section
          id="hero"
          className="flex min-h-screen flex-col justify-between px-6 pb-14 pt-28 sm:px-8 lg:pl-[34%] lg:pr-12"
        >
          <div className="max-w-4xl">
            <div
              className="rise flex flex-wrap items-baseline gap-x-6 gap-y-1"
              style={{ animationDelay: "60ms" }}
            >
              <span className="field-label">Traverse 01 — Golden, Colorado</span>
              <span className="field-label">39.7510° N 105.2220° W</span>
            </div>

            <h1 className="rise display-xl mt-6" style={{ animationDelay: "160ms" }}>
              Alex
              <br />
              Voneida
            </h1>
          </div>

          <div className="max-w-xl">
            <div
              className="rise border-t border-hairline pt-6"
              style={{ animationDelay: "280ms" }}
            >
              <p className="text-lg leading-relaxed text-fg/85">{profile.tagline}</p>
              <p className="mt-3 font-mono text-sm text-mute">
                Currently a software engineering intern at Raytheon.
              </p>
            </div>

            <div
              className="rise mt-7 flex flex-wrap items-center gap-x-2.5 gap-y-2.5"
              style={{ animationDelay: "380ms" }}
            >
              <a
                href={profile.resume}
                className="rounded-full bg-accent px-5 py-2.5 font-mono text-sm text-ground transition-colors hover:bg-fg"
              >
                Read the résumé
              </a>
              <a
                href="#contact"
                className="liquid-glass rounded-full px-5 py-2.5 font-mono text-sm text-fg/80 transition-colors hover:text-fg"
              >
                Get in touch
              </a>
              <a
                href={profile.github}
                className="liquid-glass rounded-full px-5 py-2.5 font-mono text-sm text-fg/80 transition-colors hover:text-fg"
              >
                GitHub
              </a>
              <a
                href={profile.linkedin}
                className="liquid-glass rounded-full px-5 py-2.5 font-mono text-sm text-fg/80 transition-colors hover:text-fg"
              >
                LinkedIn
              </a>
            </div>

            <p className="rise mt-10 field-label" style={{ animationDelay: "520ms" }}>
              {/* The spotlight needs a hovering pointer, so the hint only makes
                  sense where one exists. */}
              <span className="hidden md:inline">Move the cursor to read the survey · </span>
              Scroll to begin ↓
            </p>
          </div>
        </section>

        <Section id="education" label="Education" t={stationOf("education").t}>
          <Reveal>
            <h3 className="display-md">{education.school}</h3>
            <p className="mt-2 text-lg text-fg/85">{education.degree}</p>
            <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 font-mono text-sm text-mute">
              <span>{education.dates}</span>
              <span>
                GPA <span className="text-accent">{education.gpa}</span>
              </span>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="mt-9 border-t border-hairline pt-6">
              <p className="field-label">Relevant coursework</p>
              <ul className="mt-3 flex flex-wrap gap-x-2 gap-y-2">
                {education.coursework.map((course) => (
                  <li
                    key={course}
                    className="border border-hairline px-2.5 py-1 font-mono text-xs text-mute"
                  >
                    {course}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </Section>

        <Section id="experience" label="Experience" t={stationOf("experience").t}>
          <div className="space-y-12">
            {experience.map((role, index) => (
              <Reveal key={`${role.company}-${role.team}`} delay={index * 0.08}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                  <h3 className="display-md">
                    {role.company} <span className="text-mute">/ {role.team}</span>
                  </h3>
                  <span className="font-mono text-sm text-mute">{role.dates}</span>
                </div>
                <p className="mt-1 font-mono text-sm text-accent">{role.role}</p>
                <ul className="mt-5 space-y-3">
                  {role.highlights.map((highlight) => (
                    <li
                      key={highlight}
                      className="border-l border-hairline pl-4 text-[0.95rem] leading-relaxed text-fg/80"
                    >
                      {highlight}
                    </li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>
        </Section>

        <Section id="projects" label="Projects" t={stationOf("projects").t}>
          <Reveal>
            <ProjectRegister projects={projects} />
          </Reveal>
        </Section>

        <Section id="skills" label="Skills" t={stationOf("skills").t}>
          <div className="space-y-8">
            {skills.map((group, index) => (
              <Reveal key={group.group} delay={index * 0.06}>
                <div className="grid grid-cols-1 gap-2 border-t border-hairline pt-4 sm:grid-cols-[7rem_1fr] sm:gap-6">
                  <p className="field-label">{group.group}</p>
                  <p className="font-mono text-sm leading-relaxed text-fg/80">
                    {group.items.join("  ·  ")}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </Section>

        <Section id="contact" label="Contact" t={stationOf("contact").t}>
          <Reveal>
            <p className="text-lg leading-relaxed text-fg/85">
              I am looking for a new-grad software engineering role starting summer 2027, and
              an internship before then. Send me a note and I will reply.
            </p>
            <ContactForm />
            <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 font-mono text-sm">
              <a href={profile.github} className="text-mute transition-colors hover:text-fg">
                github.com/alexvoneida
              </a>
              <a href={profile.linkedin} className="text-mute transition-colors hover:text-fg">
                linkedin.com/in/alex-voneida
              </a>
              <a href={profile.resume} className="text-mute transition-colors hover:text-fg">
                Résumé (PDF)
              </a>
            </div>
          </Reveal>
        </Section>
      </main>

      <footer className="px-4 pb-[18vh] sm:px-8 lg:pl-[34%] lg:pr-10">
        <div
          data-panel
          className="inset-panel mx-auto w-full max-w-2xl px-6 py-9 lg:mx-0 lg:max-w-xl lg:px-10"
        >
          <p className="font-mono text-xs leading-relaxed text-mute">
            The valley behind this page is a ridged-multifractal heightmap rendered with React
            Three Fiber. Scroll position drives the camera along the valley floor; the station and
            elevation readouts sample the same height function the geometry is built from.
          </p>
          <p className="mt-4 font-mono text-xs text-mute">
            © {new Date().getFullYear()} {profile.name}
          </p>
        </div>
      </footer>
    </>
  );
}
