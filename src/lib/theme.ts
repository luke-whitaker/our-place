// Client-side theme application. The authoritative copy of the user's choice
// lives on the user record (users.theme); localStorage ("op-theme") is an echo
// so the pre-paint script in layout.tsx can apply it before hydration.

export const THEMES = ["auto", "platinum", "terminal", "dusk"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_LABELS: Record<Theme, { name: string; blurb: string }> = {
  auto: { name: "Auto", blurb: "Platinum by day, Terminal by night" },
  platinum: { name: "Platinum", blurb: "Classic desktop — light, friendly, 1-bit" },
  terminal: { name: "Terminal", blurb: "Dark phosphor session — calm and quiet" },
  dusk: { name: "Pixel Dusk", blurb: "Warm paper and plum, from the world's universe" },
};

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/** Resolve "auto" to a concrete theme: platinum 7:00–18:59, terminal otherwise. */
export function resolveTheme(theme: Theme): Exclude<Theme, "auto"> {
  if (theme !== "auto") return theme;
  const hour = new Date().getHours();
  return hour >= 7 && hour < 19 ? "platinum" : "terminal";
}

/** Apply a theme to the document and echo it to localStorage. */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  try {
    localStorage.setItem("op-theme", theme);
  } catch {
    // Private browsing — theme still applies for this page view.
  }
  document.documentElement.dataset.theme = resolveTheme(theme);
}
