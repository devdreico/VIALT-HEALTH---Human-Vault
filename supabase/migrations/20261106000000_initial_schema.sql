create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  nombre text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vialts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  nombre text not null check (length(btrim(nombre)) between 1 and 120),
  tipo text not null default 'persona' check (tipo in ('raiz', 'persona')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, slug),
  unique (id, owner_id)
);

create table public.patient_profiles (
  vialt_id uuid primary key,
  owner_id uuid not null,
  fecha_nacimiento date,
  sexo text,
  tipo_sangre text,
  peso_kg numeric(6, 2) check (peso_kg is null or peso_kg between 0 and 1000),
  altura_cm numeric(6, 2) check (altura_cm is null or altura_cm between 0 and 300),
  contacto_emergencia text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (vialt_id, owner_id) references public.vialts (id, owner_id) on delete cascade
);

create table public.clinical_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  vialt_id uuid not null,
  category text not null check (category in ('condiciones', 'medicaciones', 'alergias', 'vacunas')),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (vialt_id, owner_id) references public.vialts (id, owner_id) on delete cascade
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  vialt_id uuid not null,
  titulo text not null check (length(btrim(titulo)) between 1 and 160),
  contenido text not null check (length(btrim(contenido)) between 1 and 3000),
  created_at timestamptz not null default now(),
  foreign key (vialt_id, owner_id) references public.vialts (id, owner_id) on delete cascade
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  vialt_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (length(content) between 1 and 12000),
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  created_at timestamptz not null default now(),
  foreign key (vialt_id, owner_id) references public.vialts (id, owner_id) on delete cascade
);

create table public.consent_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  vialt_id uuid,
  policy_version text not null,
  accepted boolean not null check (accepted),
  source text not null check (source in ('registration', 'onboarding', 'google_onboarding')),
  accepted_at timestamptz not null default now(),
  foreign key (vialt_id, owner_id) references public.vialts (id, owner_id) on delete cascade
);

create table public.chat_rate_limits (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0)
);

create index vialts_owner_updated_idx on public.vialts (owner_id, updated_at desc);
create index clinical_items_vialt_category_idx on public.clinical_items (vialt_id, category);
create index clinical_items_data_idx on public.clinical_items using gin (data);
create index goals_vialt_created_idx on public.goals (vialt_id, created_at desc);
create index chat_messages_vialt_created_idx on public.chat_messages (vialt_id, created_at desc);
create index consent_events_owner_vialt_idx on public.consent_events (owner_id, vialt_id, accepted_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger vialts_set_updated_at before update on public.vialts
for each row execute function public.set_updated_at();
create trigger patient_profiles_set_updated_at before update on public.patient_profiles
for each row execute function public.set_updated_at();
create trigger clinical_items_set_updated_at before update on public.clinical_items
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, nombre)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'nombre', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  on conflict (id) do update
    set email = excluded.email,
        nombre = coalesce(nullif(public.profiles.nombre, ''), excluded.nombre);
  if new.raw_user_meta_data ->> 'consent_accepted' = 'true'
     and nullif(new.raw_user_meta_data ->> 'consent_version', '') is not null then
    insert into public.consent_events (
      owner_id, policy_version, accepted, source, accepted_at
    ) values (
      new.id,
      new.raw_user_meta_data ->> 'consent_version',
      true,
      'registration',
      now()
    );
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_auth_user();

alter table public.profiles enable row level security;
alter table public.vialts enable row level security;
alter table public.patient_profiles enable row level security;
alter table public.clinical_items enable row level security;
alter table public.goals enable row level security;
alter table public.chat_messages enable row level security;
alter table public.consent_events enable row level security;
alter table public.chat_rate_limits enable row level security;

create policy "Users can read their profile" on public.profiles
for select to authenticated using (id = (select auth.uid()));

create policy "Owners manage their VIALTs" on public.vialts
for all to authenticated using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "Owners manage patient profiles" on public.patient_profiles
for all to authenticated using (owner_id = (select auth.uid()))
with check (
  owner_id = (select auth.uid()) and exists (
    select 1 from public.vialts v
    where v.id = vialt_id and v.owner_id = (select auth.uid())
  )
);

create policy "Owners manage clinical items" on public.clinical_items
for all to authenticated using (owner_id = (select auth.uid()))
with check (
  owner_id = (select auth.uid()) and exists (
    select 1 from public.vialts v
    where v.id = vialt_id and v.owner_id = (select auth.uid())
  )
);

create policy "Owners manage goals" on public.goals
for all to authenticated using (owner_id = (select auth.uid()))
with check (
  owner_id = (select auth.uid()) and exists (
    select 1 from public.vialts v
    where v.id = vialt_id and v.owner_id = (select auth.uid())
  )
);

create policy "Owners manage chat history" on public.chat_messages
for all to authenticated using (owner_id = (select auth.uid()))
with check (
  owner_id = (select auth.uid()) and exists (
    select 1 from public.vialts v
    where v.id = vialt_id and v.owner_id = (select auth.uid())
  )
);

create policy "Owners can read their consent history" on public.consent_events
for select to authenticated using (owner_id = (select auth.uid()));

revoke all on public.profiles, public.vialts, public.patient_profiles,
  public.clinical_items, public.goals, public.chat_messages,
  public.consent_events from anon;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.vialts, public.patient_profiles,
  public.clinical_items, public.goals, public.chat_messages to authenticated;
