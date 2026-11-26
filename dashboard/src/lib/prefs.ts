import { useEffect, useState } from "react";

export type ThemeChoice = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const THEME_KEY = "yarnlens.theme";
const TOUR_KEY = "yarnlens.tour.dismissed";

/**
 * localStorage can throw in private modes and hardened browsers. Every access
 * is wrapped so a blocked store only loses the preference, never the page.
 */
function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage blocked: fall back to the in-memory choice */
  }
}

export function systemTheme(): ResolvedTheme {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function readTheme(): ThemeChoice {
  const stored = read(THEME_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

export function applyTheme(choice: ThemeChoice): ResolvedTheme {
  const resolved = choice === "system" ? systemTheme() : choice;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  return resolved;
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(readTheme);
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );

  useEffect(() => {
    setResolved(applyTheme(choice));
    write(THEME_KEY, choice);
  }, [choice]);

  useEffect(() => {
    if (choice !== "system") {
      return;
    }
    let media: MediaQueryList;
    try {
      media = window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return;
    }
    const onChange = () => setResolved(applyTheme("system"));
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [choice]);

  const toggle = () => setChoice(resolved === "dark" ? "light" : "dark");

  return { choice, resolved, toggle };
}

export function tourDismissed(): boolean {
  return read(TOUR_KEY) === "1";
}

export function rememberTourDismissed(): void {
  write(TOUR_KEY, "1");
}
