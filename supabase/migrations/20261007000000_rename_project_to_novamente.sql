do $$
begin
  if to_regclass('public.novamente_backups') is null
     and to_regclass('public.mente_backups') is not null then
    alter table public.mente_backups rename to novamente_backups;
  end if;
end;
$$;

alter table public.novamente_backups
  drop constraint if exists mente_backups_format;

alter table public.novamente_backups
  drop constraint if exists novamente_backups_format;

alter table public.novamente_backups
  add constraint novamente_backups_format check (
    backup ->> 'format' in ('novamente-backup', 'mente-backup')
    and backup ->> 'version' = '1'
    and jsonb_typeof(backup -> 'data') = 'object'
  );

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'novamente_backups'
      and policyname = 'Users can read their own MENTE backup'
  ) then
    alter policy "Users can read their own MENTE backup"
      on public.novamente_backups rename to "Users can read their own Novamente backup";
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'novamente_backups'
      and policyname = 'Users can create their own MENTE backup'
  ) then
    alter policy "Users can create their own MENTE backup"
      on public.novamente_backups rename to "Users can create their own Novamente backup";
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'novamente_backups'
      and policyname = 'Users can update their own MENTE backup'
  ) then
    alter policy "Users can update their own MENTE backup"
      on public.novamente_backups rename to "Users can update their own Novamente backup";
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'novamente_backups'
      and policyname = 'Users can delete their own MENTE backup'
  ) then
    alter policy "Users can delete their own MENTE backup"
      on public.novamente_backups rename to "Users can delete their own Novamente backup";
  end if;
  if to_regprocedure('public.set_mente_backup_updated_at()') is not null
     and to_regprocedure('public.set_novamente_backup_updated_at()') is null then
    alter function public.set_mente_backup_updated_at()
      rename to set_novamente_backup_updated_at;
  end if;
  if exists (
    select 1 from pg_trigger
    where tgrelid = 'public.novamente_backups'::regclass
      and tgname = 'mente_backups_updated_at'
  ) then
    alter trigger mente_backups_updated_at on public.novamente_backups
      rename to novamente_backups_updated_at;
  end if;
end;
$$;
