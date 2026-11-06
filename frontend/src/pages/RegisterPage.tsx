import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../stores/auth";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }
    setLoading(true);
    try {
      const auth = await api.register({ nombre, email, password });
      useAuth.getState().setAuth(auth.access_token, auth.user);
      navigate("/onboarding");
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
        En segundos tendrás tu token identificativo y tu vault médico listo para
        llenarse.
      </p>

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

      <p className="mt-6 text-sm text-muted">
        ¿Ya tienes cuenta?{" "}
        <Link to="/login" className="text-accent hover:underline">
          Inicia sesión
        </Link>
      </p>
    </main>
  );
}
