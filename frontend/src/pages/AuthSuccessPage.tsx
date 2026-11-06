import { useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../stores/auth";

/** Recibe el token tras el callback de Google: /auth/success#token=… */
export default function AuthSuccessPage() {
  const navigate = useNavigate();
  const initialized = useAuth((s) => s.initialized);
  const user = useAuth((s) => s.user);

  useEffect(() => {
    if (!initialized) return;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    api.onboardingStatus()
      .then(({ completado }) => navigate(completado ? "/" : "/onboarding", { replace: true }))
      .catch(() => navigate("/onboarding", { replace: true }));
  }, [initialized, navigate, user]);

  return initialized && !user ? <Navigate to="/login" replace /> : null;
}
