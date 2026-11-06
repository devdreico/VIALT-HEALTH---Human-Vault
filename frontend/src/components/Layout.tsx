import { Outlet, useNavigate } from "react-router-dom";
import { useTheme } from "../theme";

export default function Layout() {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen pb-7">
      <header className="flex items-center justify-between px-6 py-4">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-lg font-semibold tracking-tight"
        >
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
          VIALT
          <span className="text-xs font-normal text-muted">· Saniver</span>
        </button>
        <button
          onClick={toggle}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-text"
        >
          {theme === "dark" ? "Claro" : "Oscuro"}
        </button>
      </header>
      <Outlet />
      <footer
        className="fixed inset-x-0 bottom-0 z-40 h-7 border-t border-border bg-surface px-4
                   flex items-center justify-center text-center text-[10px] leading-tight text-muted"
      >
        ⚠ VIALT brinda información de apoyo — no sustituye el criterio de un
        profesional de la salud. Datos sensibles tratados bajo consentimiento
        (Ley 1581/2012).
      </footer>
    </div>
  );
}
