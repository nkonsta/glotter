"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Reveals its children with a fade-up the first time they scroll into view.
// Renders visible by default (SSR / no-JS / reduced-motion all show content); the
// hidden + reveal classes are applied imperatively after mount, so content is never
// hidden from crawlers or when JS is unavailable.
export function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.classList.add("reveal");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("reveal-in");
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={className || undefined}>
      {children}
    </div>
  );
}
