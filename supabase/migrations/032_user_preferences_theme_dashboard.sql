-- ============================================================
-- Migration 032: User UI preferences (theme + dashboard mode)
-- ============================================================

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'dark' check (theme in ('light', 'dark')),
  dashboard_mode text not null default 'ceo' check (dashboard_mode in ('ceo', 'company')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

drop policy if exists "user_preferences: owner full access" on public.user_preferences;
create policy "user_preferences: owner full access"
  on public.user_preferences
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists user_preferences_updated_at on public.user_preferences;
create trigger user_preferences_updated_at
  before update on public.user_preferences
  for each row
  execute function public.update_updated_at();
