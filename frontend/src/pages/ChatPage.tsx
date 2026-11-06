import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api, streamChat, type ChatSource } from "../lib/api";

interface Bubble {
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
  logPath?: string;
  goalsPath?: string;
}

const SUGERENCIAS = [
  "¿Cómo mejoro mi puntaje de salud?",
  "¿Qué significa mi tipo de sangre?",
  "¿Es peligrosa alguna de mis alergias?",
  "¿Qué debo preguntar en la próxima cita médica?",
];

export default function ChatPage() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const [msgs, setMsgs] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState<string>("…");
  const endRef = useRef<HTMLDivElement>(null);
  const prefillSent = useRef(false);

  const send = useCallback(
    async (texto: string) => {
      const mensaje = texto.trim();
      if (!mensaje || busy || !slug) return;
      setError(null);
      setBusy(true);
      setInput("");
      setMsgs((m) => [...m, { role: "user", content: mensaje }]);
      setMsgs((m) => [...m, { role: "assistant", content: "" }]);
      try {
        await streamChat(slug, mensaje, {
          token: (t) =>
            setMsgs((m) => {
              const ult = m[m.length - 1];
              if (ult?.role !== "assistant") return m;
              return [...m.slice(0, -1), { ...ult, content: ult.content + t }];
            }),
          done: (d) =>
            setMsgs((m) => {
              const ult = m[m.length - 1];
              if (ult?.role !== "assistant") return m;
              return [
                ...m.slice(0, -1),
                { ...ult, sources: d.sources, logPath: d.log },
              ];
            }),
          error: (e) => setError(e),
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error de conexión");
      } finally {
        setBusy(false);
      }
    },
    [busy, slug],
  );

  useEffect(() => {
    if (!slug) return;
    let alive = true;
    (async () => {
      try {
        const h = await api.getChatHistory(slug);
        if (!alive) return;
        setMsgs(h);
      } catch {
        if (alive) setMsgs([]);
      }
      api
        .getVialt(slug)
        .then((d) => alive && setNombre(d.summary.nombre))
        .catch(() => undefined);
    })();
    return () => {
      alive = false;
    };
  }, [slug]);

  useEffect(() => {
    const prefill = (location.state as { prefill?: string } | null)?.prefill;
    if (prefill && !prefillSent.current && !busy) {
      prefillSent.current = true;
      send(prefill);
    }
  }, [location, busy, send]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  async function saveGoal() {
    const idx = msgs.length - 1;
    const m = msgs[idx];
    if (!slug || !m || m.role !== "assistant" || !m.content || savingGoal) return;
    setSavingGoal(true);
    try {
      const r = await api.saveGoal(slug, {
        titulo: `Recomendación IA · ${
          msgs[idx - 1]?.role === "user"
            ? msgs[idx - 1].content.slice(0, 60)
            : slug
        }`,
        contenido: m.content,
      });
      setMsgs((arr) =>
        arr.map((x, i) => (i === idx ? { ...x, goalsPath: r.path } : x)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar en Goals/");
    } finally {
      setSavingGoal(false);
    }
  }

  return (
    <main className="mx-auto flex h-[calc(100vh-7rem)] max-w-2xl flex-col px-6 pt-2 pb-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">
            💬 IA local · {nombre}
          </h1>
          <p className="text-xs text-muted">
            lee tu vault ~ analiza ~ recomienda · sin diagnósticos
          </p>
        </div>
        <Link to={`/vialt/${slug}`} className="shrink-0 text-xs text-accent hover:underline">
          ← Vault
        </Link>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-border bg-surface p-4">
        {msgs.length === 0 && (
          <div className="pt-6 text-center">
            <p className="text-sm text-muted">
              Preguntale lo que quieras sobre la salud de esta persona.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGERENCIAS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-muted hover:border-accent hover:text-text"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "flex justify-end"
                : "flex flex-col items-start"
            }
          >
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-4 py-2 text-sm text-white"
                  : "max-w-[92%] rounded-2xl rounded-bl-sm border border-border bg-bg px-4 py-2 text-sm"
              }
            >
              {m.content || (busy && i === msgs.length - 1 ? "▋" : "")}
            </div>
            {(m.sources?.length ||
              (m.role === "assistant" && (m.logPath || m.goalsPath))) && (
              <div className="ml-1 mt-1 flex flex-wrap gap-1.5 text-[10px] text-muted">
                {m.sources?.map((s) => (
                  <a
                    key={s.url}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-border px-2 py-0.5 hover:border-accent"
                  >
                    🔗 {new URL(s.url).hostname.replace("www.", "")}
                  </a>
                ))}
                {m.logPath && (
                  <span className="rounded-full border border-border px-2 py-0.5">
                    📁 {m.logPath}
                  </span>
                )}
                {m.goalsPath && (
                  <span
                    className="rounded-full px-2 py-0.5"
                    style={{ backgroundColor: "color-mix(in srgb, var(--ok) 15%, transparent)", color: "var(--ok)" }}
                  >
                    🌟 {m.goalsPath}
                  </span>
                )}
              </div>
            )}
            {m.role === "assistant" &&
              i === msgs.length - 1 &&
              m.content &&
              !busy &&
              !m.goalsPath && (
                <button
                  onClick={saveGoal}
                  disabled={savingGoal}
                  className="ml-1 mt-1.5 rounded-full border border-border px-2.5 py-1 text-[10px] text-muted hover:border-accent hover:text-text disabled:opacity-50"
                >
                  {savingGoal ? "guardando…" : "＋ Guardar en Goals/"}
                </button>
              )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {error && <p className="mt-2 text-xs text-bad">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-3 flex gap-2"
      >
        <textarea
          rows={1}
          className="flex-1 resize-none rounded-xl border border-border bg-bg px-4 py-3 text-sm outline-none focus:border-accent"
          placeholder={busy ? "La IA está escribiendo…" : "Escribe tu pregunta médica…"}
          value={input}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-xl bg-accent px-5 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? "…" : "Enviar"}
        </button>
      </form>
      <p className="mt-2 text-center text-[10px] text-muted">
        En esta PC de desarrollo la IA corre en CPU (~2 tokens/s). En el servidor con GPU será fluida.
      </p>
    </main>
  );
}
