create table if not exists public.mente_backups (
  user_id uuid primary key references auth.users (id) on delete cascade,
  backup jsonb not null,
  updated_at timestamptz not null default now(),
  constraint mente_backups_format check (
    backup ->> 'format' = 'mente-backup'
    and backup ->> 'version' = '1'
    and jsonb_typeof(backup -> 'data') = 'object'
  )
);

alter table public.mente_backups enable row level security;

revoke all on public.mente_backups from anon;
grant select, insert, update, delete on public.mente_backups to authenticated;

create policy "Users can read their own MENTE backup"
  on public.mente_backups for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own MENTE backup"
  on public.mente_backups for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own MENTE backup"
  on public.mente_backups for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own MENTE backup"
  on public.mente_backups for delete to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.set_mente_backup_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger mente_backups_updated_at
  before update on public.mente_backups
  for each row execute function public.set_mente_backup_updated_at();
