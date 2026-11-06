import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../stores/auth";

export default function Protected() {
  const token = useAuth((s) => s.token);
  const location = useLocation();

  if (!token) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <Outlet />;
}
