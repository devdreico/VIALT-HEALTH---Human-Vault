import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type OnboardingItem } from "../lib/api";

const input =
  "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent";
const label = "mb-1 block text-xs font-medium text-muted";

interface StepConfig {
  key: "condiciones" | "medicaciones" | "alergias" | "vacunas";
  titulo: string;
  sub: string;
  fields: [keyof OnboardingItem, string][];
}

const LIST_STEPS: StepConfig[] = [
  {
    key: "condiciones",
    titulo: "Condiciones médicas",
    sub: "Diagnósticos o enfermedades que llevas — crónicas o pasadas",
    fields: [
      ["nombre", "Nombre · asma, anemia…"],
      ["tipo", "Crónico o agudo"],
      ["detalle", "Detalle (opcional)"],
    ],
  },
  {
    key: "medicaciones",
    titulo: "Medicaciones",
    sub: "Fármacos que consumes — los que la IA debe recordar",
    fields: [
      ["nombre", "Nombre · loratadina…"],
      ["dosis", "Dosis · 10mg"],
      ["frecuencia", "Frecuencia · 1/día"],
    ],
  },
  {
    key: "alergias",
    titulo: "Alergias",
    sub: "Reacciones conocidas — críticas para emergencias",
    fields: [
      ["nombre", "Alérgeno · penicilina, polen…"],
      ["tipo", "Medicamento · alimento · ambiental"],
      ["severidad", "Leve · moderada · severa"],
    ],
  },
  {
    key: "vacunas",
    titulo: "Vacunas",
    sub: "Esquema de vacunación (PIV Colombia)",
    fields: [
      ["nombre", "Vacuna · COVID-19, influenza…"],
      ["fecha", "Fecha (opcional)"],
      ["estado", "Completo · en esquema"],
    ],
  },
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consentimiento, setConsentimiento] = useState(false);

  const [persona, setPersona] = useState({
    nombre: "",
    fecha_nacimiento: "",
    sexo: "",
    tipo_sangre: "",
    peso_kg: "",
    altura_cm: "",
    contacto_emergencia: "",
  });
  const [items, setItems] = useState<Record<string, OnboardingItem[]>>(
    { condiciones: [], medicaciones: [], alergias: [], vacunas: [] },
  );

  const p = persona;
  const setP = (k: keyof typeof persona, v: string) =>
    setPersona((s) => ({ ...s, [k]: v }));

  const totalSteps = 1 + LIST_STEPS.length;

  const personaValida =
    p.nombre.trim().length > 1 && p.fecha_nacimiento && p.sexo && p.tipo_sangre;

  async function submit() {
    setError(null);
    if (!personaValida) {
      setStep(0);
      setError("Completa nombre, fecha de nacimiento, sexo y tipo de sangre");
      return;
    }
    setSaving(true);
    try {
      await api.completeOnboarding({
        persona: {
          nombre: p.nombre.trim(),
          fecha_nacimiento: p.fecha_nacimiento,
          sexo: p.sexo,
          tipo_sangre: p.tipo_sangre,
          peso_kg: p.peso_kg ? Number(p.peso_kg) : null,
          altura_cm: p.altura_cm ? Number(p.altura_cm) : null,
          contacto_emergencia: p.contacto_emergencia || null,
        },
        condiciones: items.condiciones,
        medicaciones: items.medicaciones,
        alergias: items.alergias,
        vacunas: items.vacunas,
        consentimiento,
      });
      navigate("/vialt/raiz");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-10">
      {/* progreso */}
      <div className="mb-8">
        <div className="mb-2 flex justify-between text-xs text-muted">
          <span>Paso {step + 1} de {totalSteps}</span>
          <span>{Math.round(((step + 1) / totalSteps) * 100)}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-surface">
          <div
            className="h-1.5 rounded-full bg-accent transition-all"
            style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {step === 0 ? (
        <section>
          <h1 className="text-xl font-semibold tracking-tight">Datos críticos</h1>
          <p className="mb-6 mt-1 text-sm text-muted">
            La información primordial para un vault médico, guardada de forma segura.
          </p>
          <div className="space-y-3">
            <div>
              <span className={label}>Nombre de esta persona</span>
              <input
                className={input}
                placeholder="P. ej.: VIALT raíz de Dilan"
                value={p.nombre}
                onChange={(e) => setP("nombre", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className={label}>Nacimiento</span>
                <input
                  className={input}
                  type="date"
                  value={p.fecha_nacimiento}
                  onChange={(e) => setP("fecha_nacimiento", e.target.value)}
                />
              </div>
              <div>
                <span className={label}>Tipo de sangre</span>
                <select
                  className={input}
                  value={p.tipo_sangre}
                  onChange={(e) => setP("tipo_sangre", e.target.value)}
                >
                  <option value="">—</option>
                  {["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-", "desconocido"].map(
                    (t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ),
                  )}
                </select>
              </div>
            </div>
            <div>
              <span className={label}>Sexo</span>
              <select
                className={input}
                value={p.sexo}
                onChange={(e) => setP("sexo", e.target.value)}
              >
                <option value="">—</option>
                {["M", "F", "otro", "s.f."].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className={label}>Peso (kg) — opcional</span>
                <input
                  className={input}
                  type="number"
                  placeholder="62"
                  value={p.peso_kg}
                  onChange={(e) => setP("peso_kg", e.target.value)}
                />
              </div>
              <div>
                <span className={label}>Altura (cm) — opcional</span>
                <input
                  className={input}
                  type="number"
                  placeholder="172"
                  value={p.altura_cm}
                  onChange={(e) => setP("altura_cm", e.target.value)}
                />
              </div>
            </div>
            <div>
              <span className={label}>Contacto de emergencia — opcional</span>
              <input
                className={input}
                placeholder="Nombre · teléfono"
                value={p.contacto_emergencia}
                onChange={(e) => setP("contacto_emergencia", e.target.value)}
              />
            </div>
          </div>
        </section>
      ) : (
        (() => {
          const cfg = LIST_STEPS[step - 1];
          const list = items[cfg.key];
          function add() {
            setItems((s) => ({ ...s, [cfg.key]: [...s[cfg.key], { nombre: "" }] }));
          }
          function set(idx: number, k: string, v: string) {
            setItems((s) => ({
              ...s,
              [cfg.key]: s[cfg.key].map((it, i) =>
                i === idx ? { ...it, [k]: v } : it,
              ),
            }));
          }
          function remove(idx: number) {
            setItems((s) => ({
              ...s,
              [cfg.key]: s[cfg.key].filter((_, i) => i !== idx),
            }));
          }
          return (
            <section>
              <h1 className="text-xl font-semibold tracking-tight">{cfg.titulo}</h1>
              <p className="mb-5 mt-1 text-sm text-muted">{cfg.sub}</p>
              <div className="space-y-3">
                {list.map((it, idx) => (
                  <div
                    key={idx}
                    className="relative grid grid-cols-3 gap-2 rounded-xl border border-border p-3"
                  >
                    {cfg.fields.map(([k, ph]) => (
                      <input
                        key={k}
                        className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-xs outline-none focus:border-accent"
                        placeholder={ph}
                        value={(it[k] as string) ?? ""}
                        onChange={(e) => set(idx, k as string, e.target.value)}
                      />
                    ))}
                    <button
                      onClick={() => remove(idx)}
                      className="absolute -right-2 -top-2 h-6 w-6 rounded-full border border-border bg-surface text-xs text-muted hover:border-accent hover:text-bad"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {list.length === 0 && (
                  <p className="text-xs text-muted">
                    Nada por ahora — perfectamente válido.
                  </p>
                )}
                <button
                  onClick={add}
                  className="w-full rounded-lg border border-dashed border-border py-2 text-xs text-muted hover:border-accent hover:text-text"
                >
                  + Añadir a {cfg.titulo.toLowerCase()}
                </button>
              </div>
            </section>
          );
        })()
      )}

      {error && <p className="mt-4 text-sm text-bad">{error}</p>}

      {step === totalSteps - 1 && (
        <label className="mt-5 flex items-start gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={consentimiento}
            onChange={(event) => setConsentimiento(event.target.checked)}
            className="mt-0.5"
          />
          Autorizo el tratamiento de estos datos sensibles de salud según la Ley 1581/2012.
          Entiendo que la IA ofrece apoyo informativo y no diagnostica.
        </label>
      )}

      <div className="mt-8 flex items-center gap-3">
        {step > 0 && (
          <button
            onClick={() => setStep((s) => s - 1)}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-text"
          >
            Atrás
          </button>
        )}
        {step < totalSteps - 1 ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            disabled={step === 0 && !personaValida}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Siguiente
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={saving || !consentimiento}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Escribiendo vault…" : "Generar mi VIALT"}
          </button>
        )}
      </div>
    </main>
  );
}
