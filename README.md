# VIALT

VIALT es una aplicación Vite/React para administrar vaults médicos personales. La arquitectura usa Supabase Auth, Postgres con Row Level Security y Edge Functions para el chat en streaming. SQLite y Markdown se conservan únicamente como formatos de origen para importar datos existentes.

## Desarrollo local

1. Crea un proyecto Supabase y configura Authentication, Google como proveedor OAuth y las URLs de redirección para `http://localhost:5173/auth/success` y el dominio de producción.
2. Copia `frontend/.env.example` a `frontend/.env.local` y define `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (o la publishable key). Estas son las únicas claves de Supabase que deben llegar al navegador. Nunca uses `service_role` o una secret key en `VITE_*`.
3. Instala y ejecuta el frontend:

	```sh
	npm --prefix frontend install
	npm --prefix frontend run dev
	```

4. Aplica la migración SQL y despliega funciones con Supabase CLI:

	```sh
	npx supabase login
	npx supabase link --project-ref <project-ref>
	npx supabase db push
	npx supabase functions deploy chat
	npx supabase functions deploy system-health
	```

5. Configura los secretos de las Edge Functions. `VIALT_OLLAMA_URL` debe ser un endpoint HTTPS alcanzable desde Supabase, no `localhost` ni un hostname privado de Docker. En producción, publícalo detrás de un gateway autenticado; no expongas Ollama directamente a Internet.

	```sh
	npx supabase secrets set VIALT_OLLAMA_URL=https://ollama.example.com
	# Si el gateway protege Ollama con Bearer token
	npx supabase secrets set VIALT_OLLAMA_API_KEY=<secret>
	npx supabase secrets set VIALT_OLLAMA_MODEL=qwen2.5:3b
	npx supabase secrets set VIALT_ALLOWED_ORIGIN=https://tu-dominio.example
	# Opcional: motor SearXNG accesible por HTTPS
	npx supabase secrets set VIALT_SEARXNG_URL=https://search.example.com
	```

## OAuth Google

En Supabase Auth, configura el Client ID/secret de Google y registra como callback de Google `https://<project-ref>.supabase.co/auth/v1/callback`. En las URL Configuration de Supabase incluye los callbacks permitidos de desarrollo y producción (`/auth/success`). El flujo del navegador usa PKCE y la sesión oficial de Supabase; no se envían tokens propios en fragmentos de URL.

## Datos y seguridad

- `supabase/migrations/` es la fuente versionada del esquema. Todas las tablas de usuario tienen RLS; la `service_role` solo debe usarse en procesos administrativos de confianza.
- El onboarding se ejecuta en una RPC transaccional y registra consentimiento antes de almacenar datos clínicos. Prueba las políticas RLS con dos usuarios distintos antes de abrir el sistema a usuarios reales.
- El historial médico es información sensible. Configura región, retención, backups, accesos administrativos y obligaciones legales aplicables antes de producción. El uso de Supabase no acredita por sí mismo cumplimiento normativo.
- La IA necesita acceso de red desde Edge a Ollama. Ollama en una máquina local o en una red Docker privada no es accesible desde Supabase; si no se puede ofrecer un endpoint remoto autenticado, hay que desplegar un proveedor accesible o conservar un servicio backend seguro para IA.

## Build y despliegue

```sh
npm --prefix frontend run build
npm --prefix frontend run lint
```

En Vercel configura **Root Directory = `frontend`**; el único `vercel.json` usa comandos relativos a esa raíz (`npm ci`, `npm run build`, `dist`). Define `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en cada entorno. El repo se publica como una sola SPA y no despliega un servidor Python.

También puedes servir el mismo bundle Vite detrás de Caddy en un VPS:

```sh
cp .env.example .env
# Edita VIALT_DOMAIN y las dos variables VITE_SUPABASE_*
docker compose up -d --build
```

El contenedor solo sirve archivos estáticos y no ejecuta una API propia ni da acceso directo a Ollama. Las Edge Functions se despliegan a Supabase por separado.

## Migración desde VIALT legado

No apuntes la aplicación nueva al SQLite o a los `.md` antiguos. Haz un backup de `backend/data/`, prepara Supabase Auth para las cuentas existentes y migra perfiles/vaults/chat mediante un proceso de importación administrativa con `service_role` fuera del navegador. Los hashes bcrypt del sistema anterior no deben copiarse a Supabase sin validar compatibilidad; prepara restablecimiento de contraseña o un flujo transitorio de migración de credenciales. Coteja conteos, slugs, consentimiento y muestras clínicas antes del corte, y conserva el sistema antiguo en solo lectura hasta verificar el rollback.

El importador administrativo es `scripts/migrate_to_supabase.py`. Instala sus dependencias con `python3 -m pip install -r scripts/requirements-migration.txt`, configura `VIALT_DB_FILE`/`VIALT_VAULTS_DIR` si no usas las rutas legadas predeterminadas bajo `backend/data/` y ejecuta la simulación. Para aplicar, exporta `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`, y añade `--apply`. El importador no crea usuarios ni importa contraseñas; todas las cuentas deben existir y verificarse en Supabase Auth. Ejecútalo antes de permitir nuevas escrituras en la aplicación.
