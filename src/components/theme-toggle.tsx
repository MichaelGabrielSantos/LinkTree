"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    try {
      setTheme((localStorage.getItem("ctx-theme") as Theme) || "system");
    } catch {}
  }, []);
  const next: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
  const label: Record<Theme, string> = { system: "Tema: automático", light: "Tema: claro", dark: "Tema: escuro" };
  return (
    <button
      type="button"
      className="rounded-lg px-2 py-1 text-sm text-ink-2 hover:bg-surface-2"
      aria-label={`${label[theme]}. Alternar tema`}
      onClick={() => {
        const t = next[theme];
        setTheme(t);
        try {
          localStorage.setItem("ctx-theme", t);
        } catch {}
        apply(t);
      }}
    >
      {theme === "dark" ? "Escuro" : theme === "light" ? "Claro" : "Auto"}
    </button>
  );
}

/** Executado antes da pintura para evitar flash de tema. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('ctx-theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){if(window.matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('dark');}})();`;
