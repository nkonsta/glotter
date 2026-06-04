import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Github, ArrowRight, ArrowUpRight } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Reveal } from "@/components/Reveal";
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

// The hero "type specimen" — one key (a greeting) across scripts. The final
// row is left for AI to draft, echoing the product's core promise.
const greetings = [
  { code: "en", word: "Hello" },
  { code: "es", word: "Hola" },
  { code: "fr", word: "Bonjour" },
  { code: "de", word: "Hallo" },
  { code: "el", word: "Γειά σου" },
  { code: "ja", word: "こんにちは" },
  { code: "ko", word: "안녕하세요" },
  { code: "ar", word: "مرحبا", rtl: true },
];

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
    <main className="landing-page landing-grain relative min-h-screen overflow-hidden">
      <div className="relative z-10">
        {/* Header */}
        <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <div className="flex items-center gap-2.5">
            <Image src="/chinese.svg" alt="" width={26} height={26} className="h-6 w-6" priority />
            <span className="font-display text-xl font-semibold tracking-tight text-ink">
              Glotter
            </span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-ink-soft transition-colors hover:text-ink sm:inline-flex"
            >
              <Github className="h-4 w-4" />
              GitHub
            </a>
            <Link
              href="/dashboard"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
            >
              Open app
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </header>

        <div className="h-px w-full bg-[hsl(var(--rule))]" />

        {/* Hero — asymmetric, left-aligned */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-12 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr]">
          {/* Left: the pitch */}
          <div>
            <p
              className="landing-rise font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-[0.22em] text-accent"
              style={{ animationDelay: "40ms" }}
            >
              Localization, edited like a manuscript
            </p>
            <h1
              className="landing-rise mt-6 font-display text-5xl font-semibold leading-[0.95] tracking-[-0.02em] text-ink sm:text-6xl lg:text-7xl"
              style={{ animationDelay: "120ms" }}
            >
              Every language,
              <br />
              <span className="italic text-accent">side by side</span>.
            </h1>
            <p
              className="landing-rise mt-7 max-w-xl text-pretty text-lg leading-relaxed text-ink-soft"
              style={{ animationDelay: "200ms" }}
            >
              Import your locale files, edit every language for a key in one row, and let AI draft
              what&apos;s missing — the tool you&apos;d reach for instead of Lokalise, Crowdin, or
              Phrase.
            </p>
            <div
              className="landing-rise mt-9 flex flex-wrap items-center gap-3"
              style={{ animationDelay: "280ms" }}
            >
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-ink px-5 text-sm font-medium text-paper transition-transform hover:-translate-y-0.5"
              >
                <Github className="h-4 w-4" />
                View the code on GitHub
              </a>
              <Link
                href="/dashboard"
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-rule px-5 text-sm font-medium text-ink transition-colors hover:bg-paper-2"
              >
                Open app
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* Right: the type specimen — one key, many scripts */}
          <figure className="landing-rise" style={{ animationDelay: "240ms" }}>
            <div className="overflow-hidden rounded-xl border border-rule bg-paper-2 shadow-card">
              <div className="flex items-center justify-between border-b border-rule px-5 py-3">
                <span className="font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-[0.18em] text-ink-soft">
                  key · greeting
                </span>
                <span className="font-[family-name:var(--font-geist-mono)] text-xs text-ink-soft">
                  9 languages
                </span>
              </div>
              <ul>
                {greetings.map((g, i) => (
                  <li
                    key={g.code}
                    className="landing-rise flex items-baseline gap-5 border-b border-rule px-5 py-3"
                    style={{ animationDelay: `${360 + i * 70}ms` }}
                  >
                    <span className="w-7 shrink-0 font-[family-name:var(--font-geist-mono)] text-xs uppercase text-ink-soft">
                      {g.code}
                    </span>
                    <span
                      dir={g.rtl ? "rtl" : undefined}
                      className="font-display text-2xl text-ink"
                    >
                      {g.word}
                    </span>
                  </li>
                ))}
                {/* The row AI fills in — a nod to the Chinese-character logo */}
                <li
                  className="landing-rise flex items-baseline gap-5 px-5 py-3"
                  style={{ animationDelay: `${360 + greetings.length * 70}ms` }}
                >
                  <span className="w-7 shrink-0 font-[family-name:var(--font-geist-mono)] text-xs uppercase text-ink-soft">
                    zh
                  </span>
                  <span className="landing-shimmer font-display text-2xl italic text-accent">
                    drafting…
                  </span>
                  <span className="ml-auto self-center font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.18em] text-accent">
                    AI
                  </span>
                </li>
              </ul>
            </div>
          </figure>
        </section>

        {/* Figure — the real editor */}
        <section className="mx-auto max-w-6xl px-6 pb-24">
          <figure>
            <div className="overflow-hidden rounded-xl border border-rule bg-paper-2 shadow-card">
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
            <figcaption className="mt-4 font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-[0.18em] text-ink-soft">
              Fig. 1 — The editor: every language for a key, in one row.
            </figcaption>
          </figure>
        </section>

        {/* What it is — editorial intro with a drop cap */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <Reveal>
          <p className="font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-[0.22em] text-accent">
            What it is
          </p>
          <p className="drop-cap mt-6 max-w-3xl font-display text-2xl leading-relaxed text-ink">
            Glotter is a translation management system for multi-language products — the kind of tool
            you&apos;d reach for instead of Lokalise, Crowdin, Phrase, or Tolgee. You bring your
            locale files, edit every language for a key in one place, and lean on AI to draft
            what&apos;s missing. Built to make managing real, growing translation sets feel fast
            rather than fragile.
          </p>
          </Reveal>
        </section>

        {/* Capabilities — numbered editorial list, not cards */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <Reveal>
          <p className="font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-[0.22em] text-accent">
            Capabilities
          </p>
          <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            What you can do with it
          </h2>
          <ol className="mt-12 border-t border-rule">
            {capabilities.map((cap, i) => (
              <li
                key={cap.title}
                className="grid gap-x-8 gap-y-2 border-b border-rule py-8 sm:grid-cols-[auto_15rem_1fr]"
              >
                <span className="font-display text-3xl font-light leading-none text-accent">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="font-display text-xl text-ink">{cap.title}</h3>
                <p className="max-w-md text-ink-soft">{cap.body}</p>
              </li>
            ))}
          </ol>
          </Reveal>
        </section>

        {/* Colophon — how it's built (the production notes) */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <Reveal>
          <p className="font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-[0.22em] text-accent">
            Colophon
          </p>
          <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            How it&apos;s built
          </h2>
          <p className="mt-4 max-w-2xl text-lg text-ink-soft">
            A real architecture, not a toy — a server-rendered frontend, a Postgres-backed data
            layer, scoped access control, and a server-side AI integration.
          </p>
          <dl className="mt-10 border-t border-rule">
            {stack.map((item) => (
              <div
                key={item.label}
                className="flex flex-col gap-1 border-b border-rule py-5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-8"
              >
                <dt className="font-display text-lg text-ink">{item.label}</dt>
                <dd className="max-w-md text-ink-soft sm:text-right">{item.detail}</dd>
              </div>
            ))}
          </dl>
          </Reveal>
        </section>

        {/* Closing */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <Reveal>
          <h2 className="max-w-2xl font-display text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl">
            Bring your locale files.
            <br />
            <span className="italic text-accent">Start editing.</span>
          </h2>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-ink px-5 text-sm font-medium text-paper transition-transform hover:-translate-y-0.5"
            >
              Open app
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-rule px-5 text-sm font-medium text-ink transition-colors hover:bg-paper-2"
            >
              <Github className="h-4 w-4" />
              View the code
            </a>
          </div>
          </Reveal>
        </section>

        {/* Footer */}
        <footer className="mx-auto max-w-6xl px-6 py-12">
          <div className="flex flex-col items-start justify-between gap-4 border-t border-rule pt-8 sm:flex-row sm:items-center">
            <p className="font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-[0.18em] text-ink-soft">
              Glotter — built by Nick Konstantinou
            </p>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-ink-soft transition-colors hover:text-ink"
            >
              <Github className="h-4 w-4" />
              GitHub repository
            </a>
          </div>
        </footer>
      </div>
    </main>
  );
}
