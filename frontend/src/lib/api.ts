import { supabase } from "./supabase";
import type { User } from "../stores/auth";

export const BASE = "";

export interface OllamaStatus {
  connected: boolean;
  models: string[];
}

export interface Health {
  status: string;
  app: string;
  vaults_dir: string;
  ollama: OllamaStatus;
  ollama_model: string;
}

export interface OnboardingItem {
  nombre: string;
  [k: string]: unknown;
}

export interface OnboardingPayload {
  persona: {
    nombre: string;
    fecha_nacimiento: string;
    sexo: string;
    tipo_sangre: string;
    peso_kg?: number | null;
    altura_cm?: number | null;
    contacto_emergencia?: string | null;
  };
  condiciones?: OnboardingItem[];
  medicaciones?: OnboardingItem[];
  alergias?: OnboardingItem[];
  vacunas?: OnboardingItem[];
  consentimiento?: boolean;
}

export interface VaultSummary {
  id?: string;
  slug: string;
  nombre: string;
  tipo?: string;
  edad?: number | null;
  sexo?: string | null;
  tipo_sangre?: string | null;
  actualizado?: string;
  creado?: string;
  score?: number | null;
}

export type VaultFiles = Record<string, Record<string, unknown>>;
export type ItemList = Record<string, unknown>[];

export interface VaultDetail {
  summary: VaultSummary;
  files: VaultFiles;
  consentimiento: boolean;
}

export interface HealthComponent {
  label: string;
  got: number;
  max: number;
}

export interface HealthScore {
  score: number;
  componentes: HealthComponent[];
  faltan: string[];
  resumen: string;
}

export interface GoalItem {
  path: string;
  titulo: string;
  tipo?: string;
  creado?: string;
}

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  created_at?: string;
}

export interface ChatSource {
  title: string;
  url: string;
  snippet?: string;
}

export interface ChatDone {
  log: string | null;
  sources: ChatSource[];
}

interface VialtRow {
  id: string;
  owner_id: string;
  slug: string;
  nombre: string;
  tipo: string;
  created_at: string;
  updated_at: string;
}

interface PatientProfileRow {
  fecha_nacimiento: string | null;
  sexo: string | null;
  tipo_sangre: string | null;
  peso_kg: number | null;
  altura_cm: number | null;
  contacto_emergencia: string | null;
}

interface ClinicalItemRow {
  id: string;
  category: string;
  data: Record<string, unknown>;
}

const CLINICAL_CATEGORIES = ["condiciones", "medicaciones", "alergias", "vacunas"] as const;

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function ageFrom(date: string | null): number | null {
  if (!date) return null;
  const birth = new Date(`${date}T00:00:00`);
  if (Number.isNaN(birth.valueOf())) return null;
  const now = new Date();
  return now.getFullYear() - birth.getFullYear() -
    (now.getMonth() < birth.getMonth() ||
      (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())
      ? 1
      : 0);
}

function summarizeVialt(row: VialtRow, profile: PatientProfileRow | null): VaultSummary {
  return {
    id: row.id,
    slug: row.slug,
    nombre: row.nombre,
    tipo: row.tipo,
    edad: ageFrom(profile?.fecha_nacimiento ?? null),
    sexo: profile?.sexo,
    tipo_sangre: profile?.tipo_sangre,
    actualizado: row.updated_at,
    creado: row.created_at,
  };
}

function healthScore(profile: PatientProfileRow | null, items: ClinicalItemRow[]): HealthScore {
  const values: [string, string, number, unknown][] = [
    ["fecha_nacimiento", "Nacimiento", 15, profile?.fecha_nacimiento],
    ["sexo", "Sexo", 10, profile?.sexo],
    ["tipo_sangre", "Tipo de sangre", 15, profile?.tipo_sangre],
    ["peso_kg", "Peso", 10, profile?.peso_kg],
    ["altura_cm", "Altura", 10, profile?.altura_cm],
  ];
  const components: HealthComponent[] = [];
  const missing: string[] = [];
  let score = 0;
  for (const [, label, points, value] of values) {
    const present = value !== null && value !== undefined && value !== "";
    const got = present ? points : 0;
    score += got;
    components.push({ label, got, max: points });
    if (!present) missing.push(label);
  }
  for (const category of CLINICAL_CATEGORIES) {
    const present = items.some((item) => item.category === category);
    const got = present ? 10 : 0;
    score += got;
    components.push({
      label: {
        condiciones: "Condiciones",
        medicaciones: "Medicaciones",
        alergias: "Alergias",
        vacunas: "Vacunas",
      }[category],
      got,
      max: 10,
    });
    if (!present) missing.push(components[components.length - 1].label);
  }
  return {
    score,
    componentes: components,
    faltan: missing,
    resumen: missing.length
      ? `Falta registrar: ${missing.join(", ")}.`
      : "Vault completo en lo esencial — todas las áreas cubiertas.",
  };
}

function slugify(name: string): string {
  const slug = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-")
    .replace(/^-|-$/g, "").slice(0, 40);
  return /^[a-z0-9][a-z0-9-]{1,39}$/.test(slug)
    ? slug
    : `vialt-${crypto.randomUUID().slice(0, 8)}`;
}