grant select on public.consent_events to authenticated;

create or replace function public.consume_chat_rate_limit(
  p_limit integer default 15,
  p_window_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_owner uuid := auth.uid();
  updated_count integer;
begin
  if current_owner is null then
    raise exception 'Autenticación requerida' using errcode = '28000';
  end if;
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'Límite de solicitudes inválido' using errcode = '22023';
  end if;

  insert into public.chat_rate_limits (owner_id, window_started_at, request_count)
  values (current_owner, now(), 1)
  on conflict (owner_id) do update set
    window_started_at = case
      when public.chat_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
        then now()
      else public.chat_rate_limits.window_started_at
    end,
    request_count = case
      when public.chat_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
        then 1
      else public.chat_rate_limits.request_count + 1
    end
  returning request_count into updated_count;

  return updated_count <= p_limit;
end;
$$;

revoke all on function public.consume_chat_rate_limit(integer, integer) from public, anon;
grant execute on function public.consume_chat_rate_limit(integer, integer) to authenticated;

create or replace function public.complete_onboarding(
  p_persona jsonb,
  p_condiciones jsonb,
  p_medicaciones jsonb,
  p_alergias jsonb,
  p_vacunas jsonb,
  p_consent boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_owner uuid := auth.uid();
  root_vialt_id uuid;
  category_name text;
  item_data jsonb;
begin
  if current_owner is null then
    raise exception 'Autenticación requerida' using errcode = '28000';
  end if;
  if p_consent is distinct from true then
    raise exception 'Se requiere consentimiento para registrar datos de salud' using errcode = '22023';
  end if;
  if coalesce(length(btrim(p_persona ->> 'nombre')), 0) < 2
     or nullif(p_persona ->> 'fecha_nacimiento', '') is null
     or nullif(p_persona ->> 'sexo', '') is null
     or nullif(p_persona ->> 'tipo_sangre', '') is null then
    raise exception 'Faltan datos personales obligatorios' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_condiciones, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_medicaciones, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_alergias, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_vacunas, '[]'::jsonb)) <> 'array' then
    raise exception 'Las listas clínicas deben ser arreglos' using errcode = '22023';
  end if;

  insert into public.vialts (owner_id, slug, nombre, tipo)
  values (current_owner, 'raiz', btrim(p_persona ->> 'nombre'), 'raiz')
  on conflict (owner_id, slug) do update
    set nombre = excluded.nombre, tipo = 'raiz'
  returning id into root_vialt_id;

  insert into public.patient_profiles (
    vialt_id, owner_id, fecha_nacimiento, sexo, tipo_sangre,
    peso_kg, altura_cm, contacto_emergencia
  ) values (
    root_vialt_id, current_owner,
    (p_persona ->> 'fecha_nacimiento')::date,
    nullif(p_persona ->> 'sexo', ''),
    nullif(p_persona ->> 'tipo_sangre', ''),
    nullif(p_persona ->> 'peso_kg', '')::numeric,
    nullif(p_persona ->> 'altura_cm', '')::numeric,
    nullif(p_persona ->> 'contacto_emergencia', '')
  )
  on conflict (vialt_id) do update set
    fecha_nacimiento = excluded.fecha_nacimiento,
    sexo = excluded.sexo,
    tipo_sangre = excluded.tipo_sangre,
    peso_kg = excluded.peso_kg,
    altura_cm = excluded.altura_cm,
    contacto_emergencia = excluded.contacto_emergencia;

  foreach category_name in array array['condiciones', 'medicaciones', 'alergias', 'vacunas'] loop
    if jsonb_array_length(
      case category_name
        when 'condiciones' then coalesce(p_condiciones, '[]'::jsonb)
        when 'medicaciones' then coalesce(p_medicaciones, '[]'::jsonb)
        when 'alergias' then coalesce(p_alergias, '[]'::jsonb)
        else coalesce(p_vacunas, '[]'::jsonb)
      end
    ) > 0 then
      delete from public.clinical_items
      where vialt_id = root_vialt_id and owner_id = current_owner and category = category_name;

      for item_data in
        select value from jsonb_array_elements(
          case category_name
            when 'condiciones' then coalesce(p_condiciones, '[]'::jsonb)
            when 'medicaciones' then coalesce(p_medicaciones, '[]'::jsonb)
            when 'alergias' then coalesce(p_alergias, '[]'::jsonb)
            else coalesce(p_vacunas, '[]'::jsonb)
          end
        ) as item(value)
      loop
        if jsonb_typeof(item_data) = 'object'
           and nullif(btrim(item_data ->> 'nombre'), '') is not null then
          insert into public.clinical_items (owner_id, vialt_id, category, data)
          values (current_owner, root_vialt_id, category_name, item_data);
        end if;
      end loop;
    end if;
  end loop;

  insert into public.consent_events (owner_id, vialt_id, policy_version, accepted, source)
  values (
    current_owner, root_vialt_id, '1581-2012-v1', true,
    case when exists (
      select 1 from auth.users u
      where u.id = current_owner and u.raw_app_meta_data ->> 'provider' = 'google'
    ) then 'google_onboarding' else 'onboarding' end
  );

  return root_vialt_id;
end;
$$;

revoke all on function public.complete_onboarding(jsonb, jsonb, jsonb, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.complete_onboarding(jsonb, jsonb, jsonb, jsonb, jsonb, boolean) to authenticated;
