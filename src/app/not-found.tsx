import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-start justify-center px-6 sm:px-8">
      <span className="field-label">Off the traverse</span>
      <h1 className="display-xl mt-5">No survey record here</h1>
      <p className="mt-6 max-w-md leading-relaxed text-mute">
        That page does not exist. The projects register lists everything there is.
      </p>
      <Link
        href="/"
        className="mt-8 bg-accent px-5 py-2.5 font-mono text-sm text-ground transition-colors hover:bg-fg"
      >
        Back to the start
      </Link>
    </main>
  );
}
