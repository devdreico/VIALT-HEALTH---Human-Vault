import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type OpenRouterKeyStatus } from "../lib/api";

export default function OpenRouterSettingsPage() {
  const [status, setStatus] = useState<OpenRouterKeyStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [confirmTransfer, setConfirmTransfer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.getOpenRouterKeyStatus()
      .then((result) => active && setStatus(result))
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : "No se pudo cargar la configuración"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const result = await api.saveOpenRouterKey(apiKey, confirmTransfer);
      setStatus(result);
      setApiKey("");
      setConfirmTransfer(false);
      setNotice("Clave validada. El chat usará GPT-OSS 120B para tu cuenta.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la clave");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      setStatus(await api.removeOpenRouterKey());
      setNotice("Clave OpenRouter eliminada.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo eliminar la clave");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <Link to="/" className="text-xs text-muted hover:underline">← Mis VIALTs</Link>
      <h1 className="mt-4 text-xl font-semibold tracking-tight">Agente de IA</h1>
      <p className="mt-2 text-sm text-muted">
        Añade tu clave OpenRouter. Se valida y guarda cifrada; no se vuelve a mostrar.
      </p>

      <section className="mt-6 rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">OpenRouter</h2>
          <span className={status?.configured ? "text-xs text-ok" : "text-xs text-muted"}>
            {loading ? "verificando…" : status?.configured ? "conectado" : "sin configurar"}
          </span>
        </div>
        {status?.configured && (
          <p className="mt-2 text-sm text-muted">
            Agente automático: <strong className="text-text">GPT-OSS 120B</strong>
          </p>
        )}

        <form onSubmit={save} className="mt-5 space-y-4">
          <label className="block text-xs font-medium text-muted" htmlFor="openrouter-key">
            API key
          </label>
          <input
            id="openrouter-key"
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-or-v1-..."
            className="w-full rounded-lg border border-border bg-bg px-3.5 py-2.5 text-sm outline-none focus:border-accent"
          />
          <label className="flex items-start gap-2 text-xs leading-relaxed text-muted">
            <input
              type="checkbox"
              checked={confirmTransfer}
              onChange={(event) => setConfirmTransfer(event.target.checked)}
              className="mt-0.5"
            />
            Acepto que los mensajes y datos clínicos relevantes de cada VIALT se envíen a OpenRouter para generar respuestas con GPT-OSS 120B.
          </label>
          {error && <p className="text-sm text-bad">{error}</p>}
          {notice && <p className="text-sm text-ok">{notice}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving || loading || !apiKey.trim() || !confirmTransfer}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Validando…" : status?.configured ? "Actualizar clave" : "Guardar clave"}
            </button>
            {status?.configured && (
              <button
                type="button"
                onClick={remove}
                disabled={saving}
                className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:border-bad hover:text-bad disabled:opacity-50"
              >
                Eliminar clave
              </button>
            )}
          </div>
        </form>
      </section>
    </main>
  );
}
