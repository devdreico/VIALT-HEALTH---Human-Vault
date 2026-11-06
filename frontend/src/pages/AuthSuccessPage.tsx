import { useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../stores/auth";

/** Recibe el token tras el callback de Google: /auth/success#token=… */
export default function AuthSuccessPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }
    async function finish() {
      if (!token) return;
      try {
        useAuth.getState().setAuth(token, {
          id: "",
          email: "",
          nombre: "…",
        });
        const me = await api.me(); // valida el token y trae los datos reales
        useAuth.getState().setUser(me);
        navigate("/", { replace: true });
      } catch {
        useAuth.getState().clear();
        navigate("/login", { replace: true });
      }
    }
    finish();
  }, [navigate]);

  return <Navigate to="/login" replace />;
}
