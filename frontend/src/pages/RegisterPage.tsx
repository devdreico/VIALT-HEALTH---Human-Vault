import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { useAuth } from "../stores/auth";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }
    setLoading(true);
    try {
      if (!isSupabaseConfigured) throw new Error("Supabase no está configurado.");
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            nombre: nombre.trim(),
            consent_accepted: true,
            consent_version: "1581-2012-v1",
          },
          emailRedirectTo: `${window.location.origin}/auth/success`,
        },
      });
      if (authError) throw authError;
      if (data.session && data.user) {
        useAuth.getState().setAuth(data.session.access_token, {
          id: data.user.id,
          email: data.user.email ?? email,
          nombre: nombre.trim(),
          picture: null,
        });
        navigate("/onboarding");
      } else {
        setConfirmationSent(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  const input =
    "w-full rounded-lg border border-border bg-bg px-3.5 py-2.5 text-sm outline-none focus:border-accent";

  return (
    <main className="mx-auto max-w-sm px-6 py-14">
      <h1 className="text-xl font-semibold tracking-tight">Crea tu cuenta</h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        Registra una cuenta para crear tu vault médico.
      </p>

      {confirmationSent ? (
        <p className="rounded-lg border border-border bg-surface p-4 text-sm">
          Revisa tu correo para confirmar la cuenta y continuar con el onboarding.
        </p>
      ) : (

      <form onSubmit={submit} className="space-y-3">
        <input
          className={input}
          placeholder="Nombre completo"
          required
          minLength={2}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
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
          placeholder="Contraseña (mín. 8 caracteres)"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <input
          className={input}
          type="password"
          placeholder="Confirma la contraseña"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <label className="flex items-start gap-2 text-xs text-muted pt-1">
          <input type="checkbox" required className="mt-0.5" />
          Acepto el tratamiento de mis datos de salud según la Ley 1581/2012 (Colombia).
          La IA analiza, no diagnostica.
        </label>
        {error && <p className="text-sm text-bad">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {loading ? "Creando cuenta…" : "Crear cuenta y vault"}
        </button>
      </form>
      )}

      <p className="mt-6 text-sm text-muted">
        ¿Ya tienes cuenta?{" "}
        <Link to="/login" className="text-accent hover:underline">
          Inicia sesión
        </Link>
      </p>
    </main>
  );
}
