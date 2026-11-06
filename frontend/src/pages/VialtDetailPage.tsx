import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type GoalItem, type HealthScore, type ItemList, type VaultDetail } from "../lib/api";

const inputS =
  "w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-xs outline-none focus:border-accent";

function itemsOf(files: VaultDetail["files"], key: string): ItemList {
  const fm = files[key] ?? {};
  return (fm["items"] as ItemList) ?? [];
}

function Section({ titulo, items, render }: {
  titulo: string;
  items: ItemList;
  render: (it: Record<string, unknown>) => React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-sm font-medium">{titulo}</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-muted">vacío</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((it, i) => (
            <li key={i} className="text-sm leading-snug">{render(it)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function VialtDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [detail, setDetail] = useState<VaultDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [score, setScore] = useState<HealthScore | null>(null);
  const [goals, setGoals] = useState<GoalItem[]>([]);

  const load = useCallback(async () => {
    if (!slug) return;
    try {
      const d = await api.getVialt(slug);
      setDetail(d);
      api.getHealthScore(slug).then(setScore).catch(() => undefined);
      api.listGoals(slug).then(setGoals).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión");
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  if (error)
    return (
      <main className="mx-auto max-w-lg px-6 py-14 text-center">
        <p className="text-sm text-bad">{error}</p>
        <Link to="/" className="mt-4 inline-block text-sm text-accent hover:underline">
          ← Volver
        </Link>
      </main>
    );
  if (!detail)
    return <main className="mx-auto max-w-lg px-6 py-14 text-sm text-muted">Cargando vault…</main>;

  const s = detail.summary;
  const u = (detail.files["user"] ?? {}) as Record<string, string | number | null>;

  const chips = [
    s.edad != null ? `${s.edad} años` : null,
    s.sexo ? `Sexo ${s.sexo}` : null,
    s.tipo_sangre ? `Sangre ${s.tipo_sangre}` : null,
    u.peso_kg != null ? `${u.peso_kg} kg` : null,
    u.altura_cm != null ? `${u.altura_cm} cm` : null,
  ].filter(Boolean) as string[];

  async function saveProfile() {
    if (!slug || !s) return;
    setSaving(true);
    try {
      const num = (v: string) => (v ? Number(v) : null);
      await api.updateProfile(slug, {
        fecha_nacimiento: form.fecha_nacimiento || undefined,
        sexo: form.sexo || undefined,
        tipo_sangre: form.tipo_sangre || undefined,
        peso_kg: form.peso_kg !== undefined ? num(form.peso_kg) : undefined,
        altura_cm: form.altura_cm !== undefined ? num(form.altura_cm) : undefined,
        contacto_emergencia: form.contacto_emergencia || undefined,
      });
      setEditing(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link to="/" className="text-xs text-muted hover:underline">← Mis VIALTs</Link>

      <header className="mt-4 flex flex-wrap items-center gap-3">
        <span className="inline-block h-3 w-3 rounded-full bg-accent" />
        <h1 className="text-xl font-semibold tracking-tight">{s.nombre}</h1>
        {s.tipo === "raiz" && (
          <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-white">
            RAÍZ
          </span>
        )}
        {detail.consentimiento && (
          <span className="text-[10px] text-ok">✓ consentimiento Ley 1581/2012</span>
        )}
      </header>

      {/* CTA chat IA */}
      <Link
        to={`/vialt/${slug}/ia`}
        className="mt-6 flex items-center justify-between rounded-2xl bg-accent px-5 py-4 text-sm font-medium text-white"
      >
        <span>💬 Conversar con la IA médica</span>
        <span className="opacity-80">leer vault · recomendar →</span>
      </Link>

      {chips.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((c) => (
            <span key={c} className="rounded-full border border-border px-2.5 py-1 text-xs text-muted">
              {c}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">
          Sin datos críticos aún — <Link to="/onboarding" className="text-accent hover:underline">completar onboarding</Link>
        </p>
      )}

      {u.contacto_emergencia && !editing && (
        <p className="mt-3 text-xs text-muted">
          🚨 Emergencia: <span className="text-text">{String(u.contacto_emergencia)}</span>
        </p>
      )}

      {editing ? (
        <div className="mt-6 grid gap-2 rounded-2xl border border-accent/50 bg-surface p-4 sm:grid-cols-3">
          <input className={inputS} placeholder="nacimiento YYYY-MM-DD" value={form.fecha_nacimiento ?? ""} onChange={(e) => setForm((f) => ({ ...f, fecha_nacimiento: e.target.value }))} />
          <input className={inputS} placeholder="sexo M/F/otro" value={form.sexo ?? ""} onChange={(e) => setForm((f) => ({ ...f, sexo: e.target.value }))} />
          <input className={inputS} placeholder="tipo sangre" value={form.tipo_sangre ?? ""} onChange={(e) => setForm((f) => ({ ...f, tipo_sangre: e.target.value }))} />
          <input className={inputS} placeholder="peso kg" value={form.peso_kg ?? ""} onChange={(e) => setForm((f) => ({ ...f, peso_kg: e.target.value }))} />
          <input className={inputS} placeholder="altura cm" value={form.altura_cm ?? ""} onChange={(e) => setForm((f) => ({ ...f, altura_cm: e.target.value }))} />
          <input className={inputS} placeholder="contacto emergencia" value={form.contacto_emergencia ?? ""} onChange={(e) => setForm((f) => ({ ...f, contacto_emergencia: e.target.value }))} />
          <div className="sm:col-span-3 flex gap-2">
            <button onClick={saveProfile} disabled={saving} className="rounded-lg bg-accent px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50">
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
            <button onClick={() => setEditing(false)} className="rounded-lg border border-border px-4 py-1.5 text-xs text-muted">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        Object.keys(u).length > 0 && (
          <button
            onClick={() => {
              setForm({
                fecha_nacimiento: String(u.fecha_nacimiento ?? ""),
                sexo: String(u.sexo ?? ""),
                tipo_sangre: String(u.tipo_sangre ?? ""),
                peso_kg: u.peso_kg != null ? String(u.peso_kg) : "",
                altura_cm: u.altura_cm != null ? String(u.altura_cm) : "",
                contacto_emergencia: u.contacto_emergencia != null ? String(u.contacto_emergencia) : "",
              });
              setEditing(true);
            }}
            className="mt-4 text-xs text-accent hover:underline"
          >
            Actualizar datos críticos ✎
          </button>
        )
      )}

      {/* Puntaje de salud */}
      {score && (
        <section className="mt-6 rounded-2xl border border-accent/40 bg-surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Puntaje de salud</h2>
            <span className="text-2xl font-bold text-accent">
              {score.score}
              <span className="text-sm text-muted">/100</span>
            </span>
          </div>
          <div className="mt-3 space-y-1.5">
            {score.componentes.map((c) => (
              <div key={c.label} className="flex items-center gap-2 text-xs">
                <span className="w-28 shrink-0 text-muted">{c.label}</span>
                <div className="h-1.5 flex-1 rounded-full bg-border">
                  <div
                    className="h-1.5 rounded-full bg-accent"
                    style={{ width: `${(c.got / c.max) * 100}%` }}
                  />
                </div>
                <span className="w-10 text-right text-muted">
                  {c.got}/{c.max}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">{score.resumen}</p>
          <Link
            to={`/vialt/${slug}/ia`}
            state={{
              prefill: `Mi puntaje de salud es ${score.score}/100${
                score.faltan.length ? " y me falta registrar: " + score.faltan.join(", ") : ""
              }. ¿Cómo lo mejoró, considerando mis datos del vault y mis alergias?`,
            }}
            className="mt-3 inline-block rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white"
          >
            → Preguntar a la IA cómo mejorarlo
          </Link>
        </section>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Section
          titulo="Condiciones médicas"
          items={itemsOf(detail.files, "condiciones")}
          render={(it) => (
            <>
              <strong>{String(it.nombre)}</strong>
              {it.tipo ? <span className="text-muted"> · {String(it.tipo)}</span> : null}
              {it.detalle ? <span className="text-muted"> — {String(it.detalle)}</span> : null}
            </>
          )}
        />
        <Section
          titulo="Medicaciones"
          items={itemsOf(detail.files, "medicaciones")}
          render={(it) => (
            <>
              <strong>{String(it.nombre)}</strong>
              <span className="text-muted"> · {it.dosis ? String(it.dosis) : "dosis s.f."}{it.frecuencia ? ` · ${String(it.frecuencia)}` : ""}</span>
            </>
          )}
        />
        <Section
          titulo="Alergias"
          items={itemsOf(detail.files, "alergias")}
          render={(it) => (
            <>
              {it.severidad === "severa" ? (
                <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-white">SEVERA</span>
              ) : null}
              <strong> {String(it.nombre)}</strong>
              <span className="text-muted"> · {String(it.tipo ?? "s.f.")}{it.reaccion ? ` — ${String(it.reaccion)}` : ""}</span>
            </>
          )}
        />
        <Section
          titulo="Vacunas"
          items={itemsOf(detail.files, "vacunas")}
          render={(it) => (
            <>
              <strong>{String(it.nombre)}</strong>
              <span className="text-muted"> · {String(it.estado ?? "s.f.")}{it.fecha ? ` · ${String(it.fecha)}` : ""}</span>
            </>
          )}
        />
      </div>

      {/* Goals/ */}
      <section className="mt-4 rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-sm font-medium">Goals/ — metas y recomendaciones</h2>
        {goals.length === 0 ? (
          <p className="mt-2 text-xs text-muted">
            vacío — guarda recomendaciones de la IA desde el chat
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {goals.map((g) => (
              <li key={g.path} className="text-xs text-muted">
                <span className="text-text">{g.titulo}</span>{" "}
                <code className="text-[10px]">{g.path}</code>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 text-center text-xs text-muted">
        Datos guardados en Supabase · este vault es visible únicamente para la cuenta propietaria.
      </p>
    </main>
  );
}
