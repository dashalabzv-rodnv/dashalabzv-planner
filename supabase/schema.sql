-- Схема базы планера. Выполнить один раз: Supabase → SQL Editor → New query → вставить → Run.
-- У каждой строки есть владелец (user_id), и правила RLS дают доступ только к своим строкам.

create table if not exists public.tasks (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  id         text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.projects (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  id         text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.profiles (
  user_id    uuid primary key default auth.uid() references auth.users on delete cascade,
  name       text,
  insta      jsonb,
  updated_at timestamptz not null default now()
);

alter table public.tasks    enable row level security;
alter table public.projects enable row level security;
alter table public.profiles enable row level security;

create policy "own tasks"    on public.tasks    for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own projects" on public.projects for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own profile"  on public.profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- мгновенная синхронизация между устройствами
alter publication supabase_realtime add table public.tasks, public.projects, public.profiles;
