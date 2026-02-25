-- 047_portal_client_wow_suite_054.sql
-- Brand kit + portal suite consistency for client portal wow phase 1

create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Brand kit core
-- ---------------------------------------------------------------------------

create table if not exists public.brand_kits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text,
  logos text[] not null default '{}',
  accent_light text,
  accent_dark text,
  apply_portal_accent boolean not null default false,
  notes text,
  auto_adjusted boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.brand_kits
  add column if not exists client_id uuid references public.clients(id) on delete cascade,
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists title text,
  add column if not exists logos text[] not null default '{}',
  add column if not exists accent_light text,
  add column if not exists accent_dark text,
  add column if not exists apply_portal_accent boolean not null default false,
  add column if not exists notes text,
  add column if not exists auto_adjusted boolean not null default false,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists idx_brand_kits_client on public.brand_kits(client_id) where deleted_at is null;
create index if not exists idx_brand_kits_project on public.brand_kits(project_id) where deleted_at is null;

create table if not exists public.brand_kit_versions (
  id uuid primary key default gen_random_uuid(),
  brand_kit_id uuid not null references public.brand_kits(id) on delete cascade,
  version_number integer not null,
  summary text,
  payload jsonb not null default '{}'::jsonb,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.brand_kit_versions
  add column if not exists brand_kit_id uuid references public.brand_kits(id) on delete cascade,
  add column if not exists version_number integer,
  add column if not exists summary text,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists changed_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists idx_brand_kit_versions_unique
  on public.brand_kit_versions(brand_kit_id, version_number);

create table if not exists public.brand_assets (
  id uuid primary key default gen_random_uuid(),
  brand_kit_id uuid not null references public.brand_kits(id) on delete cascade,
  asset_type text not null default 'logo',
  label text,
  file_url text,
  created_at timestamptz not null default now()
);

alter table public.brand_assets
  add column if not exists brand_kit_id uuid references public.brand_kits(id) on delete cascade,
  add column if not exists asset_type text,
  add column if not exists label text,
  add column if not exists file_url text,
  add column if not exists created_at timestamptz not null default now();

create table if not exists public.brand_colors (
  id uuid primary key default gen_random_uuid(),
  brand_kit_id uuid not null references public.brand_kits(id) on delete cascade,
  name text,
  hex text not null,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

alter table public.brand_colors
  add column if not exists brand_kit_id uuid references public.brand_kits(id) on delete cascade,
  add column if not exists name text,
  add column if not exists hex text,
  add column if not exists source text,
  add column if not exists created_at timestamptz not null default now();

create table if not exists public.brand_fonts (
  id uuid primary key default gen_random_uuid(),
  brand_kit_id uuid not null references public.brand_kits(id) on delete cascade,
  name text not null,
  usage text,
  created_at timestamptz not null default now()
);

alter table public.brand_fonts
  add column if not exists brand_kit_id uuid references public.brand_kits(id) on delete cascade,
  add column if not exists name text,
  add column if not exists usage text,
  add column if not exists created_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- Documents / references / milestones consistency (idempotent)
-- ---------------------------------------------------------------------------

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  file_url text,
  status text not null default 'issued',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.documents
  add column if not exists project_id uuid references public.projects(id) on delete cascade,
  add column if not exists title text,
  add column if not exists file_url text,
  add column if not exists status text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists idx_documents_project on public.documents(project_id) where deleted_at is null;

create table if not exists public.references (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  url text not null,
  notes text,
  tags text[] not null default '{}',
  status text not null default 'approved',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.references
  add column if not exists project_id uuid references public.projects(id) on delete cascade,
  add column if not exists url text,
  add column if not exists notes text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists status text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists idx_references_project on public.references(project_id) where deleted_at is null;

create table if not exists public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  status text not null default 'open',
  due_date timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.milestones
  add column if not exists project_id uuid references public.projects(id) on delete cascade,
  add column if not exists title text,
  add column if not exists status text,
  add column if not exists due_date timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists idx_milestones_project on public.milestones(project_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists brand_kits_updated_at on public.brand_kits;
create trigger brand_kits_updated_at
before update on public.brand_kits
for each row execute function public.set_updated_at();

drop trigger if exists documents_updated_at on public.documents;
create trigger documents_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------

alter table public.brand_kits enable row level security;
alter table public.brand_kit_versions enable row level security;
alter table public.brand_assets enable row level security;
alter table public.brand_colors enable row level security;
alter table public.brand_fonts enable row level security;
alter table public.documents enable row level security;
alter table public.references enable row level security;
alter table public.milestones enable row level security;

DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('brand_kits','brand_kit_versions','brand_assets','brand_colors','brand_fonts','documents','references','milestones')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END$$;

create policy brand_kits_select on public.brand_kits
for select
using (
  deleted_at is null and (
    exists (
      select 1 from public.client_users cu
      where cu.client_id = brand_kits.client_id
        and cu.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.project_members pm
      join public.projects p on p.id = pm.project_id
      where pm.user_id = auth.uid()
        and p.client_id = brand_kits.client_id
        and pm.role in ('owner','admin','editor','producer')
    )
    or exists (
      select 1 from public.team_members tm
      where tm.user_id = auth.uid()
        and tm.role in ('owner','admin')
    )
  )
);

create policy brand_kits_write on public.brand_kits
for all
using (
  exists (
    select 1
    from public.project_members pm
    join public.projects p on p.id = pm.project_id
    where pm.user_id = auth.uid()
      and p.client_id = brand_kits.client_id
      and pm.role in ('owner','admin','editor','producer')
  )
  or exists (
    select 1 from public.client_users cu
    where cu.client_id = brand_kits.client_id
      and cu.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.project_members pm
    join public.projects p on p.id = pm.project_id
    where pm.user_id = auth.uid()
      and p.client_id = brand_kits.client_id
      and pm.role in ('owner','admin','editor','producer')
  )
  or exists (
    select 1 from public.client_users cu
    where cu.client_id = brand_kits.client_id
      and cu.user_id = auth.uid()
  )
);

create policy brand_kit_versions_access on public.brand_kit_versions
for all
using (
  exists (
    select 1 from public.brand_kits bk
    where bk.id = brand_kit_versions.brand_kit_id
      and (
        exists (select 1 from public.client_users cu where cu.client_id = bk.client_id and cu.user_id = auth.uid())
        or exists (
          select 1
          from public.project_members pm
          join public.projects p on p.id = pm.project_id
          where pm.user_id = auth.uid()
            and p.client_id = bk.client_id
            and pm.role in ('owner','admin','editor','producer')
        )
      )
  )
)
with check (
  exists (
    select 1 from public.brand_kits bk
    where bk.id = brand_kit_versions.brand_kit_id
      and (
        exists (select 1 from public.client_users cu where cu.client_id = bk.client_id and cu.user_id = auth.uid())
        or exists (
          select 1
          from public.project_members pm
          join public.projects p on p.id = pm.project_id
          where pm.user_id = auth.uid()
            and p.client_id = bk.client_id
            and pm.role in ('owner','admin','editor','producer')
        )
      )
  )
);

create policy brand_assets_access on public.brand_assets
for all
using (
  exists (
    select 1 from public.brand_kits bk
    where bk.id = brand_assets.brand_kit_id
      and (
        exists (select 1 from public.client_users cu where cu.client_id = bk.client_id and cu.user_id = auth.uid())
        or exists (
          select 1
          from public.project_members pm
          join public.projects p on p.id = pm.project_id
          where pm.user_id = auth.uid()
            and p.client_id = bk.client_id
            and pm.role in ('owner','admin','editor','producer')
        )
      )
  )
)
with check (
  exists (
    select 1 from public.brand_kits bk
    where bk.id = brand_assets.brand_kit_id
      and (
        exists (select 1 from public.client_users cu where cu.client_id = bk.client_id and cu.user_id = auth.uid())
        or exists (
          select 1
          from public.project_members pm
          join public.projects p on p.id = pm.project_id
          where pm.user_id = auth.uid()
            and p.client_id = bk.client_id
            and pm.role in ('owner','admin','editor','producer')
        )
      )
  )
);

create policy brand_colors_access on public.brand_colors
for all
using (
  exists (
    select 1 from public.brand_kits bk
    where bk.id = brand_colors.brand_kit_id
      and (
        exists (select 1 from public.client_users cu where cu.client_id = bk.client_id and cu.user_id = auth.uid())
        or exists (
          select 1
          from public.project_members pm
          join public.projects p on p.id = pm.project_id
          where pm.user_id = auth.uid()
            and p.client_id = bk.client_id
            and pm.role in ('owner','admin','editor','producer')
        )
      )
  )
)
with check (
  exists (
    select 1 from public.brand_kits bk
    where bk.id = brand_colors.brand_kit_id
      and (
        exists (select 1 from public.client_users cu where cu.client_id = bk.client_id and cu.user_id = auth.uid())
        or exists (
          select 1
          from public.project_members pm
          join public.projects p on p.id = pm.project_id
          where pm.user_id = auth.uid()
            and p.client_id = bk.client_id
            and pm.role in ('owner','admin','editor','producer')
        )
      )
  )
);

create policy brand_fonts_access on public.brand_fonts
for all
using (
  exists (
    select 1 from public.brand_kits bk
    where bk.id = brand_fonts.brand_kit_id
      and (
        exists (select 1 from public.client_users cu where cu.client_id = bk.client_id and cu.user_id = auth.uid())
        or exists (
          select 1
          from public.project_members pm
          join public.projects p on p.id = pm.project_id
          where pm.user_id = auth.uid()
            and p.client_id = bk.client_id
            and pm.role in ('owner','admin','editor','producer')
        )
      )
  )
)
with check (
  exists (
    select 1 from public.brand_kits bk
    where bk.id = brand_fonts.brand_kit_id
      and (
        exists (select 1 from public.client_users cu where cu.client_id = bk.client_id and cu.user_id = auth.uid())
        or exists (
          select 1
          from public.project_members pm
          join public.projects p on p.id = pm.project_id
          where pm.user_id = auth.uid()
            and p.client_id = bk.client_id
            and pm.role in ('owner','admin','editor','producer')
        )
      )
  )
);

create policy documents_access on public.documents
for select
using (
  deleted_at is null and (
    exists (
      select 1
      from public.project_members pm
      where pm.project_id = documents.project_id
        and pm.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.projects p
      join public.client_users cu on cu.client_id = p.client_id
      where p.id = documents.project_id
        and cu.user_id = auth.uid()
    )
  )
);

create policy documents_write on public.documents
for all
using (
  exists (
    select 1
    from public.project_members pm
    where pm.project_id = documents.project_id
      and pm.user_id = auth.uid()
      and pm.role in ('owner','admin','editor','producer')
  )
)
with check (
  exists (
    select 1
    from public.project_members pm
    where pm.project_id = documents.project_id
      and pm.user_id = auth.uid()
      and pm.role in ('owner','admin','editor','producer')
  )
);

create policy references_access on public.references
for all
using (
  deleted_at is null and (
    exists (
      select 1
      from public.project_members pm
      where pm.project_id = references.project_id
        and pm.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.projects p
      join public.client_users cu on cu.client_id = p.client_id
      where p.id = references.project_id
        and cu.user_id = auth.uid()
    )
  )
)
with check (
  exists (
    select 1
    from public.project_members pm
    where pm.project_id = references.project_id
      and pm.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.projects p
    join public.client_users cu on cu.client_id = p.client_id
    where p.id = references.project_id
      and cu.user_id = auth.uid()
  )
);

create policy milestones_access on public.milestones
for all
using (
  deleted_at is null and (
    exists (
      select 1
      from public.project_members pm
      where pm.project_id = milestones.project_id
        and pm.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.projects p
      join public.client_users cu on cu.client_id = p.client_id
      where p.id = milestones.project_id
        and cu.user_id = auth.uid()
    )
  )
)
with check (
  exists (
    select 1
    from public.project_members pm
    where pm.project_id = milestones.project_id
      and pm.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.projects p
    join public.client_users cu on cu.client_id = p.client_id
    where p.id = milestones.project_id
      and cu.user_id = auth.uid()
  )
);

