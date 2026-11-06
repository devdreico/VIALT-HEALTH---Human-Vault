const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("VIALT_ALLOWED_ORIGIN") ?? "http://localhost:5173",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ollamaUrl = Deno.env.get("VIALT_OLLAMA_URL");
  const model = Deno.env.get("VIALT_OLLAMA_MODEL") ?? "qwen2.5:3b";
  let models: string[] = [];
  let connected = false;

  if (ollamaUrl) {
    try {
      const base = ollamaUrl.replace(/\/$/, "");
      const apiKey = Deno.env.get("VIALT_OLLAMA_API_KEY");
      const response = await fetch(`${base}/api/tags`, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) {
        const body = await response.json() as { models?: { name?: string }[] };
        models = (body.models ?? []).flatMap((item) => item.name ? [item.name] : []);
        connected = true;
      }
    } catch {
      connected = false;
    }
  }

  return new Response(JSON.stringify({
    status: "ok",
    app: "Supabase Edge Functions",
    vaults_dir: "Postgres (Supabase)",
    ollama: { connected, models },
    ollama_model: model,
  }), {
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
  });
});
