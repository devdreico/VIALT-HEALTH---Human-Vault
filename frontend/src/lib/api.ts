import { useAuth, type User } from "../stores/auth";

export const BASE = import.meta.env.VITE_API_URL ?? "";

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

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
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
}

export interface VaultSummary {
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

async function request<T>(
  path: string,
  opts: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const { auth = false, ...init } = opts;
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (opts.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = useAuth.getState().token;
    headers["Authorization"] = `Bearer ${token}`;
  }
  const resp = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!resp.ok) {
    const detail = await resp
      .json()
      .then((d) => (d as { detail?: string }).detail)
      .catch(() => undefined);
    if (resp.status === 401 && auth) {
      useAuth.getState().clear();
      window.location.replace("/login");
    }
    throw new Error(detail ?? `Error ${resp.status}`);
  }
  return resp.json() as Promise<T>;
}

export const api = {
  getHealth: () => request<Health>("/api/health"),
  authConfig: () => request<{ google_enabled: boolean }>("/api/auth/config"),
  register: (b: { nombre: string; email: string; password: string }) =>
    request<AuthResponse>("/api/auth/register", { method: "POST", body: JSON.stringify(b) }),
  login: (b: { email: string; password: string }) =>
    request<AuthResponse>("/api/auth/login", { method: "POST", body: JSON.stringify(b) }),
  me: () => request<User>("/api/auth/me", { auth: true }),

  onboardingStatus: () =>
    request<{ completado: boolean; slug: string }>("/api/onboarding/status", { auth: true }),
  completeOnboarding: (b: OnboardingPayload) =>
    request<{ ok: boolean; vault: VaultSummary }>("/api/onboarding/complete", {
      method: "POST",
      body: JSON.stringify(b),
      auth: true,
    }),
  updateProfile: (
    slug: string,
    b: Partial<OnboardingPayload["persona"] & { nombre: string }>,
  ) =>
    request<VaultSummary>(`/api/vialts/${slug}/profile`, {
      method: "PATCH",
      body: JSON.stringify(b),
      auth: true,
    }),

  listVialts: () => request<VaultSummary[]>("/api/vialts", { auth: true }),
  createVialt: (b: { nombre: string }) =>
    request<VaultSummary>("/api/vialts", {
      method: "POST",
      body: JSON.stringify(b),
      auth: true,
    }),
  getVialt: (slug: string) => request<VaultDetail>(`/api/vialts/${slug}`, { auth: true }),
  getChatHistory: (slug: string) =>
    request<ChatMsg[]>(`/api/ai/${slug}/history`, { auth: true }),
  getHealthScore: (slug: string) =>
    request<HealthScore>(`/api/vialts/${slug}/health`, { auth: true }),
  listGoals: (slug: string) =>
    request<GoalItem[]>(`/api/vialts/${slug}/goals`, { auth: true }),
  saveGoal: (slug: string, b: { titulo: string; contenido: string }) =>
    request<{ ok: boolean; path: string }>(`/api/ai/${slug}/goals`, {
      method: "POST",
      body: JSON.stringify(b),
      auth: true,
    }),
};

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
  log: string;
  sources: ChatSource[];
}

export async function streamChat(
  slug: string,
  message: string,
  on: {
    token: (t: string) => void;
    done?: (d: ChatDone) => void;
    error?: (e: string) => void;
  },
): Promise<void> {
  const auth = useAuth.getState().token;
  const resp = await fetch(`${BASE}/api/ai/${slug}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    body: JSON.stringify({ message }),
  });
  if (!resp.ok || !resp.body) {
    const detail = await resp
      .json()
      .then((d) => (d as { detail?: string }).detail)
      .catch(() => undefined);
    on.error?.(detail ?? `Error ${resp.status}`);
    return;
  }
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done: fin, value } = await reader.read();
    if (fin) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        const ev = JSON.parse(line.slice(6)) as {
          type: string;
          data: unknown;
        };
        if (ev.type === "token") on.token(ev.data as string);
        else if (ev.type === "done") on.done?.(ev.data as ChatDone);
        else if (ev.type === "error") on.error?.(ev.data as string);
      } catch {
        /* fragmento parcial — se ignora */
      }
    }
  }
}
