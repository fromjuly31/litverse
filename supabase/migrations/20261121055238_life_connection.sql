begin;

create table public.life_questions (
  activity_id uuid primary key references public.activities(id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 1 and 500),
  is_open boolean not null default true
);

create table public.life_responses (
  activity_id uuid not null references public.life_questions(activity_id) on delete cascade,
  participant_hash text not null,
  student_label text not null default '' check (char_length(student_label) <= 40),
  article_url text not null check (char_length(article_url) <= 2048 and article_url ~ '^https?://[^[:space:]]+$'),
  article_summary text not null check (char_length(btrim(article_summary)) between 1 and 2000),
  answer text not null check (char_length(btrim(answer)) between 1 and 4000),
  submitted_at timestamptz not null default now(),
  primary key (activity_id, participant_hash)
);

create index life_responses_submitted_idx on public.life_responses(activity_id, submitted_at, participant_hash);

alter table public.life_questions enable row level security;
alter table public.life_responses enable row level security;
revoke all on public.life_questions, public.life_responses from public, anon, authenticated;
grant select, insert, update, delete on public.life_questions, public.life_responses to service_role;

create function public.control_life_question(p_activity uuid, p_question text)
returns public.life_questions
language plpgsql security invoker set search_path = '' as $$
declare
  saved public.life_questions;
begin
  perform 1 from public.activities where id = p_activity and not deletion_pending for share;
  if not found then raise exception 'FORBIDDEN'; end if;

  if p_question is null then
    update public.life_questions set is_open = false where activity_id = p_activity returning * into saved;
    if not found then raise exception 'LIFE_NOT_STARTED'; end if;
    return saved;
  end if;

  insert into public.life_questions(activity_id, question)
    values (p_activity, p_question) on conflict do nothing;
  select * into saved from public.life_questions where activity_id = p_activity for update;
  if saved.question <> p_question and (
    saved.is_open or exists (select 1 from public.life_responses where activity_id = p_activity)
  ) then
    raise exception 'LIFE_QUESTION_LOCKED';
  end if;
  update public.life_questions set question = p_question, is_open = true
    where activity_id = p_activity returning * into saved;
  return saved;
end;
$$;

create function public.submit_life_response(
  p_activity uuid, p_hash text, p_label text, p_question text, p_entry jsonb
) returns public.life_responses
language plpgsql security invoker set search_path = '' as $$
declare
  prompt public.life_questions;
  saved public.life_responses;
begin
  perform 1 from public.activities where id = p_activity and not deletion_pending for share;
  if not found then raise exception 'FORBIDDEN'; end if;
  select * into prompt from public.life_questions where activity_id = p_activity for share;
  if not found then raise exception 'LIFE_NOT_STARTED'; end if;
  if prompt.question is distinct from p_question then raise exception 'LIFE_QUESTION_CHANGED'; end if;

  if prompt.is_open then
    insert into public.life_responses(activity_id, participant_hash, student_label, article_url, article_summary, answer)
      values (p_activity, p_hash, p_label, p_entry->>'article_url', p_entry->>'article_summary', p_entry->>'answer')
      on conflict do nothing returning * into saved;
    if found then return saved; end if;
  end if;

  select * into saved from public.life_responses where activity_id = p_activity and participant_hash = p_hash;
  if not found then raise exception 'LIFE_CLOSED'; end if;
  if (saved.article_url, saved.article_summary, saved.answer) is distinct from
     (p_entry->>'article_url', p_entry->>'article_summary', p_entry->>'answer') then
    raise exception 'LIFE_ALREADY_SUBMITTED';
  end if;
  return saved;
end;
$$;

revoke all on function public.control_life_question(uuid, text),
  public.submit_life_response(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.control_life_question(uuid, text),
  public.submit_life_response(uuid, text, text, text, jsonb) to service_role;

commit;
