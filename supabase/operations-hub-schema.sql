-- Operations Hub Stage 1
-- Applied to the production Supabase project on 2026-07-21.
-- Safe to rerun: tables use IF NOT EXISTS and policies/triggers are replaced.

begin;

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Manager',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.venue_members (
  venue_id uuid not null references public.venues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_role text not null default 'manager'
    check (member_role in ('owner', 'manager', 'assistant', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (venue_id, user_id)
);

create table if not exists public.improvement_notes (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  capture_type text not null default 'text'
    check (capture_type in ('text', 'voice', 'photo', 'mixed')),
  title text,
  body text,
  transcript text,
  category text,
  status text not null default 'inbox'
    check (status in ('inbox', 'review', 'action', 'done', 'archived')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  next_action text,
  occurred_at timestamptz not null default now(),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.note_attachments (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.improvement_notes(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id),
  storage_path text not null unique,
  media_kind text not null check (media_kind in ('photo', 'audio')),
  file_name text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  duration_seconds integer check (
    duration_seconds is null or duration_seconds >= 0
  ),
  created_at timestamptz not null default now()
);

create index if not exists venue_members_user_idx
  on public.venue_members(user_id);

create index if not exists improvement_notes_venue_status_idx
  on public.improvement_notes(venue_id, status, created_at desc);

create index if not exists note_attachments_note_idx
  on public.note_attachments(note_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists venues_set_updated_at on public.venues;
create trigger venues_set_updated_at
before update on public.venues
for each row execute function public.set_updated_at();

drop trigger if exists improvement_notes_set_updated_at
  on public.improvement_notes;
create trigger improvement_notes_set_updated_at
before update on public.improvement_notes
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1),
      'Manager'
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_venue_member(check_venue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.venue_members vm
    where vm.venue_id = check_venue_id
      and vm.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_venue_owner(check_venue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.venue_members vm
    where vm.venue_id = check_venue_id
      and vm.user_id = (select auth.uid())
      and vm.member_role = 'owner'
  );
$$;

revoke all on function public.is_venue_member(uuid) from public;
revoke all on function public.is_venue_owner(uuid) from public;
grant execute on function public.is_venue_member(uuid) to authenticated;
grant execute on function public.is_venue_owner(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.venues enable row level security;
alter table public.venue_members enable row level security;
alter table public.improvement_notes enable row level security;
alter table public.note_attachments enable row level security;

revoke all on public.profiles from anon;
revoke all on public.venues from anon;
revoke all on public.venue_members from anon;
revoke all on public.improvement_notes from anon;
revoke all on public.note_attachments from anon;

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

grant select, insert, delete on public.venues to authenticated;
grant update (name) on public.venues to authenticated;

grant select, insert, delete on public.venue_members to authenticated;
grant update (member_role) on public.venue_members to authenticated;

grant select, insert, delete on public.improvement_notes to authenticated;
grant update (
  capture_type, title, body, transcript, category, status,
  priority, next_action, occurred_at, due_date
) on public.improvement_notes to authenticated;

grant select, insert, delete on public.note_attachments to authenticated;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists venues_select_allowed on public.venues;
create policy venues_select_allowed
on public.venues for select
to authenticated
using (
  created_by = (select auth.uid())
  or public.is_venue_member(id)
);

drop policy if exists venues_insert_own on public.venues;
create policy venues_insert_own
on public.venues for insert
to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists venues_update_owner on public.venues;
create policy venues_update_owner
on public.venues for update
to authenticated
using (public.is_venue_owner(id))
with check (public.is_venue_owner(id));

drop policy if exists venues_delete_owner on public.venues;
create policy venues_delete_owner
on public.venues for delete
to authenticated
using (public.is_venue_owner(id));

drop policy if exists members_select_allowed on public.venue_members;
create policy members_select_allowed
on public.venue_members for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.is_venue_member(venue_id)
);

drop policy if exists members_insert_allowed on public.venue_members;
create policy members_insert_allowed
on public.venue_members for insert
to authenticated
with check (
  public.is_venue_owner(venue_id)
  or (
    user_id = (select auth.uid())
    and member_role = 'owner'
    and exists (
      select 1
      from public.venues v
      where v.id = venue_id
        and v.created_by = (select auth.uid())
    )
  )
);

drop policy if exists members_update_owner on public.venue_members;
create policy members_update_owner
on public.venue_members for update
to authenticated
using (public.is_venue_owner(venue_id))
with check (public.is_venue_owner(venue_id));

drop policy if exists members_delete_owner on public.venue_members;
create policy members_delete_owner
on public.venue_members for delete
to authenticated
using (public.is_venue_owner(venue_id));

drop policy if exists notes_select_member on public.improvement_notes;
create policy notes_select_member
on public.improvement_notes for select
to authenticated
using (public.is_venue_member(venue_id));

drop policy if exists notes_insert_member on public.improvement_notes;
create policy notes_insert_member
on public.improvement_notes for insert
to authenticated
with check (
  public.is_venue_member(venue_id)
  and created_by = (select auth.uid())
);

drop policy if exists notes_update_member on public.improvement_notes;
create policy notes_update_member
on public.improvement_notes for update
to authenticated
using (public.is_venue_member(venue_id))
with check (public.is_venue_member(venue_id));

drop policy if exists notes_delete_allowed on public.improvement_notes;
create policy notes_delete_allowed
on public.improvement_notes for delete
to authenticated
using (
  created_by = (select auth.uid())
  or public.is_venue_owner(venue_id)
);

drop policy if exists attachments_select_member
  on public.note_attachments;
create policy attachments_select_member
on public.note_attachments for select
to authenticated
using (public.is_venue_member(venue_id));

drop policy if exists attachments_insert_member
  on public.note_attachments;
create policy attachments_insert_member
on public.note_attachments for insert
to authenticated
with check (
  public.is_venue_member(venue_id)
  and uploaded_by = (select auth.uid())
);

drop policy if exists attachments_delete_allowed
  on public.note_attachments;
create policy attachments_delete_allowed
on public.note_attachments for delete
to authenticated
using (
  uploaded_by = (select auth.uid())
  or public.is_venue_owner(venue_id)
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'operations-media',
  'operations-media',
  false,
  26214400,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'audio/webm',
    'audio/mp4',
    'audio/mpeg',
    'audio/aac',
    'audio/wav',
    'audio/x-m4a',
    'audio/ogg'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_access_media_path(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  folder_text text;
  folder_venue_id uuid;
begin
  folder_text := split_part(object_name, '/', 1);

  begin
    folder_venue_id := folder_text::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return exists (
    select 1
    from public.venue_members vm
    where vm.venue_id = folder_venue_id
      and vm.user_id = (select auth.uid())
  );
end;
$$;

revoke all on function public.can_access_media_path(text) from public;
grant execute on function public.can_access_media_path(text)
  to authenticated;

drop policy if exists operations_media_read on storage.objects;
create policy operations_media_read
on storage.objects for select
to authenticated
using (
  bucket_id = 'operations-media'
  and public.can_access_media_path(name)
);

drop policy if exists operations_media_upload on storage.objects;
create policy operations_media_upload
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'operations-media'
  and owner_id = (select auth.uid())::text
  and public.can_access_media_path(name)
);

drop policy if exists operations_media_update_own on storage.objects;
create policy operations_media_update_own
on storage.objects for update
to authenticated
using (
  bucket_id = 'operations-media'
  and owner_id = (select auth.uid())::text
  and public.can_access_media_path(name)
)
with check (
  bucket_id = 'operations-media'
  and owner_id = (select auth.uid())::text
  and public.can_access_media_path(name)
);

drop policy if exists operations_media_delete_own on storage.objects;
create policy operations_media_delete_own
on storage.objects for delete
to authenticated
using (
  bucket_id = 'operations-media'
  and owner_id = (select auth.uid())::text
  and public.can_access_media_path(name)
);

commit;
