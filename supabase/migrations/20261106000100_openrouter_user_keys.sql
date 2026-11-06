create table public.user_ai_credentials (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  provider text not null check (provider = 'openrouter'),
  ciphertext text not null,
  nonce text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_ai_credentials enable row level security;
revoke all on public.user_ai_credentials from public, anon, authenticated;
grant all on public.user_ai_credentials to service_role;

create trigger user_ai_credentials_set_updated_at
before update on public.user_ai_credentials
for each row execute function public.set_updated_at();

alter table public.consent_events
  drop constraint consent_events_source_check;

alter table public.consent_events
  add constraint consent_events_source_check
  check (source in ('registration', 'onboarding', 'google_onboarding', 'openrouter'));

create or replace function public.save_openrouter_credential(
  p_owner_id uuid,
  p_ciphertext text,
  p_nonce text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_owner_id is null or p_ciphertext is null or p_nonce is null then
    raise exception 'Credencial OpenRouter incompleta' using errcode = '22023';
  end if;

  insert into public.user_ai_credentials (owner_id, provider, ciphertext, nonce)
  values (p_owner_id, 'openrouter', p_ciphertext, p_nonce)
  on conflict (owner_id) do update set
    provider = excluded.provider,
    ciphertext = excluded.ciphertext,
    nonce = excluded.nonce,
    updated_at = now();

  insert into public.consent_events (
    owner_id, vialt_id, policy_version, accepted, source, accepted_at
  ) values (
    p_owner_id, null, 'openrouter-medical-data-v1', true, 'openrouter', now()
  );
end;
$$;

revoke all on function public.save_openrouter_credential(uuid, text, text) from public, anon, authenticated;
grant execute on function public.save_openrouter_credential(uuid, text, text) to service_role;
