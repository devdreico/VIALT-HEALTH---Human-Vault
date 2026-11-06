import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../stores/auth";

export default function Protected() {
  const token = useAuth((s) => s.token);
  const initialized = useAuth((s) => s.initialized);
  const location = useLocation();

  if (!initialized) {
    return <main className="mx-auto max-w-lg px-6 py-14 text-sm text-muted">Cargando sesión…</main>;
  }
  if (!token) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <Outlet />;
}
