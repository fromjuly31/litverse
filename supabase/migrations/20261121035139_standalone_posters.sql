begin;

create table public.standalone_posters (
  id uuid primary key default gen_random_uuid(),
  final_result jsonb not null,
  title text generated always as (final_result->>'title') stored not null,
  author text generated always as (final_result->>'author') stored not null,
  signature text generated always as (final_result->>'signature') stored not null,
  character_image_path text not null check (character_image_path like 'exhibition/%'),
  scene_image_path text not null check (scene_image_path like 'exhibition/%'),
  finalized_at timestamptz not null default now(),
  check (nullif(final_result#>>'{character,image_id}', '') is not null),
  check (nullif(final_result#>>'{scene,image_id}', '') is not null),
  check (character_image_path <> scene_image_path)
);

alter table public.standalone_posters enable row level security;
revoke all on public.standalone_posters from public, anon, authenticated;
grant select, insert, update, delete on public.standalone_posters to service_role;

create view public.exhibition_posters with (security_invoker = true) as
select
  a.id, a.title, a.author, a.course_name, a.class_name, a.stage, a.created_at,
  a.updated_at, a.finalized_at, a.signature, a.lesson_kind, a.active_phase,
  a.deepening_session_id, a.final_result, a.deletion_pending,
  null::text as character_image_path, null::text as scene_image_path
from public.activities a
where a.finalized_at is not null
  and not exists (select 1 from public.standalone_posters p where p.id = a.id)
union all
select
  p.id, p.title, p.author, ''::text, p.signature, 'CLOSED'::text, p.finalized_at,
  p.finalized_at, p.finalized_at, p.signature, null::text, null::text,
  null::uuid, p.final_result, false, p.character_image_path, p.scene_image_path
from public.standalone_posters p;

revoke all on public.exhibition_posters from public, anon, authenticated;
grant select on public.exhibition_posters to service_role;

commit;
