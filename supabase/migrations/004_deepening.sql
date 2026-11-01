begin;
alter table public.activities add column lesson_kind text not null default 'understanding' check (lesson_kind in ('understanding','deepening'));
alter table public.activities add column active_phase text not null default 'understanding' check (active_phase in ('understanding','deepening'));
alter table public.activities add column deepening_session_id uuid;

create table public.literary_work_versions (
 id uuid primary key default gen_random_uuid(), activity_id uuid not null references public.activities(id) on delete cascade,
 teacher_id uuid not null references public.teacher_profiles(id), version integer not null,
 title text not null, author text not null, edition text not null default '', source_text text not null default '',
 ai_draft jsonb not null, reviewed_analysis jsonb not null, analysis_source text not null,
 created_at timestamptz not null default now(), unique(activity_id,version)
);
create table public.deepening_sessions (
 id uuid primary key default gen_random_uuid(), activity_id uuid not null references public.activities(id) on delete cascade,
 work_version_id uuid not null references public.literary_work_versions(id), round integer not null,
 status text not null default 'DRAFT' check(status in ('DRAFT','OPEN','CLOSED')),
 visibility text not null default 'private' check(visibility in ('private','class','public')),
 published_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(activity_id,round), unique(id,activity_id)
);
alter table public.activities add constraint activity_deepening_session_fk foreign key(deepening_session_id) references public.deepening_sessions(id) on delete set null;
create table public.deepening_records (
 id uuid primary key default gen_random_uuid(), session_id uuid not null, activity_id uuid not null,
 participant_hash text not null, student_label text not null check(length(student_label) between 1 and 40),
 worksheet_id uuid references public.worksheets(id) on delete cascade,
 initial jsonb, initial_submitted_at timestamptz, questions jsonb, question_source text,
 answers jsonb not null default '{}', answers_submitted_at timestamptz, peer_viewed_at timestamptz,
 reflection jsonb, completed_at timestamptz, revision integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(session_id,activity_id) references public.deepening_sessions(id,activity_id) on delete cascade,
 unique(session_id,participant_hash)
);
create index deepening_records_activity on public.deepening_records(activity_id,session_id);
create index deepening_public_sessions on public.deepening_sessions(published_at desc) where visibility='public';
create table public.deepening_ai_jobs (
 key text primary key, state text not null check(state in ('pending','complete')), result jsonb,
 record_id uuid references public.deepening_records(id) on delete cascade,
 lease_until timestamptz, expires_at timestamptz, created_at timestamptz not null default now()
);
alter table public.literary_work_versions enable row level security;
alter table public.deepening_sessions enable row level security;
alter table public.deepening_records enable row level security;
alter table public.deepening_ai_jobs enable row level security;
create policy work_teacher_read on public.literary_work_versions for select to authenticated using(teacher_id=auth.uid());
create policy deepening_teacher_read on public.deepening_sessions for select to authenticated using(exists(select 1 from public.activities a where a.id=activity_id and a.teacher_id=auth.uid()));
create policy deepening_record_teacher_read on public.deepening_records for select to authenticated using(exists(select 1 from public.activities a where a.id=activity_id and a.teacher_id=auth.uid()));
revoke all on public.literary_work_versions,public.deepening_sessions,public.deepening_records,public.deepening_ai_jobs from public,anon,authenticated;
grant select on public.literary_work_versions,public.deepening_sessions,public.deepening_records to authenticated;
grant all on public.literary_work_versions,public.deepening_sessions,public.deepening_records,public.deepening_ai_jobs to service_role;
create view public.deepening_exhibit_index as
 select s.*,w.title,w.author from public.deepening_sessions s
 join public.activities a on a.id=s.activity_id and not a.deletion_pending
 join public.literary_work_versions w on w.id=s.work_version_id
 where s.visibility='public' and exists(select 1 from public.deepening_records r where r.session_id=s.id and r.completed_at is not null);
revoke all on public.deepening_exhibit_index from public,anon,authenticated;
grant select on public.deepening_exhibit_index to service_role;

create function public.sync_deepening_identity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.deepening_records set participant_hash=new.submission_code_hash,worksheet_id=new.id
 where activity_id=new.activity_id and participant_hash=case when tg_op='INSERT' then new.submission_code_hash else old.submission_code_hash end;
 return new;
end;$$;
create trigger worksheet_deepening_identity after insert or update of submission_code_hash on public.worksheets for each row execute function public.sync_deepening_identity();
revoke execute on function public.sync_deepening_identity() from public,anon,authenticated;

create function public.claim_deepening_ai(p_key text) returns boolean language plpgsql security definer set search_path='' as $$
declare claimed boolean;
begin
 insert into public.deepening_ai_jobs(key,state,lease_until) values(p_key,'pending',now()+interval '60 seconds')
 on conflict(key) do update set state='pending',result=null,lease_until=excluded.lease_until where (public.deepening_ai_jobs.state='pending' and public.deepening_ai_jobs.lease_until<now()) or (public.deepening_ai_jobs.state='complete' and public.deepening_ai_jobs.expires_at<now())
 returning true into claimed;
 return coalesce(claimed,false);
