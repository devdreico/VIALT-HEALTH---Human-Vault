import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../stores/auth";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session));
      setReady(true);
    });
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) setError("El enlace no es válido o ya expiró. Solicita uno nuevo.");
      setHasSession(Boolean(data.session));
      setReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await supabase.auth.signOut();
    useAuth.getState().clear();
    navigate("/login", { replace: true, state: { passwordUpdated: true } });
  }

  if (!ready) {
    return <main className="mx-auto max-w-sm px-6 py-14 text-sm text-muted">Validando enlace…</main>;
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-14">
      <h1 className="text-xl font-semibold tracking-tight">Nueva contraseña</h1>
      {!hasSession ? (
        <p className="mt-3 text-sm text-muted">
          El enlace no es válido o ya expiró. <Link to="/login" className="text-accent hover:underline">Solicita otro</Link>.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            className="w-full rounded-lg border border-border bg-bg px-3.5 py-2.5 text-sm outline-none focus:border-accent"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            placeholder="Nueva contraseña"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <input
            className="w-full rounded-lg border border-border bg-bg px-3.5 py-2.5 text-sm outline-none focus:border-accent"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            placeholder="Confirma la contraseña"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
          {error && <p className="text-sm text-bad">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Guardando…" : "Actualizar contraseña"}
          </button>
        </form>
      )}
    </main>
  );
}
