import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Health } from "../lib/api";

function Row({ label, ok, detail }: { label: string; ok: boolean | null; detail?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-none">
      <div>
        <div className="text-sm">{label}</div>
        {detail && <div className="text-xs text-muted">{detail}</div>}
      </div>
      {ok === null ? (
        <span className="text-xs text-muted">verificando…</span>
      ) : ok ? (
        <span
          className="rounded-full px-2.5 py-1 text-xs font-medium"
          style={{ backgroundColor: "color-mix(in srgb, var(--ok) 12%, transparent)", color: "var(--ok)" }}
        >
          operativo
        </span>
      ) : (
        <span
          className="rounded-full px-2.5 py-1 text-xs font-medium"
          style={{ backgroundColor: "color-mix(in srgb, var(--bad) 12%, transparent)", color: "var(--bad)" }}
        >
          sin conexión
        </span>
      )}
    </div>
  );
}

export default function EstadoPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [apiDown, setApiDown] = useState(false);

  const load = useCallback(async () => {
    setApiDown(false);
    try {
      setHealth(await api.getHealth());
    } catch {
      setApiDown(true);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Estado del sistema</h1>
      <p className="mt-1 text-sm text-muted">Diagnóstico de infraestructura base.</p>

      <div className="mt-8 rounded-2xl border border-border bg-surface px-5 py-2">
        <Row
          label="Supabase"
          ok={health ? health.status === "ok" : apiDown ? false : null}
          detail={health ? health.app : apiDown ? "sin respuesta" : undefined}
        />
        <Row
          label="Proveedor de IA (Ollama)"
          ok={health ? health.ollama.connected : null}
          detail={
            health?.ollama.connected
              ? `${health.ollama.models.length} modelo(s) instalado(s)`
              : undefined
          }
        />
        <Row
          label="Modelo de chat médico"
          ok={health ? health.ollama.models.includes("qwen2.5:3b") : null}
          detail={health ? health.ollama_model : undefined}
        />
        <Row
          label="Base de datos y autenticación"
          ok={health ? health.status === "ok" : null}
          detail={health?.app}
        />
      </div>

      <button
        onClick={load}
        className="mt-6 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
      >
        Verificar de nuevo
      </button>
      <Link to="/" className="ml-3 text-sm text-muted hover:underline">
        ← Volver
      </Link>
    </main>
  );
}
