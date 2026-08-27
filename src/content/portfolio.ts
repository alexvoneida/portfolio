export const profile = {
  name: "Alex Voneida",
  title: "Software Engineer",
  tagline:
    "Senior CS student at Colorado School of Mines. I build systems that stay fast when the data gets big.",
  location: "Golden, Colorado",
  email: "alexvoneida@gmail.com",
  phone: "719-210-3203",
  github: "https://github.com/alexvoneida",
  linkedin: "https://www.linkedin.com/in/alex-voneida",
  resume: "/alex-voneida-resume.pdf",
} as const;

export const education = {
  school: "Colorado School of Mines",
  degree: "B.S. Computer Science — Data Science",
  dates: "Aug 2024 — May 2027",
  gpa: "3.88",
  coursework: [
    "Data Structures and Algorithms",
    "Database Management",
    "Advanced Data Science",
    "Software Engineering",
    "Systems Programming",
    "Linear Algebra",
    "Statistics",
    "Probability",
  ],
} as const;

export type Experience = {
  role: string;
  company: string;
  team: string;
  dates: string;
  highlights: string[];
};

export const experience: Experience[] = [
  {
    role: "Software Engineering Intern",
    company: "Raytheon",
    team: "CCT",
    dates: "Jun 2026 — Present",
    highlights: [
      "Converted 20+ legacy Python tests to Pytest with Pexpect for automated terminal testing, surfacing real bugs in 3 of them.",
      "Added linting and type checking across 30+ test modules to hold the suite to one standard.",
      "Built CI stages for random-order execution, linting, and formatting on Docker and Jenkins.",
      "Parallelized the suite, cutting wall-clock runtime from 35 minutes to 16.",
    ],
  },
  {
    role: "Software Engineering Intern",
    company: "Raytheon",
    team: "WIGS",
    dates: "Jun 2026 — Present",
    highlights: [
      "Prototyped and shipped Angular common-ui library components used by 5+ internal reuser teams.",
    ],
  },
];

export type Project = {
  slug: string;
  name: string;
  blurb: string;
  year: string;
  stack: string[];
  link?: { label: string; href: string };
  repo?: string;
  highlights: string[];
  detail: {
    problem: string;
    approach: string[];
    outcome: string;
  };
};