async function getVialtRow(slug: string): Promise<VialtRow> {
  const { data, error } = await supabase
    .from("vialts")
    .select("id, owner_id, slug, nombre, tipo, created_at, updated_at")
    .eq("slug", slug)
    .single();
  throwIfError(error);
  if (!data) throw new Error("VIALT no encontrado");
  return data as VialtRow;
}

async function getProfile(vialtId: string): Promise<PatientProfileRow | null> {
  const { data, error } = await supabase
    .from("patient_profiles")
    .select("fecha_nacimiento, sexo, tipo_sangre, peso_kg, altura_cm, contacto_emergencia")
    .eq("vialt_id", vialtId)
    .maybeSingle();
  throwIfError(error);
  return data as PatientProfileRow | null;
}

async function getClinicalItems(vialtId: string): Promise<ClinicalItemRow[]> {
  const { data, error } = await supabase
    .from("clinical_items")
    .select("id, category, data")
    .eq("vialt_id", vialtId);
  throwIfError(error);
  return (data ?? []) as ClinicalItemRow[];
}

async function loadVault(slug: string): Promise<{
  row: VialtRow;
  profile: PatientProfileRow | null;
  items: ClinicalItemRow[];
}> {
  const row = await getVialtRow(slug);
  const [profile, items] = await Promise.all([
    getProfile(row.id),
    getClinicalItems(row.id),
  ]);
  return { row, profile, items };
}

