import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { useAuth } from "../stores/auth";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(true);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!isSupabaseConfigured) throw new Error("Supabase no está configurado.");
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.session || !data.user) throw new Error("No se pudo iniciar la sesión.");
      useAuth.getState().setAuth(data.session.access_token, {
        id: data.user.id,
        email: data.user.email ?? email,
        nombre: String(data.user.user_metadata.nombre ?? data.user.user_metadata.full_name ?? data.user.email?.split("@")[0] ?? "Usuario"),
        picture: data.user.user_metadata.avatar_url ?? null,
      });
      const { completado } = await api.onboardingStatus();
      navigate(from ?? (completado ? "/" : "/onboarding"), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  async function signInWithGoogle() {
    setError(null);
    setGoogleEnabled(false);
    try {
      if (!isSupabaseConfigured) throw new Error("Supabase no está configurado.");
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/success` },
      });
      if (authError) throw authError;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar OAuth con Google.");
      setGoogleEnabled(true);
    }
  }

  async function sendPasswordReset() {
    setError(null);
    setResetMessage(null);
    if (!email.trim()) {
      setError("Escribe tu correo para enviarte el enlace de recuperación.");
      return;
    }
    try {
      if (!isSupabaseConfigured) throw new Error("Supabase no está configurado.");
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      if (resetError) throw resetError;
      setResetMessage("Si existe una cuenta con ese correo, recibirás un enlace para cambiar la contraseña.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar el enlace.");
    }
  }

  const input =
    "w-full rounded-lg border border-border bg-bg px-3.5 py-2.5 text-sm outline-none focus:border-accent";

  return (
    <main className="mx-auto flex max-w-5xl flex-col items-center justify-center px-6 py-10 md:flex-row md:gap-16">
      {/* Marca */}
      <section className="hidden md:block">
        <span className="block text-5xl font-bold text-accent">VIALT</span>
        <span className="mt-2 block text-sm text-muted">Human Vault · Saniver</span>
        <p className="mt-6 max-w-xs text-sm text-muted">
          Tu biblioteca médica personal: datos estructurados, acceso protegido y
          recomendaciones de IA basadas en el contexto de cada vault.
        </p>
      </section>

      {/* Formulario */}
      <section className="w-full max-w-sm">
        <h1 className="md:hidden text-4xl font-bold text-accent">VIALT</h1>
        <h1 className="mb-1 mt-6 text-xl font-semibold tracking-tight md:mt-0">
          Inicia sesión
        </h1>
        <p className="mb-6 text-sm text-muted">
          Ingresa con tu cuenta o regístrate para crear tu vault.
        </p>

        <form onSubmit={submit} className="space-y-3">
          <input
            className={input}
            type="email"
            placeholder="Correo electrónico"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className={input}
            type="password"
            placeholder="Contraseña"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={sendPasswordReset}
            className="text-xs text-accent hover:underline"
          >
            Olvidé mi contraseña
          </button>
          {resetMessage && <p className="text-xs text-ok">{resetMessage}</p>}
          {error && <p className="text-sm text-bad">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {loading ? "Ingresando…" : "Entrar"}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-muted">
          <div className="h-px flex-1 bg-border" />o<div className="h-px flex-1 bg-border" />
        </div>

        <button
          onClick={signInWithGoogle}
          disabled={!googleEnabled || !isSupabaseConfigured}
          title={!isSupabaseConfigured ? "Configura Supabase para habilitar el acceso" : ""}
          className="w-full rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:border-accent disabled:opacity-50"
        >
            {googleEnabled ? "Continuar con Google" : "Conectando…"}
        </button>

        <p className="mt-6 text-sm text-muted">
          ¿No tienes cuenta?{" "}
          <Link to="/registro" className="text-accent hover:underline">
            Regístrate
          </Link>
        </p>
      </section>
    </main>
  );
}
