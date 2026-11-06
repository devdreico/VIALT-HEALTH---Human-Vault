import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("VIALT_ALLOWED_ORIGIN") ?? "http://localhost:5173",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

const MODEL = "openai/gpt-oss-120b";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function encodeBase64(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value));
}

async function encryptionKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt"]);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!new Set(["GET", "POST", "DELETE"]).has(request.method)) {
    return jsonResponse({ error: "Método no permitido" }, 405);
  }

  const authorization = request.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "Configuración de autenticación no disponible" }, 503);
  }
  if (!authorization) return jsonResponse({ error: "Inicia sesión para administrar tu clave" }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return jsonResponse({ error: "Sesión no válida" }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (request.method === "GET") {
    const { data, error } = await admin.from("user_ai_credentials")
      .select("owner_id")
      .eq("owner_id", authData.user.id)
      .maybeSingle();
    if (error) return jsonResponse({ error: "No se pudo consultar la configuración de IA" }, 503);
    return jsonResponse({
      configured: Boolean(data),
      provider: data ? "openrouter" : null,
      model: data ? MODEL : null,
    });
  }

  if (request.method === "DELETE") {
    const { error } = await admin.from("user_ai_credentials")
      .delete()
      .eq("owner_id", authData.user.id);
    if (error) return jsonResponse({ error: "No se pudo eliminar la clave" }, 503);
    return jsonResponse({ configured: false, provider: null, model: null });
  }

  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (contentLength > 4096) return jsonResponse({ error: "Solicitud demasiado grande" }, 413);

  let payload: { apiKey?: unknown; confirmMedicalDataTransfer?: unknown };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Cuerpo JSON inválido" }, 400);
  }
  const apiKey = typeof payload.apiKey === "string" ? payload.apiKey.trim() : "";
  if (apiKey.length < 20 || apiKey.length > 512) {
    return jsonResponse({ error: "La clave OpenRouter no tiene un formato válido" }, 400);
  }
  if (payload.confirmMedicalDataTransfer !== true) {
    return jsonResponse({ error: "Confirma el envío del contexto médico a OpenRouter" }, 400);
  }

  const encryptionSecret = Deno.env.get("VIALT_KEY_ENCRYPTION_SECRET");
  if (!encryptionSecret || encryptionSecret.length < 32) {
    return jsonResponse({ error: "El almacenamiento cifrado no está configurado" }, 503);
  }

  let validation: Response;
  try {
    validation = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return jsonResponse({ error: "No se pudo validar la clave con OpenRouter" }, 502);
  }
  if (!validation.ok) {
    await validation.body?.cancel();
    return jsonResponse({ error: "OpenRouter rechazó la clave proporcionada" }, 400);
  }
  await validation.body?.cancel();

  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey(encryptionSecret);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(apiKey),
  );
  const { error: saveError } = await admin.rpc("save_openrouter_credential", {
    p_owner_id: authData.user.id,
    p_ciphertext: encodeBase64(new Uint8Array(encrypted)),
    p_nonce: encodeBase64(nonce),
  });
  if (saveError) return jsonResponse({ error: "No se pudo guardar la clave cifrada" }, 503);

  return jsonResponse({ configured: true, provider: "openrouter", model: MODEL });
});
