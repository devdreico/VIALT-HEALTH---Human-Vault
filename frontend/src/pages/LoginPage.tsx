import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, BASE } from "../lib/api";
import { useAuth } from "../stores/auth";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: string } | null)?.from ?? "/onboarding";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    api.authConfig().then((c) => setGoogleEnabled(c.google_enabled)).catch(() => setGoogleEnabled(false));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const auth = await api.login({ email, password });
      useAuth.getState().setAuth(auth.access_token, auth.user);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión");
    } finally {
      setLoading(false);
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
          Tu biblioteca médica personal: vaults en .md que la IA local comprende de
          inmediato. Guardado, análisis y recomendaciones — todo en tu servidor.
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
          onClick={() => (window.location.href = `${BASE}/api/auth/google`)}
          disabled={googleEnabled !== true}
          title={googleEnabled ? "" : "Google OAuth sin configurar en el backend"}
          className="w-full rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:border-accent disabled:opacity-50"
        >
          Continuar con Google
        </button>
        {googleEnabled === false && (
          <p className="mt-2 text-xs text-muted">
            La conexión con Google no está configurada todavía — usa el registro local
            mientras tanto.
          </p>
        )}

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
