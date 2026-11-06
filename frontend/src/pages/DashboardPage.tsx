import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type VaultSummary } from "../lib/api";
import { supabase } from "../lib/supabase";
import { useAuth } from "../stores/auth";

export default function DashboardPage() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const [vialts, setVialts] = useState<VaultSummary[] | null>(null);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.onboardingStatus().then((s) => setOnboarded(s.completado)).catch(() => setOnboarded(false));
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    try {
      setVialts(await api.listVialts());
    } catch {
      setVialts([]);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const nombre = newName.trim();
    if (!nombre) return;
    setCreating(true);
    setError(null);
    try {
      const v = await api.createVialt({ nombre });
      navigate(`/vialt/${v.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión");
    } finally {
      setCreating(false);
    }
  }

  async function logout() {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
      return;
    }
    useAuth.getState().clear();
    navigate("/login", { replace: true });
  }

  const nombre = user?.id ? user.nombre.split(" ")[0] : "…";

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Hola, {nombre}
          </h1>
          <p className="mt-1 text-sm text-muted">{user?.id ? user.email : "cargando…"}</p>
        </div>
        <button
          onClick={logout}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-text"
        >
          Salir
        </button>
      </div>

      {onboarded === false && (
        <div className="mt-6 rounded-xl border border-accent/50 bg-surface p-4">
          <p className="text-sm">
            <strong>Falta lo esencial:</strong> tus datos médicos críticos aún no
            están escritos en tu vault.
          </p>
          <Link to="/onboarding" className="mt-1 inline-block text-sm text-accent hover:underline">
            Completar onboarding →
          </Link>
        </div>
      )}

      {/* Nuevo VIALT */}
      <form onSubmit={create} className="mt-8 flex flex-wrap gap-2">
        <input
          className="flex-1 rounded-lg border border-border bg-bg px-3.5 py-2.5 text-sm outline-none focus:border-accent"
          placeholder="Nuevo VIALT — nombre de una persona (p. ej. tu madre)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40"
        >
          Crear
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}

      {/* Lista */}
      <div className="grid gap-4 sm:grid-cols-2 mt-6">
        {vialts === null && <p className="text-sm text-muted">Cargando vaults…</p>}
        {vialts?.map((v) => (
          <Link
            key={v.slug}
            to={`/vialt/${v.slug}`}
            className="group rounded-2xl border border-border bg-surface p-5 transition hover:border-accent"
          >
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
              {v.tipo === "raiz" && (
                <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-white">
                  RAÍZ
                </span>
              )}
            </div>
            <h3 className="mt-3 text-sm font-medium leading-snug">{v.nombre}</h3>
            <p className="mt-2 text-xs text-muted">
              {[v.edad != null ? `${v.edad} años` : null, v.tipo_sangre && `Sangre ${v.tipo_sangre}`, v.sexo]
                .filter(Boolean)
                .join(" · ") || "sin datos críticos aún"}
            </p>
            {v.score != null && (
              <div className="mt-3 flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-border">
                  <div
                    className="h-1.5 rounded-full bg-accent"
                    style={{ width: `${v.score}%` }}
                  />
                </div>
                <span className="shrink-0 text-[10px] text-muted">{v.score}/100</span>
              </div>
            )}
            <span className="mt-3 inline-block text-xs text-accent opacity-70 group-hover:opacity-100">
              Abrir vault →
            </span>
          </Link>
        ))}
        {vialts?.length === 0 && (
          <p className="text-sm text-muted">
            Aún no hay VIALTs — crea el primero arriba.
          </p>
        )}
      </div>

      <p className="mt-10 text-center text-xs text-muted">
        Datos protegidos con controles de acceso por cuenta ·{" "}
        <Link to="/estado" className="hover:underline">
          estado del sistema
        </Link>
      </p>
    </main>
  );
}
