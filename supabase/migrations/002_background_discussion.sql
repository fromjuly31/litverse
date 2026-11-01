begin;
alter table public.activities add column temporal_background text not null default '';
alter table public.activities add column spatial_background text not null default '';
create table public.background_questions (
 id uuid primary key default gen_random_uuid(),activity_id uuid not null references public.activities(id) on delete cascade,
 kind text not null check(kind in ('temporal','spatial')),prompt text not null check(length(prompt) between 5 and 1500),
 status text not null default 'OPEN' check(status in ('OPEN','CLOSED')),summary text not null default '' check(length(summary)<=5000),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.background_responses (
 id uuid primary key default gen_random_uuid(),activity_id uuid not null references public.activities(id) on delete cascade,
 question_id uuid not null references public.background_questions(id) on delete cascade,
 respondent_hash text not null,student_label text not null check(length(student_label) between 1 and 40),
 answer text not null check(length(answer) between 5 and 3000),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(question_id,respondent_hash)
);
create index background_question_activity_idx on public.background_questions(activity_id,created_at);
create index background_response_activity_idx on public.background_responses(activity_id,question_id);
create trigger touch_background_question before update on public.background_questions for each row execute function public.touch_updated_at();
create trigger touch_background_response before update on public.background_responses for each row execute function public.touch_updated_at();
alter table public.background_questions enable row level security;
alter table public.background_responses enable row level security;
create policy teacher_background_questions on public.background_questions for select to authenticated using(exists(select 1 from public.activities a where a.id=activity_id and a.teacher_id=(select auth.uid())));
create policy teacher_background_responses on public.background_responses for select to authenticated using(exists(select 1 from public.activities a where a.id=activity_id and a.teacher_id=(select auth.uid())));
revoke all on public.background_questions,public.background_responses from anon,authenticated;
grant select on public.background_questions,public.background_responses to authenticated;
grant all on public.background_questions,public.background_responses to service_role;

create function public.save_background_response(p_activity uuid,p_question uuid,p_hash text,p_label text,p_answer text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.activities; q public.background_questions;
begin
 select * into a from public.activities where id=p_activity for share;
 select * into q from public.background_questions where id=p_question and activity_id=p_activity for share;
 if a.id is null or a.deletion_pending or a.stage<>'BACKGROUND' or q.id is null or q.status<>'OPEN' then raise exception 'BACKGROUND_CLOSED';end if;
 if exists(select 1 from public.revoked_student_codes where code_hash=p_hash) then raise exception 'FORBIDDEN';end if;
 insert into public.background_responses(activity_id,question_id,respondent_hash,student_label,answer) values(p_activity,p_question,p_hash,p_label,p_answer)
 on conflict(question_id,respondent_hash) do update set student_label=excluded.student_label,answer=excluded.answer;
end;$$;
create function public.publish_background_summary(p_teacher uuid,p_activity uuid,p_question uuid,p_summary text,p_status text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.activities where id=p_activity and teacher_id=p_teacher and not deletion_pending for update;
 if not found then raise exception 'FORBIDDEN';end if;
 update public.background_questions set summary=p_summary,status=p_status where id=p_question and activity_id=p_activity;
 if not found then raise exception 'FORBIDDEN';end if;
 update public.activities set
 temporal_background=coalesce((select string_agg(summary,E'\n\n' order by created_at) from public.background_questions where activity_id=p_activity and kind='temporal' and summary<>''),''),
 spatial_background=coalesce((select string_agg(summary,E'\n\n' order by created_at) from public.background_questions where activity_id=p_activity and kind='spatial' and summary<>''),'')
 where id=p_activity;
end;$$;
create function public.rotate_student_code(p_teacher uuid,p_activity uuid,p_worksheet uuid,p_new_hash text) returns void
language plpgsql security definer set search_path='' as $$
declare w public.worksheets;
begin
 perform 1 from public.activities where id=p_activity and teacher_id=p_teacher and not deletion_pending for share;
 if not found then raise exception 'FORBIDDEN';end if;
 select * into w from public.worksheets where id=p_worksheet and activity_id=p_activity and not deletion_pending for update;
 if not found then raise exception 'FORBIDDEN';end if;
 insert into public.revoked_student_codes(code_hash,activity_id) values(w.submission_code_hash,p_activity);
 update public.worksheets set submission_code_hash=p_new_hash where id=p_worksheet;
 update public.background_responses set respondent_hash=p_new_hash where activity_id=p_activity and respondent_hash=w.submission_code_hash;
end;$$;
revoke execute on function public.save_background_response(uuid,uuid,text,text,text),public.publish_background_summary(uuid,uuid,uuid,text,text),public.rotate_student_code(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.save_background_response(uuid,uuid,text,text,text),public.publish_background_summary(uuid,uuid,uuid,text,text),public.rotate_student_code(uuid,uuid,uuid,text) to service_role;
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.background_questions,public.background_responses;
 end if;
end;$$;
commit;