export const projects: Project[] = [
  {
    slug: "ante",
    name: "Ante",
    blurb: "Real-time planning poker with no signup, built server-authoritative.",
    year: "2026",
    stack: ["React 19", "Next.js 16", "TypeScript", "PostgreSQL", "Supabase Realtime"],
    link: { label: "anteboard.com", href: "https://www.anteboard.com" },
    highlights: [
      "Supports 100 concurrent participants per room over a realtime channel.",
      "Server-authoritative: clients hold zero database access, enforced with RLS-deny.",
      "Cut list reordering from ~200 database round trips to 1.",
      "Rewrote 3 queries that silently returned partial results past 1,000 rows.",
    ],
    detail: {
      problem:
        "Estimation tools all demand an account before a team can point a single story. Ante had to be usable by a stranger in under five seconds, and still be safe enough that a room full of anonymous clients cannot corrupt each other's state.",
      approach: [
        "Every mutation goes through a server route that owns the invariants. Row-level security denies the anon key outright, so a client cannot read or write a table even if it tries — the browser bundle simply has no path to the database.",
        "Reordering a backlog originally issued one update per story. Replacing it with a single ordered bulk statement collapsed ~200 round trips into one, which is the difference between a visibly laggy drag and an instant one.",
        "Three list queries were relying on the default page size and quietly truncating once a room passed 1,000 rows. Explicit ranges and ordering fixed a class of bug that no test was catching because no test room was big enough.",
        "Presence and vote reveal ride on Supabase Realtime channels rather than polling, so a 100-person room costs one socket per participant instead of a request storm.",
      ],
      outcome:
        "A room is live on the first click, holds 100 participants, and the client is structurally incapable of writing to the database.",
    },
  },
  {
    slug: "nba-predictor",
    name: "NBA Stat Predictor",
    blurb: "A multi-output neural net predicting points, rebounds, assists, and FG% per game.",
    year: "2025",
    stack: ["Python", "PyTorch", "PostgreSQL", "Parquet", "Flask", "NBA-API"],
    highlights: [
      "Ingested and normalized 500,000 player game logs from NBA-API.",
      "Multi-output network predicting PTS, REB, AST, and FG% from one shared trunk.",
      "Engineered rolling averages, rest days, and opponent-defense features.",
      "Moved storage from CSV to Parquet for 40% faster save/load.",
    ],
    detail: {
      problem:
        "Per-game box score lines are noisy. A player's next game is a function of recent form, rest, and who they are playing — none of which appear in a raw season average.",
      approach: [
        "Pulled 500k game logs from NBA-API into PostgreSQL, then snapshotted to Parquet for training. Parquet's columnar layout cut save/load time by ~40% over CSV and made feature columns cheap to read in isolation.",
        "Built rolling-window features (last 3, 5, 10 games), rest-day gaps, home/away splits, and opponent defensive ratings so the model sees form and matchup, not just career means.",
        "One shared trunk with four heads predicts PTS, REB, AST, and FG% together. The targets are correlated — usage drives all four — so a shared representation beats four independent models on the same data.",
        "Reported MAE per target on a held-out test split rather than a single aggregate loss, since the four targets live on completely different scales.",
      ],
      outcome:
        "A reproducible pipeline from API to trained model to a Flask dashboard, running off a local snapshot so the site does not need the university database to stay up.",
    },
  },
  {
    slug: "photomosaic",
    name: "Photomosaic Generator",
    blurb: "Rebuilds any image out of thousands of smaller images, at arbitrary tile density.",
    year: "2025",
    stack: ["Python", "OpenCV", "NumPy"],
    highlights: [
      "Renders a target image as a mosaic at a caller-specified tile count.",
      "Custom compression pass that respects each source image's aspect ratio.",
      "OpenCV vectorized matching for an ~80% speedup over the naive loop.",
    ],
    detail: {
      problem:
        "A photomosaic is a nearest-neighbor search repeated once per tile. Done naively in Python it is unusably slow, and naive resizing distorts every source image that is not square.",
      approach: [
        "Tile matching reduces to comparing mean color in a small feature space. Batching that comparison through NumPy and OpenCV instead of a per-tile Python loop produced roughly an 80% speedup.",
        "Source images are center-cropped to the target tile aspect ratio before downscaling, so a 16:9 photo contributes its subject rather than a squashed version of it.",
        "Tile count is a parameter, not a constant, which means the same source library renders a coarse 40x40 poster or a dense 400x400 print without re-preprocessing.",
      ],
      outcome:
        "A generator that turns a photo library plus a target image into a print-resolution mosaic in seconds instead of minutes.",
    },
  },
];

export const skills = [
  { group: "Languages", items: ["Python", "C", "C++", "TypeScript", "Java", "R", "SQL"] },
  { group: "Frameworks", items: ["React", "Next.js", "Angular", "PyTorch", "Pytest", "Flask"] },
  {
    group: "Tools",
    items: ["Git", "Docker", "Jenkins", "PostgreSQL", "Linux", "Jira", "Bitbucket", "Jupyter"],
  },
  { group: "Libraries", items: ["Pandas", "NumPy", "OpenCV", "Matplotlib", "Plotly", "Pexpect"] },
] as const;

export type SectionId =
  | "hero"
  | "education"
  | "experience"
  | "projects"
  | "skills"
  | "contact";

/**
 * `t` is normalized progress along the camera's flight path. The 3D scene and the
 * DOM sections are driven from this one list so a section can never drift out of
 * sync with the waypoint it is supposed to be flying over.
 */
export const sections: { id: SectionId; label: string; t: number }[] = [
  { id: "hero", label: "Start", t: 0 },
  { id: "education", label: "Education", t: 0.16 },
  { id: "experience", label: "Experience", t: 0.36 },
  { id: "projects", label: "Projects", t: 0.62 },
  { id: "skills", label: "Skills", t: 0.84 },
  { id: "contact", label: "Contact", t: 1 },
];
