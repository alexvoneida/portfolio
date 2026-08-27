import type { Metadata } from "next";
import { Instrument_Sans, Instrument_Serif, JetBrains_Mono } from "next/font/google";

import { profile } from "@/content/portfolio";
import "./globals.css";

// Instrument Serif has a single weight; its sibling sans carries the body copy
// so the two faces share a designer rather than merely coexisting.
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const siteUrl = "https://alexvoneida.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: `${profile.name} — ${profile.title}`,
  description: profile.tagline,
  openGraph: {
    type: "profile",
    title: `${profile.name} — ${profile.title}`,
    description: profile.tagline,
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: `${profile.name} — ${profile.title}`,
    description: profile.tagline,
  },
  alternates: { canonical: "/" },
};

const personSchema = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: profile.name,
  jobTitle: profile.title,
  url: siteUrl,
  sameAs: [profile.github, profile.linkedin],
  alumniOf: { "@type": "CollegeOrUniversity", name: "Colorado School of Mines" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${instrumentSans.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-60 focus:bg-accent focus:px-4 focus:py-2 focus:font-mono focus:text-sm focus:text-ground"
        >
          Skip to content
        </a>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }}
        />
      </body>
    </html>
  );
}
