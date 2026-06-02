import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Github, ArrowRight } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
// Hero assets — real screenshots of the editor, one per theme. The visible one
// is toggled via CSS (.hero-theme-* in globals.css) based on the active theme.
// Served `unoptimized` (raw file via CDN) so they don't consume Vercel image
// optimization quota. Swap for a screen recording (GIF/MP4) later if you want motion.
import heroLight from "@/public/hero-light.jpg";
import heroDark from "@/public/hero-dark.jpg";

const GITHUB_URL = "https://github.com/nkonsta/glotter";

const TITLE = "Glotter — AI-assisted localization management";
const DESCRIPTION =
  "Import your language files, edit every language side by side, and let AI draft the rest. A multi-language translation manager built with Next.js and Supabase.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Glotter",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

const capabilities = [
  {
    title: "Multi-project structure",
    body: "Organize translations into separate projects, each with its own languages and members.",
  },
  {
    title: "Per-language JSON import",
    body: "Bring your existing locale files in directly — import each language's JSON and pick up where you left off.",
  },
  {
    title: "Side-by-side editing",
    body: "See and edit every language for a key in one row. No tab-switching, no lost context.",
  },
  {
    title: "AI-assisted translation",
    body: "Let AI draft missing translations across languages, then review and refine inline.",
  },
  {
    title: "Role-based access control",
    body: "Invite collaborators per project with roles that scope what they can see and change.",
  },
];

const stack = [
  { label: "Next.js", detail: "App Router, React Server Components, static landing." },
  { label: "Supabase", detail: "Postgres data layer plus authentication." },
  { label: "Role-based access", detail: "Per-project membership and permissions." },
  { label: "AI translation", detail: "Server-side model integration for drafting." },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <Image src="/chinese.svg" alt="" width={28} height={28} className="h-7 w-7" priority />
          <span className="text-lg font-semibold tracking-tight">Glotter</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/dashboard"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-surface-hover"
          >
            Open app
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-12 pt-10 text-center sm:pt-16">
        <h1 className="mx-auto max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-5xl">
          Localization management with AI-assisted translation
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg text-muted">
          Import your language files, edit every language side by side, and let AI draft the rest —
          in the same category as Lokalise, Crowdin, and Phrase.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Github className="h-4 w-4" />
            View the code on GitHub
          </a>
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-surface px-5 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover"
          >
            Open app
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Hero media — PLACEHOLDER, replace with a real recording */}
        <div className="mx-auto mt-14 max-w-5xl overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          <Image
            src={heroLight}
            alt="The Glotter editor showing translation keys edited side by side across English and Spanish"
            className="hero-theme-light h-auto w-full"
            unoptimized
            priority
          />
          <Image
            src={heroDark}
            alt=""
            aria-hidden
            className="hero-theme-dark h-auto w-full"
            unoptimized
          />
        </div>
      </section>

      {/* What it is */}
      <section className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">What it is</h2>
        <p className="mt-4 text-pretty text-lg text-muted">
          Glotter is a translation management system for multi-language products — the kind of tool
          you&apos;d reach for instead of Lokalise, Crowdin, Phrase, or Tolgee. You bring your locale
          files, edit every language for a key in one place, and lean on AI to draft what&apos;s
          missing. Built to make managing real, growing translation sets feel fast rather than
          fragile.
        </p>
      </section>

      {/* Key capabilities */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center text-2xl font-semibold tracking-tight">Key capabilities</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((cap) => (
            <div
              key={cap.title}
              className="rounded-xl border border-border bg-surface p-6 text-left transition-colors hover:bg-surface-hover"
            >
              <h3 className="font-semibold tracking-tight">{cap.title}</h3>
              <p className="mt-2 text-sm text-muted">{cap.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it's built */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="rounded-2xl border border-border bg-surface p-8 sm:p-10">
          <h2 className="text-2xl font-semibold tracking-tight">How it&apos;s built</h2>
          <p className="mt-3 max-w-2xl text-muted">
            A real architecture, not a toy — server-rendered frontend, a Postgres-backed data layer,
            scoped access control, and a server-side AI integration.
          </p>
          <div className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2">
            {stack.map((item) => (
              <div key={item.label} className="border-l-2 border-border-strong pl-4">
                <div className="font-medium">{item.label}</div>
                <div className="mt-1 text-sm text-muted">{item.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col items-center justify-between gap-4 border-t border-border pt-8 sm:flex-row">
          <p className="text-sm text-muted">Built by Nick Konstantinou.</p>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-foreground"
          >
            <Github className="h-4 w-4" />
            GitHub repository
          </a>
        </div>
      </footer>
    </main>
  );
}
