import { useEffect, useState } from "react";

type Theme = "dark" | "light";

function initial(): Theme {
  try {
    return localStorage.getItem("vialt-theme") === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initial);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("vialt-theme", theme);
    } catch {
      /* noop */
    }
  }, [theme]);

  return {
    theme,
    toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
  };
}
