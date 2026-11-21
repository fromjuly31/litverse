begin;

-- Evaluate the authenticated user once per query, preserving ownership checks.
alter policy work_teacher_read on public.literary_work_versions
  using (teacher_id = (select auth.uid()));
alter policy deepening_teacher_read on public.deepening_sessions
  using (exists (select 1 from public.activities a
    where a.id = activity_id and a.teacher_id = (select auth.uid())));
alter policy deepening_record_teacher_read on public.deepening_records
  using (exists (select 1 from public.activities a
    where a.id = activity_id and a.teacher_id = (select auth.uid())));

-- Cover foreign keys used for lesson ownership, joins, and deletion cascades.
create index activities_deepening_session_idx on public.activities(deepening_session_id);
create index deepening_ai_jobs_record_idx on public.deepening_ai_jobs(record_id);
create index deepening_records_session_activity_idx on public.deepening_records(session_id, activity_id);
create index deepening_records_worksheet_idx on public.deepening_records(worksheet_id);
create index deepening_sessions_work_version_idx on public.deepening_sessions(work_version_id);
create index deletion_jobs_teacher_idx on public.deletion_jobs(teacher_id);
create index literary_work_versions_teacher_idx on public.literary_work_versions(teacher_id);
create index revoked_student_codes_activity_idx on public.revoked_student_codes(activity_id);
create index upload_jobs_activity_idx on public.upload_jobs(activity_id);
create index upload_jobs_worksheet_idx on public.upload_jobs(worksheet_id);

commit;