export const api = {
  getHealth: async () => {
    const { data, error } = await supabase.functions.invoke<Health>("system-health", {
      method: "GET",
    });
    throwIfError(error);
    return data as Health;
  },

  me: async (): Promise<User> => {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    throwIfError(authError);
    if (!authData.user) throw new Error("Sesión no válida");
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, nombre")
      .eq("id", authData.user.id)
      .single();
    throwIfError(error);
    if (!data) throw new Error("Perfil de usuario no encontrado");
    return {
      id: data.id,
      email: data.email,
      nombre: data.nombre,
      picture: authData.user.user_metadata.avatar_url ?? null,
    };
  },

  onboardingStatus: async () => {
    const { data, error } = await supabase
      .from("vialts")
      .select("id")
      .eq("slug", "raiz")
      .maybeSingle();
    throwIfError(error);
    if (!data) return { completado: false, slug: "raiz" };
    const { data: profile, error: profileError } = await supabase
      .from("patient_profiles")
      .select("vialt_id")
      .eq("vialt_id", data.id)
      .maybeSingle();
    throwIfError(profileError);
    return { completado: Boolean(profile), slug: "raiz" };
  },

  completeOnboarding: async (payload: OnboardingPayload) => {
    const { data, error } = await supabase.rpc("complete_onboarding", {
      p_persona: payload.persona,
      p_condiciones: (payload.condiciones ?? []).filter((item) => item.nombre.trim()),
      p_medicaciones: (payload.medicaciones ?? []).filter((item) => item.nombre.trim()),
      p_alergias: (payload.alergias ?? []).filter((item) => item.nombre.trim()),
      p_vacunas: (payload.vacunas ?? []).filter((item) => item.nombre.trim()),
      p_consent: payload.consentimiento === true,
    });
    throwIfError(error);
    const vault = await api.getVialt("raiz");
    return { ok: true, vault: vault.summary, id: data as string };
  },

  updateProfile: async (slug: string, values: Partial<OnboardingPayload["persona"]>) => {
    const row = await getVialtRow(slug);
    const currentProfile = await getProfile(row.id);
    const updates = Object.fromEntries(
      Object.entries(values).filter(([, value]) => value !== undefined),
    );
    const { error } = await supabase.from("patient_profiles").upsert({
      vialt_id: row.id,
      owner_id: row.owner_id,
      fecha_nacimiento: currentProfile?.fecha_nacimiento ?? null,
      sexo: currentProfile?.sexo ?? null,
      tipo_sangre: currentProfile?.tipo_sangre ?? null,
      peso_kg: currentProfile?.peso_kg ?? null,
      altura_cm: currentProfile?.altura_cm ?? null,
      contacto_emergencia: currentProfile?.contacto_emergencia ?? null,
      ...updates,
    }, { onConflict: "vialt_id" });
    throwIfError(error);
    const { profile } = await loadVault(slug);
    return summarizeVialt(row, profile);
  },

  listVialts: async (): Promise<VaultSummary[]> => {
    const { data, error } = await supabase
      .from("vialts")
      .select("id, owner_id, slug, nombre, tipo, created_at, updated_at")
      .order("created_at", { ascending: true });
    throwIfError(error);
    const rows = (data ?? []) as VialtRow[];
    if (rows.length === 0) return [];
    const vialtIds = rows.map((row) => row.id);
    const [profilesResult, itemsResult] = await Promise.all([
      supabase.from("patient_profiles")
        .select("vialt_id, fecha_nacimiento, sexo, tipo_sangre, peso_kg, altura_cm, contacto_emergencia")
        .in("vialt_id", vialtIds),
      supabase.from("clinical_items")
        .select("id, vialt_id, category, data")
        .in("vialt_id", vialtIds),
    ]);
    throwIfError(profilesResult.error);
    throwIfError(itemsResult.error);
    const profiles = new Map(
      (profilesResult.data ?? []).map((profile) => [profile.vialt_id, profile as PatientProfileRow]),
    );
    const itemsByVialt = new Map<string, ClinicalItemRow[]>();
    for (const item of itemsResult.data ?? []) {
      const current = itemsByVialt.get(item.vialt_id) ?? [];
      current.push(item as ClinicalItemRow);
      itemsByVialt.set(item.vialt_id, current);
    }
    return rows.map((row) => {
      const profile = profiles.get(row.id) ?? null;
      const items = itemsByVialt.get(row.id) ?? [];
      return { ...summarizeVialt(row, profile), score: healthScore(profile, items).score };
    });
  },

  createVialt: async ({ nombre }: { nombre: string }): Promise<VaultSummary> => {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    throwIfError(authError);
    if (!authData.user) throw new Error("Sesión no válida");
    const cleanName = nombre.trim();
    const { data, error } = await supabase.from("vialts").insert({
      owner_id: authData.user.id,
      slug: slugify(cleanName),
      nombre: cleanName,
      tipo: "persona",
    }).select("id, owner_id, slug, nombre, tipo, created_at, updated_at").single();
    throwIfError(error);
    return summarizeVialt(data as VialtRow, null);
  },

  getVialt: async (slug: string): Promise<VaultDetail> => {
    const { row, profile, items } = await loadVault(slug);
    const [{ data: consent, error: consentError }] = await Promise.all([
      supabase.from("consent_events").select("id").eq("vialt_id", row.id).limit(1),
    ]);
    throwIfError(consentError);
    const userData = Object.fromEntries(
      Object.entries(profile ?? {}).filter(([, value]) => value !== null),
    );
    const files: VaultFiles = { user: userData };
    for (const category of CLINICAL_CATEGORIES) {
      files[category] = {
        items: items.filter((item) => item.category === category).map((item) => item.data),
      };
    }
    return {
      summary: summarizeVialt(row, profile),
      files,
      consentimiento: Boolean(consent?.length),
    };
  },

  getChatHistory: async (slug: string): Promise<ChatMsg[]> => {
    const row = await getVialtRow(slug);
    const { data, error } = await supabase
      .from("chat_messages")
      .select("role, content, created_at")
      .eq("vialt_id", row.id)
      .order("created_at", { ascending: false })
      .limit(50);
    throwIfError(error);
    return (data ?? []).reverse() as ChatMsg[];
  },

  getHealthScore: async (slug: string): Promise<HealthScore> => {
    const { profile, items } = await loadVault(slug);
    return healthScore(profile, items);
  },

  listGoals: async (slug: string): Promise<GoalItem[]> => {
    const row = await getVialtRow(slug);
    const { data, error } = await supabase
      .from("goals")
      .select("id, titulo, created_at")
      .eq("vialt_id", row.id)
      .order("created_at", { ascending: false })
      .limit(50);
    throwIfError(error);
    return (data ?? []).map((goal) => ({
      path: `Goals/${goal.id}.md`,
      titulo: goal.titulo,
      tipo: "meta",
      creado: goal.created_at,
    }));
  },

  saveGoal: async (slug: string, value: { titulo: string; contenido: string }) => {
    const row = await getVialtRow(slug);
    const { data: authData, error: authError } = await supabase.auth.getUser();
    throwIfError(authError);
    if (!authData.user) throw new Error("Sesión no válida");
    const { data, error } = await supabase.from("goals").insert({
      owner_id: authData.user.id,
      vialt_id: row.id,
      titulo: value.titulo.trim() || "Recomendación de la IA",
      contenido: value.contenido.trim().slice(0, 3000),
    }).select("id").single();
    throwIfError(error);
    if (!data) throw new Error("No se pudo guardar la recomendación");
    return { ok: true, path: `Goals/${data.id}.md` };
  },
};

export async function streamChat(
  slug: string,
  message: string,
  on: {
    token: (token: string) => void;
    done?: (result: ChatDone) => void;
    error?: (message: string) => void;
  },
): Promise<void> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) {
    on.error?.("Inicia sesión para continuar.");
    return;
  }
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    on.error?.("Supabase no está configurado.");
    return;
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${sessionData.session.access_token}`,
    },
    body: JSON.stringify({ slug, message }),
  });
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    on.error?.(body?.error ?? `Error ${response.status}`);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      const line = event.split("\n").find((part) => part.startsWith("data: "));
      if (!line) continue;
      try {
        const parsed = JSON.parse(line.slice(6)) as { type: string; data: unknown };
        if (parsed.type === "token") on.token(parsed.data as string);
        else if (parsed.type === "done") on.done?.(parsed.data as ChatDone);
        else if (parsed.type === "error") on.error?.(String(parsed.data));
      } catch {
        // Ignora eventos parciales o malformados sin terminar el stream.
      }
    }
  }
}
