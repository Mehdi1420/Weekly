-- Ma Semaine : une ligne de données par utilisateur.
-- À exécuter une fois dans Supabase : SQL Editor → New query → coller → Run.

create table if not exists public.user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Sécurité : chaque utilisateur ne peut lire et modifier que sa propre ligne
alter table public.user_data enable row level security;

drop policy if exists "Lire ses données" on public.user_data;
drop policy if exists "Créer ses données" on public.user_data;
drop policy if exists "Modifier ses données" on public.user_data;
drop policy if exists "Supprimer ses données" on public.user_data;

create policy "Lire ses données" on public.user_data
  for select using (auth.uid() = user_id);
create policy "Créer ses données" on public.user_data
  for insert with check (auth.uid() = user_id);
create policy "Modifier ses données" on public.user_data
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Supprimer ses données" on public.user_data
  for delete using (auth.uid() = user_id);