end;$$;

create function public.configure_deepening(p_teacher uuid,p_activity uuid,p_session uuid,p_input jsonb,p_analysis jsonb,p_draft jsonb,p_source text,p_new_round boolean,p_password text default null,p_tokens jsonb default '{}') returns public.deepening_sessions
language plpgsql security definer set search_path='' as $$
declare a public.activities; s public.deepening_sessions; v public.literary_work_versions; n integer;
begin
 if p_password is not null then
  if exists(select 1 from public.activities where id=p_activity) then
   select * into a from public.activities where id=p_activity for update;
   if a.teacher_id<>p_teacher or a.lesson_kind<>'deepening' then raise exception 'FORBIDDEN';end if;
  else
   a=public.create_lesson(p_teacher,p_activity,jsonb_build_object('title',p_input->>'title','author',p_input->>'author','course_name','이해 심화하기','class_name',coalesce(p_input->>'class_name',''),'introduction','문학을 통해 삶과 사회를 성찰합니다.','objectives','작품의 근거와 다른 관점을 검토합니다.','tasks',jsonb_build_array('최초 판단','심화 질문','다른 관점','최종 성찰'),'default_image_style','문학 일러스트레이션','expected_student_count',30,'tags','[]'::jsonb,'settings',jsonb_build_object('allow_resubmit',true,'require_approval',true,'enable_scene',true,'max_images',1)),p_tokens->>'worksheet',p_tokens->>'submission',p_password);
   update public.activities set lesson_kind='deepening' where id=p_activity returning * into a;
  end if;
 else
  select * into a from public.activities where id=p_activity for update;
 end if;
 if a.id is null or a.teacher_id is distinct from p_teacher or a.deletion_pending then raise exception 'FORBIDDEN';end if;
 -- The request UUID is also the session ID: retried creation never makes a second round.
 select * into s from public.deepening_sessions where id=p_session;
 if found then
  if s.activity_id<>p_activity then raise exception 'FORBIDDEN';end if;
  return s;
 end if;
 select * into s from public.deepening_sessions where id=a.deepening_session_id;
 if s.id is not null and not p_new_round then
  if s.status<>'DRAFT' or exists(select 1 from public.deepening_records where session_id=s.id) then raise exception 'STARTED_CREATE_NEW_ROUND';end if;
 end if;
 if s.id is not null and p_new_round and s.status='OPEN' then raise exception 'CLOSE_CURRENT_ROUND';end if;
 select coalesce(max(version),0)+1 into n from public.literary_work_versions where activity_id=p_activity;
 insert into public.literary_work_versions(activity_id,teacher_id,version,title,author,edition,source_text,ai_draft,reviewed_analysis,analysis_source)
 values(p_activity,p_teacher,n,p_input->>'title',p_input->>'author',coalesce(p_input->>'edition',''),coalesce(p_input->>'source_text',''),p_draft,p_analysis,p_source) returning * into v;
 if s.id is not null and not p_new_round then
  update public.deepening_sessions set work_version_id=v.id,updated_at=now() where id=s.id returning * into s;
 else
  select coalesce(max(round),0)+1 into n from public.deepening_sessions where activity_id=p_activity;
  insert into public.deepening_sessions(id,activity_id,work_version_id,round) values(p_session,p_activity,v.id,n) returning * into s;
 end if;
 update public.activities set deepening_session_id=s.id where id=p_activity;
 return s;
end;$$;

create function public.control_deepening(p_teacher uuid,p_activity uuid,p_session uuid,p_status text,p_visibility text,p_phase text) returns public.deepening_sessions
language plpgsql security definer set search_path='' as $$
declare a public.activities;s public.deepening_sessions;
begin
 select * into a from public.activities where id=p_activity for update;
 if a.teacher_id is distinct from p_teacher or a.deletion_pending then raise exception 'FORBIDDEN';end if;
 select * into s from public.deepening_sessions where id=p_session and activity_id=p_activity for update;
 if s.id is null then raise exception 'FORBIDDEN';end if;
 if p_status not in ('DRAFT','OPEN','CLOSED') or p_visibility not in ('private','class','public') or p_phase not in ('understanding','deepening') then raise exception 'INVALID_STATE';end if;
 if p_status='DRAFT' and s.status<>'DRAFT' then raise exception 'PRESERVE_STARTED_ROUND';end if;
 if p_status='OPEN' and exists(select 1 from public.deepening_sessions where activity_id=p_activity and id<>s.id and status='OPEN') then raise exception 'CLOSE_CURRENT_ROUND';end if;
 if p_visibility='public' and not exists(select 1 from public.deepening_records where session_id=s.id and completed_at is not null) then raise exception 'NO_COMPLETED_REFLECTION';end if;
 update public.deepening_sessions set status=p_status,visibility=p_visibility,published_at=case when p_visibility='public' then coalesce(published_at,now()) else null end,updated_at=now() where id=s.id returning * into s;
 update public.activities set active_phase=p_phase,deepening_session_id=s.id,
 stage=case when lesson_kind='deepening' and stage='DRAFT' and p_status='OPEN' then 'ANALYSIS' else stage end where id=p_activity;
 return s;
