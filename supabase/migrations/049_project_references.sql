-- Create project_references table for portal references CRUD
create table if not exists public.project_references (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  url text,
  platform text,
  notes text,
  tags text[] default array[]::text[],
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create index on project_id for efficient lookups
create index if not exists idx_project_references_project_id on public.project_references(project_id);
create index if not exists idx_project_references_platform on public.project_references(platform);

-- Enable RLS
alter table public.project_references enable row level security;

-- RLS Policy: SELECT for project members (client_viewer/approver)
create policy "select_references_for_project_members"
  on public.project_references
  for select
  using (
    exists(
      select 1 from public.project_members pm
      where pm.project_id = project_references.project_id
      and pm.user_id = auth.uid()
      and pm.role in ('client_viewer', 'client_approver')
    )
  );

-- RLS Policy: INSERT only for client_approver role
create policy "insert_references_for_approvers"
  on public.project_references
  for insert
  with check (
    exists(
      select 1 from public.project_members pm
      where pm.project_id = project_references.project_id
      and pm.user_id = auth.uid()
      and pm.role = 'client_approver'
    )
  );

-- RLS Policy: UPDATE only for client_approver role (can only update own references)
create policy "update_references_for_approvers"
  on public.project_references
  for update
  using (
    created_by = auth.uid()
    and exists(
      select 1 from public.project_members pm
      where pm.project_id = project_references.project_id
      and pm.user_id = auth.uid()
      and pm.role = 'client_approver'
    )
  )
  with check (
    exists(
      select 1 from public.project_members pm
      where pm.project_id = project_references.project_id
      and pm.user_id = auth.uid()
      and pm.role = 'client_approver'
    )
  );

-- RLS Policy: DELETE only for client_approver role (can only delete own references)
create policy "delete_references_for_approvers"
  on public.project_references
  for delete
  using (
    created_by = auth.uid()
    and exists(
      select 1 from public.project_members pm
      where pm.project_id = project_references.project_id
      and pm.user_id = auth.uid()
      and pm.role = 'client_approver'
    )
  );

-- Update trigger to refresh updated_at
create or replace function public.update_project_references_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_project_references_updated_at
  before update on public.project_references
  for each row
  execute function public.update_project_references_updated_at();
