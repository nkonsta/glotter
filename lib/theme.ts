"use client";

type Theme = "light" | "dark";

const THEME_KEY = "glotter-theme";

const subscribers = new Set<() => void>();
let currentTheme: Theme = "light";
let hasExplicitPreference = false;
let initialized = false;

const mediaQuery = "(prefers-color-scheme: dark)";

function notify() {
  subscribers.forEach((callback) => callback());
}

function applyDocumentTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.dataset.theme = theme;
}

function readStoredPreference(): Theme | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return null;
}

function readSystemPreference(): Theme {
  if (typeof window === "undefined" || typeof window.matchMedia === "undefined") {
    return "light";
  }
  return window.matchMedia(mediaQuery).matches ? "dark" : "light";
}

function handleSystemChange(event: MediaQueryListEvent) {
  if (hasExplicitPreference) return;
  currentTheme = event.matches ? "dark" : "light";
  applyDocumentTheme(currentTheme);
  notify();
}

function ensureInitialized() {
  if (initialized || typeof window === "undefined") return;

  const stored = readStoredPreference();
  const system = readSystemPreference();

  if (stored) {
    currentTheme = stored;
    hasExplicitPreference = true;
  } else {
    currentTheme = system;
  }

  applyDocumentTheme(currentTheme);

  const mq = window.matchMedia(mediaQuery);
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", handleSystemChange);
  } else if (typeof mq.addListener === "function") {
    mq.addListener(handleSystemChange);
  }

  initialized = true;
}

function setTheme(theme: Theme) {
  ensureInitialized();
  currentTheme = theme;
  hasExplicitPreference = true;

  if (typeof window !== "undefined") {
    window.localStorage.setItem(THEME_KEY, theme);
  }

  applyDocumentTheme(theme);
  notify();
}

function clearStoredPreference() {
  hasExplicitPreference = false;
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(THEME_KEY);
  }
  setTheme(readSystemPreference());
}

function subscribe(callback: () => void) {
  ensureInitialized();
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

function getSnapshot(): Theme {
  ensureInitialized();
  return currentTheme;
}

function getServerSnapshot(): Theme {
  return currentTheme;
}

export const themeStore = {
  subscribe,
  getSnapshot,
  getServerSnapshot,
  setTheme,
  toggle() {
    setTheme(currentTheme === "dark" ? "light" : "dark");
  },
  useSystemPreference() {
    clearStoredPreference();
  },
};

export type { Theme };