end;$$;

create function public.write_deepening_record(p_session uuid,p_hash text,p_label text,p_operation text,p_data jsonb,p_revision integer) returns public.deepening_records
language plpgsql security definer set search_path='' as $$
declare s public.deepening_sessions;r public.deepening_records; w uuid;
begin
 if exists(select 1 from public.revoked_student_codes where code_hash=p_hash) then raise exception 'FORBIDDEN';end if;
 select * into s from public.deepening_sessions where id=p_session for share;
 if s.id is null or s.status<>'OPEN' or not exists(select 1 from public.activities where id=s.activity_id and not deletion_pending) then raise exception 'STAGE_CLOSED';end if;
 if p_operation='join' then
  select id into w from public.worksheets where activity_id=s.activity_id and submission_code_hash=p_hash and not deletion_pending;
  insert into public.deepening_records(session_id,activity_id,participant_hash,student_label,worksheet_id) values(s.id,s.activity_id,p_hash,p_label,w)
  on conflict(session_id,participant_hash) do nothing;
 end if;
 select * into r from public.deepening_records where session_id=s.id and participant_hash=p_hash for update;
 if r.id is null then raise exception 'FORBIDDEN';end if;
 if p_operation='join' then return r;end if;
 if r.revision<>p_revision then raise exception 'REVISION_CONFLICT';end if;
 if r.completed_at is not null then raise exception 'COMPLETED_READ_ONLY';end if;
 if p_operation='initial' then
  if r.initial is not null and r.initial<>p_data->'initial' then raise exception 'INITIAL_IMMUTABLE';end if;
  if coalesce(length(p_data->'initial'->>'reason'),0)<5 or coalesce(length(p_data->'initial'->>'evidence'),0)<5 then raise exception 'INCOMPLETE_INITIAL';end if;
  update public.deepening_records set initial=p_data->'initial',initial_submitted_at=coalesce(initial_submitted_at,now()) where id=r.id;
 elsif p_operation='questions' then
  if r.initial is null then raise exception 'INITIAL_REQUIRED';end if;
  if r.questions is not null then return r;end if;
  if not (p_data->'questions' ?& array['context','values','life']) then raise exception 'THREE_QUESTIONS_REQUIRED';end if;
  update public.deepening_records set questions=p_data->'questions',question_source=p_data->>'question_source' where id=r.id;
 elsif p_operation='answer' then
  if r.questions is null then raise exception 'QUESTIONS_REQUIRED';end if;
  update public.deepening_records set answers=p_data->'answers',answers_submitted_at=null,peer_viewed_at=null where id=r.id;
 elsif p_operation='submit-answers' then
  if r.questions is null or coalesce(length(btrim(r.answers->>'context')),0)<5 or coalesce(length(btrim(r.answers->>'values')),0)<5 or coalesce(length(btrim(r.answers->>'life')),0)<5 then raise exception 'THREE_ANSWERS_REQUIRED';end if;
  update public.deepening_records set answers_submitted_at=now() where id=r.id;
 elsif p_operation='viewed' then
  if r.answers_submitted_at is null or s.visibility='private' then raise exception 'PEERS_NOT_OPEN';end if;
  update public.deepening_records set peer_viewed_at=now() where id=r.id;
 elsif p_operation='reflection' then
  if r.peer_viewed_at is null or p_data->'reflection'->>'stance' not in ('same','changed','expanded') or coalesce(length(p_data->'reflection'->>'answer'),0)<10 then raise exception 'REFLECTION_REQUIRED';end if;
  update public.deepening_records set reflection=p_data->'reflection',completed_at=now() where id=r.id;
 else raise exception 'INVALID_OPERATION';end if;
 update public.deepening_records set revision=revision+1,updated_at=now() where id=r.id returning * into r;
 return r;
end;$$;

revoke execute on function public.claim_deepening_ai(text),public.configure_deepening(uuid,uuid,uuid,jsonb,jsonb,jsonb,text,boolean,text,jsonb),public.control_deepening(uuid,uuid,uuid,text,text,text),public.write_deepening_record(uuid,text,text,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.claim_deepening_ai(text),public.configure_deepening(uuid,uuid,uuid,jsonb,jsonb,jsonb,text,boolean,text,jsonb),public.control_deepening(uuid,uuid,uuid,text,text,text),public.write_deepening_record(uuid,text,text,text,jsonb,integer) to service_role;
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.deepening_sessions,public.deepening_records;
 end if;
end;$$;
commit;
