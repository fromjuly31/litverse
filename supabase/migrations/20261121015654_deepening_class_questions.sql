begin;

create function public.start_deepening_class_questions(
  p_teacher uuid, p_activity uuid, p_session uuid, p_input jsonb,
  p_analysis jsonb, p_password text, p_tokens jsonb
) returns public.deepening_sessions
language plpgsql security invoker set search_path = '' as $$
declare
  session_row public.deepening_sessions;
begin
  -- Serialize creation even before a new activity row exists.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_activity::text, 0));
  session_row := public.configure_deepening(
    p_teacher, p_activity, p_session, p_input, p_analysis, p_analysis,
    'manual', true, p_password, p_tokens
  );
  if not exists (
    select 1 from public.literary_work_versions
      where id = session_row.work_version_id and reviewed_analysis->>'mode' = 'class_questions'
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if session_row.status = 'DRAFT' then
    session_row := public.control_deepening(
      p_teacher, p_activity, session_row.id, 'OPEN', 'private', 'deepening'
    );
  end if;
  return session_row;
end;
$$;

create function public.submit_deepening_class_response(
  p_activity uuid, p_session uuid, p_hash text, p_label text, p_answers jsonb
) returns public.deepening_records
language plpgsql security invoker set search_path = '' as $$
declare
  session_row public.deepening_sessions;
  response_row public.deepening_records;
  worksheet_row public.worksheets;
  lesson_analysis jsonb;
begin
  -- The teacher controls lock the activity first and then the session.
  perform 1 from public.activities
    where id = p_activity and not deletion_pending for share;
  if not found then raise exception 'FORBIDDEN'; end if;
  select * into session_row from public.deepening_sessions
    where id = p_session and activity_id = p_activity for share;
  if not found then raise exception 'FORBIDDEN'; end if;

  if exists (select 1 from public.revoked_student_codes where code_hash = p_hash) then
    raise exception 'FORBIDDEN';
  end if;
  select reviewed_analysis into lesson_analysis
    from public.literary_work_versions where id = session_row.work_version_id;
  if lesson_analysis->>'mode' is distinct from 'class_questions' then
    raise exception 'FORBIDDEN';
  end if;
  if jsonb_typeof(p_answers) is distinct from 'array' then
    raise exception 'INVALID_CLASS_RESPONSE';
  end if;
  if jsonb_array_length(p_answers) <> jsonb_array_length(lesson_analysis->'questions')
    or coalesce(length(btrim(p_label)), 0) not between 1 and 40
    or exists (
      select 1 from jsonb_array_elements(p_answers) as item(value)
      where jsonb_typeof(value) <> 'string' or length(btrim(value #>> '{}')) not between 1 and 4000
    ) then
    raise exception 'INVALID_CLASS_RESPONSE';
  end if;

  if session_row.status = 'OPEN' then
    select * into worksheet_row from public.worksheets
      where activity_id = p_activity and submission_code_hash = p_hash and not deletion_pending;
    insert into public.deepening_records (
      session_id, activity_id, participant_hash, student_label, worksheet_id,
      answers, answers_submitted_at, completed_at, revision
    ) values (
      p_session, p_activity, p_hash, coalesce(worksheet_row.student_label, btrim(p_label)), worksheet_row.id,
      p_answers, now(), now(), 1
    ) on conflict (session_id, participant_hash) do nothing
    returning * into response_row;
    if found then return response_row; end if;
  end if;

  -- A retry after a dropped response returns the original, even after closing.
  select * into response_row from public.deepening_records
    where session_id = p_session and participant_hash = p_hash;
  if response_row.id is not null then
    if response_row.answers = p_answers then return response_row; end if;
    raise exception 'CLASS_RESPONSE_SUBMITTED';
  end if;
  raise exception 'STAGE_CLOSED';
end;
$$;

revoke execute on function public.start_deepening_class_questions(uuid, uuid, uuid, jsonb, jsonb, text, jsonb),
  public.submit_deepening_class_response(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.start_deepening_class_questions(uuid, uuid, uuid, jsonb, jsonb, text, jsonb),
  public.submit_deepening_class_response(uuid, uuid, text, text, jsonb) to service_role;

commit;
