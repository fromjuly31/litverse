-- Run once in the Supabase SQL editor as the project administrator.
begin;
create table public.teacher_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teacher_profiles(id),
  title text not null check(length(title) between 1 and 120),
  author text not null check(length(author) between 1 and 80),
  course_name text not null default '', class_name text not null default '',
  introduction text not null, objectives text not null default '', standards text not null default '',
  tasks jsonb not null default '[]', prompt_template text not null default '', background text not null default '',
  default_image_style text not null default '문학 일러스트레이션',
  expected_student_count integer check(expected_student_count between 1 and 1000),
  worksheet_token_hash text not null unique, submission_token_hash text not null unique,
  qr_version integer not null default 1,
  stage text not null default 'DRAFT' check(stage in ('DRAFT','BACKGROUND','ANALYSIS','SUBMISSION','CLOSED')),
  settings jsonb not null default '{"allow_resubmit":true,"require_approval":true,"enable_scene":true,"max_images":1}',
  deletion_pending boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.worksheets (
  id uuid primary key default gen_random_uuid(), activity_id uuid not null references public.activities(id) on delete cascade,
  student_label text not null check(length(student_label) between 1 and 40),
  character_name text not null, character_selection_reason text not null,
  personality_description text not null, personality_tags text[] not null,
  textual_evidence text not null, evidence_quote text not null default '', evidence_explanation text not null,
  canonical_appearance text not null default '', imagined_appearance text not null, visual_description text not null default '',
  background text not null default '', image_style text not null default '', scene jsonb not null default '{}',
  generated_prompt text not null, scene_prompt text not null default '',
  submission_code_hash text not null unique,
  deletion_pending boolean not null default false,
  completed_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.image_submissions (
  id uuid primary key default gen_random_uuid(), activity_id uuid not null references public.activities(id) on delete cascade,
  worksheet_id uuid not null references public.worksheets(id) on delete cascade,
  image_type text not null check(image_type in ('character','scene')), slot integer not null default 0 check(slot=0),
  image_path text not null unique, hashtags text[] not null, one_line_description text not null check(length(one_line_description) between 1 and 150),
  approval_status text not null default 'pending' check(approval_status in ('pending','approved','hidden')),
  submission_status text not null default 'complete' check(submission_status in ('complete','deleting')),
  revision uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique(worksheet_id,image_type,slot)
);
create table public.tag_catalog (
  id uuid primary key default gen_random_uuid(), activity_id uuid not null references public.activities(id) on delete cascade,
  tag_name text not null check(length(tag_name) between 1 and 20), created_at timestamptz not null default now(), unique(activity_id,tag_name)
);
create table public.tag_aliases (
  id uuid primary key default gen_random_uuid(), activity_id uuid not null references public.activities(id) on delete cascade,
  original_tag text not null, canonical_tag text not null, unique(activity_id,original_tag), check(original_tag<>canonical_tag)
);
create table public.upload_jobs (
  id uuid primary key, activity_id uuid not null references public.activities(id) on delete cascade,
  worksheet_id uuid not null references public.worksheets(id) on delete cascade,
  image_type text not null, slot integer not null,
  image_path text not null unique, expected_revision uuid,
  mime text not null, size integer not null check(size between 1 and 5242880),
  hashtags text[] not null, one_line_description text not null,
  status text not null default 'pending' check(status in ('pending','complete','expired')),
  image_id uuid, created_at timestamptz not null default now(), expires_at timestamptz not null default (now()+interval '2 hours 15 minutes')
);
create table public.deletion_jobs (
  id uuid primary key default gen_random_uuid(), teacher_id uuid not null references public.teacher_profiles(id),
  activity_id uuid, target_type text not null check(target_type in ('images','worksheet','activity','orphan')),
  target_id uuid, image_ids uuid[] not null default '{}', image_paths text[] not null default '{}',
  status text not null default 'pending' check(status in ('pending','running','failed','completed')),
  error_message text, not_before timestamptz not null default now(), lease_until timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.rate_limits (key text primary key, hits integer not null, expires_at timestamptz not null);
create table public.revoked_student_codes (code_hash text primary key,activity_id uuid not null references public.activities(id) on delete cascade,created_at timestamptz not null default now());
alter table public.revoked_student_codes enable row level security;
revoke all on public.revoked_student_codes from anon,authenticated;
grant all on public.revoked_student_codes to service_role;
create index activities_teacher_idx on public.activities(teacher_id,created_at desc);
create index worksheets_activity_idx on public.worksheets(activity_id);
create index images_activity_idx on public.image_submissions(activity_id,approval_status,created_at desc);
create index uploads_expiry_idx on public.upload_jobs(expires_at) where status='pending';
create index deletion_pending_idx on public.deletion_jobs(status,not_before);
create index rate_expiry_idx on public.rate_limits(expires_at);

create function public.touch_updated_at() returns trigger language plpgsql set search_path='' as $$begin new.updated_at=now();return new;end;$$;
create trigger touch_activity before update on public.activities for each row execute function public.touch_updated_at();
create trigger touch_worksheet before update on public.worksheets for each row execute function public.touch_updated_at();
create trigger touch_image before update on public.image_submissions for each row execute function public.touch_updated_at();

-- All client-side writes are forbidden. Only server functions use service_role.
alter table public.teacher_profiles enable row level security;
alter table public.activities enable row level security;
alter table public.worksheets enable row level security;
alter table public.image_submissions enable row level security;
alter table public.tag_catalog enable row level security;
alter table public.tag_aliases enable row level security;
alter table public.upload_jobs enable row level security;
alter table public.deletion_jobs enable row level security;
alter table public.rate_limits enable row level security;
create policy teacher_self on public.teacher_profiles for select to authenticated using(id=(select auth.uid()));
create policy teacher_activities on public.activities for select to authenticated using(teacher_id=(select auth.uid()));
create policy teacher_worksheets on public.worksheets for select to authenticated using(exists(select 1 from public.activities a where a.id=activity_id and a.teacher_id=(select auth.uid())));
create policy teacher_images on public.image_submissions for select to authenticated using(exists(select 1 from public.activities a where a.id=activity_id and a.teacher_id=(select auth.uid())));
create policy teacher_tags on public.tag_catalog for select to authenticated using(exists(select 1 from public.activities a where a.id=activity_id and a.teacher_id=(select auth.uid())));
create policy teacher_aliases on public.tag_aliases for select to authenticated using(exists(select 1 from public.activities a where a.id=activity_id and a.teacher_id=(select auth.uid())));
create policy teacher_deletion_jobs on public.deletion_jobs for select to authenticated using(teacher_id=(select auth.uid()));
revoke all on public.teacher_profiles,public.activities,public.worksheets,public.image_submissions,public.tag_catalog,public.tag_aliases,public.upload_jobs,public.deletion_jobs,public.rate_limits from anon,authenticated;
grant select on public.teacher_profiles,public.activities,public.worksheets,public.image_submissions,public.tag_catalog,public.tag_aliases,public.deletion_jobs to authenticated;
grant all on public.teacher_profiles,public.activities,public.worksheets,public.image_submissions,public.tag_catalog,public.tag_aliases,public.upload_jobs,public.deletion_jobs,public.rate_limits to service_role;

create function public.consume_rate_limit(p_key text,p_limit integer,p_window integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 insert into public.rate_limits(key,hits,expires_at) values(p_key,1,now()+make_interval(secs=>p_window))
 on conflict(key) do update set hits=case when public.rate_limits.expires_at<=now() then 1 else public.rate_limits.hits+1 end,
 expires_at=case when public.rate_limits.expires_at<=now() then now()+make_interval(secs=>p_window) else public.rate_limits.expires_at end returning hits into n;
 return n<=p_limit;
end;$$;

create function public.save_activity(p_teacher uuid,p_id uuid,p_data jsonb,p_worksheet_hash text,p_submission_hash text) returns public.activities
language plpgsql security definer set search_path='' as $$
declare a public.activities; t text;
begin
 select * into a from public.activities where id=p_id for update;
 if found and (a.teacher_id<>p_teacher or a.deletion_pending) then raise exception 'FORBIDDEN';end if;
 insert into public.activities(id,teacher_id,title,author,course_name,class_name,introduction,objectives,standards,tasks,prompt_template,background,default_image_style,expected_student_count,settings,worksheet_token_hash,submission_token_hash)
 values(p_id,p_teacher,p_data->>'title',p_data->>'author',coalesce(p_data->>'course_name',''),coalesce(p_data->>'class_name',''),p_data->>'introduction',coalesce(p_data->>'objectives',''),coalesce(p_data->>'standards',''),p_data->'tasks',coalesce(p_data->>'prompt_template',''),coalesce(p_data->>'background',''),p_data->>'default_image_style',(p_data->>'expected_student_count')::integer,p_data->'settings',p_worksheet_hash,p_submission_hash)
 on conflict(id) do update set title=excluded.title,author=excluded.author,course_name=excluded.course_name,class_name=excluded.class_name,introduction=excluded.introduction,objectives=excluded.objectives,standards=excluded.standards,tasks=excluded.tasks,prompt_template=excluded.prompt_template,background=excluded.background,default_image_style=excluded.default_image_style,expected_student_count=excluded.expected_student_count,settings=excluded.settings returning * into a;
 delete from public.tag_catalog where activity_id=p_id;
 for t in select jsonb_array_elements_text(p_data->'tags') loop insert into public.tag_catalog(activity_id,tag_name) values(p_id,t) on conflict do nothing;end loop;
 return a;
end;$$;

create function public.save_worksheet(p_activity uuid,p_hash text,p_data jsonb) returns public.worksheets
language plpgsql security definer set search_path='' as $$
declare a public.activities; w public.worksheets;
begin
 if exists(select 1 from public.revoked_student_codes where code_hash=p_hash) then raise exception 'FORBIDDEN';end if;
 if coalesce(length(p_data->'scene'->>'name'),0)<10 or coalesce(length(p_data->'scene'->>'reason'),0)<10 or coalesce(length(p_data->'scene'->>'development'),0)<10 or coalesce(length(p_data->'scene'->>'behavior'),0)<10 or coalesce(length(p_data->'scene'->>'visual'),0)<10 then raise exception 'SCENE_REQUIRED';end if;
 select * into a from public.activities where id=p_activity for share;
 if not found or a.deletion_pending or a.stage not in ('ANALYSIS','SUBMISSION') then raise exception 'STAGE_CLOSED';end if;
 select * into w from public.worksheets where submission_code_hash=p_hash for update;
 if found and (w.activity_id<>p_activity or w.deletion_pending) then raise exception 'FORBIDDEN';end if;
 insert into public.worksheets(activity_id,submission_code_hash,student_label,character_name,character_selection_reason,personality_description,personality_tags,textual_evidence,evidence_quote,evidence_explanation,canonical_appearance,imagined_appearance,visual_description,background,image_style,scene,generated_prompt,scene_prompt)
 values(p_activity,p_hash,p_data->>'student_label',p_data->>'character_name',p_data->>'character_selection_reason',p_data->>'personality_description',array(select jsonb_array_elements_text(p_data->'personality_tags')),p_data->>'textual_evidence',coalesce(p_data->>'evidence_quote',''),p_data->>'evidence_explanation',coalesce(p_data->>'canonical_appearance',''),p_data->>'imagined_appearance',coalesce(p_data->>'visual_description',''),coalesce(p_data->>'background',''),coalesce(p_data->>'image_style',''),coalesce(p_data->'scene','{}'),p_data->>'generated_prompt',coalesce(p_data->>'scene_prompt',''))
 on conflict(submission_code_hash) do update set student_label=excluded.student_label,character_name=excluded.character_name,character_selection_reason=excluded.character_selection_reason,personality_description=excluded.personality_description,personality_tags=excluded.personality_tags,textual_evidence=excluded.textual_evidence,evidence_quote=excluded.evidence_quote,evidence_explanation=excluded.evidence_explanation,canonical_appearance=excluded.canonical_appearance,imagined_appearance=excluded.imagined_appearance,visual_description=excluded.visual_description,background=excluded.background,image_style=excluded.image_style,scene=excluded.scene,generated_prompt=excluded.generated_prompt,scene_prompt=excluded.scene_prompt,completed_at=now()
 where public.worksheets.activity_id=p_activity and not public.worksheets.deletion_pending returning * into w;
 if w.id is null then raise exception 'FORBIDDEN';end if;
 return w;
end;$$;

create function public.reserve_upload(p_activity uuid,p_worksheet uuid,p_id uuid,p_data jsonb) returns public.upload_jobs
language plpgsql security definer set search_path='' as $$
declare a public.activities; w public.worksheets; j public.upload_jobs; revision_id uuid; ext text;
begin
 select * into a from public.activities where id=p_activity for share;
 select * into w from public.worksheets where id=p_worksheet and activity_id=p_activity for update;
 if a.id is null or w.id is null or a.deletion_pending or w.deletion_pending or a.stage<>'SUBMISSION' then raise exception 'STAGE_CLOSED';end if;
 if (p_data->>'slot')::integer<>0 then raise exception 'INVALID_SLOT';end if;
 if p_data->>'image_type'='scene' and not (a.settings->>'enable_scene')::boolean then raise exception 'SCENE_DISABLED';end if;
 select * into j from public.upload_jobs where id=p_id;
 if found then
  if j.worksheet_id<>p_worksheet then raise exception 'FORBIDDEN';end if;
  if j.status='expired' or (j.status='pending' and j.expires_at<=now()) then raise exception 'UPLOAD_EXPIRED';end if;
  return j;
 end if;
 select revision into revision_id from public.image_submissions where worksheet_id=p_worksheet and image_type=p_data->>'image_type' and slot=(p_data->>'slot')::integer;
 if found and not (a.settings->>'allow_resubmit')::boolean then raise exception 'RESUBMIT_DISABLED';end if;
 ext=case p_data->>'mime' when 'image/png' then '.png' when 'image/jpeg' then '.jpg' else '.webp' end;
 insert into public.upload_jobs(id,activity_id,worksheet_id,image_type,slot,image_path,expected_revision,mime,size,hashtags,one_line_description)
 values(p_id,p_activity,p_worksheet,p_data->>'image_type',(p_data->>'slot')::integer,p_activity::text||'/'||p_worksheet::text||'/'||p_id::text||ext,revision_id,p_data->>'mime',(p_data->>'size')::integer,array(select jsonb_array_elements_text(p_data->'hashtags')),p_data->>'one_line_description') returning * into j;
 return j;
end;$$;

create function public.finalize_upload(p_activity uuid,p_worksheet uuid,p_job uuid) returns public.image_submissions
language plpgsql security definer set search_path='' as $$
declare a public.activities; w public.worksheets; j public.upload_jobs; old_image public.image_submissions; result public.image_submissions;
begin
 select * into a from public.activities where id=p_activity for share;
 select * into w from public.worksheets where id=p_worksheet and activity_id=p_activity for update;
 select * into j from public.upload_jobs where id=p_job and worksheet_id=p_worksheet for update;
 if a.id is null or w.id is null or j.id is null or a.deletion_pending or w.deletion_pending then raise exception 'FORBIDDEN';end if;
 if j.status='complete' then
  select * into result from public.image_submissions where id=j.image_id and image_path=j.image_path;
  if not found then raise exception 'UPLOAD_SUPERSEDED';end if;
  return result;
 end if;
 if a.stage<>'SUBMISSION' then raise exception 'STAGE_CLOSED';end if;
 if j.status<>'pending' or j.expires_at<=now() then raise exception 'UPLOAD_EXPIRED';end if;
 if j.slot>=(a.settings->>'max_images')::integer or (j.image_type='scene' and not (a.settings->>'enable_scene')::boolean) then raise exception 'INVALID_SLOT';end if;
 select * into old_image from public.image_submissions where worksheet_id=p_worksheet and image_type=j.image_type and slot=j.slot for update;
 if old_image.revision is distinct from j.expected_revision then raise exception 'UPLOAD_CONFLICT';end if;
 if old_image.id is not null and (old_image.submission_status='deleting' or not (a.settings->>'allow_resubmit')::boolean) then raise exception 'RESUBMIT_DISABLED';end if;
 insert into public.image_submissions(activity_id,worksheet_id,image_type,slot,image_path,hashtags,one_line_description,approval_status)
 values(p_activity,p_worksheet,j.image_type,j.slot,j.image_path,j.hashtags,j.one_line_description,case when (a.settings->>'require_approval')::boolean then 'pending' else 'approved' end)
 on conflict(worksheet_id,image_type,slot) do update set image_path=excluded.image_path,hashtags=excluded.hashtags,one_line_description=excluded.one_line_description,approval_status=excluded.approval_status,revision=gen_random_uuid(),created_at=now() returning * into result;
 update public.upload_jobs set status='complete',image_id=result.id where id=p_job;
 if old_image.id is not null then
  insert into public.deletion_jobs(teacher_id,activity_id,target_type,image_paths) values(a.teacher_id,p_activity,'orphan',array[old_image.image_path]);
  insert into public.deletion_jobs(teacher_id,activity_id,target_type,image_paths,not_before) values(a.teacher_id,p_activity,'orphan',array[old_image.image_path],now()+interval '3 hours');
 end if;
 return result;
end;$$;

create function public.replace_aliases(p_teacher uuid,p_activity uuid,p_aliases jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare item record;
begin
 perform 1 from public.activities where id=p_activity and teacher_id=p_teacher and not deletion_pending for update;
 if not found then raise exception 'FORBIDDEN';end if;
 delete from public.tag_aliases where activity_id=p_activity;
 for item in select * from jsonb_each_text(p_aliases) loop insert into public.tag_aliases(activity_id,original_tag,canonical_tag) values(p_activity,item.key,item.value);end loop;
end;$$;

create function public.queue_deletion(p_teacher uuid,p_activity uuid,p_type text,p_ids uuid[],p_target uuid default null) returns public.deletion_jobs
language plpgsql security definer set search_path='' as $$
declare a public.activities; j public.deletion_jobs; paths text[]; ids uuid[];
begin
 select * into a from public.activities where id=p_activity and teacher_id=p_teacher for update;
 if not found then raise exception 'FORBIDDEN';end if;
 if p_type='activity' then
  update public.activities set deletion_pending=true where id=p_activity;
  update public.worksheets set deletion_pending=true where activity_id=p_activity;
 elsif p_type='worksheet' then
  update public.worksheets set deletion_pending=true where id=p_target and activity_id=p_activity;
  if not found then raise exception 'FORBIDDEN';end if;
 elsif p_type<>'images' then raise exception 'INVALID_TYPE';end if;
 select coalesce(array_agg(id),'{}'),coalesce(array_agg(image_path),'{}') into ids,paths from public.image_submissions where activity_id=p_activity and (p_type='activity' or (p_type='worksheet' and worksheet_id=p_target) or (p_type='images' and id=any(p_ids)));
 if p_type='images' and cardinality(ids)<>cardinality(p_ids) then raise exception 'FORBIDDEN';end if;
 if p_type in ('activity','worksheet') then
  paths=paths||array(select image_path from public.upload_jobs where activity_id=p_activity and (p_type='activity' or worksheet_id=p_target));
 end if;
 update public.image_submissions set submission_status='deleting',deleted_at=now() where id=any(ids);
 insert into public.deletion_jobs(teacher_id,activity_id,target_type,target_id,image_ids,image_paths) values(p_teacher,p_activity,p_type,p_target,ids,paths) returning * into j;
 -- Signed upload tokens remain valid for up to two hours, including after immediate deletion.
 if cardinality(paths)>0 then insert into public.deletion_jobs(teacher_id,activity_id,target_type,image_paths,not_before) values(p_teacher,p_activity,'orphan',paths,now()+interval '3 hours');end if;
 return j;
end;$$;

create function public.claim_deletion(p_id uuid) returns public.deletion_jobs
language plpgsql security definer set search_path='' as $$
declare j public.deletion_jobs;
begin
 update public.deletion_jobs set status='running',lease_until=now()+interval '2 minutes',updated_at=now() where id=p_id and not_before<=now() and (status in ('pending','failed') or (status='running' and lease_until<now())) returning * into j;
 return j;
end;$$;
create function public.finish_deletion(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare j public.deletion_jobs;
begin
 select * into j from public.deletion_jobs where id=p_id and status='running' for update;
 if not found then raise exception 'JOB_NOT_CLAIMED';end if;
 if j.target_type='activity' then delete from public.activities where id=j.activity_id and teacher_id=j.teacher_id;
 elsif j.target_type='worksheet' then delete from public.worksheets where id=j.target_id and activity_id=j.activity_id;
 elsif j.target_type='images' then delete from public.image_submissions where id=any(j.image_ids) and activity_id=j.activity_id and submission_status='deleting';end if;
 update public.deletion_jobs set status='completed',lease_until=null,error_message=null,updated_at=now() where id=p_id;
end;$$;

create function public.expire_uploads(p_teacher uuid default null) returns integer
language plpgsql security definer set search_path='' as $$
declare j record; n integer=0;
begin
 for j in select u.*,a.teacher_id from public.upload_jobs u join public.activities a on a.id=u.activity_id where u.status='pending' and u.expires_at<now() and (p_teacher is null or a.teacher_id=p_teacher) for update of u skip locked limit 200 loop
  insert into public.deletion_jobs(teacher_id,activity_id,target_type,image_paths) values(j.teacher_id,j.activity_id,'orphan',array[j.image_path]);
  update public.upload_jobs set status='expired' where id=j.id;n=n+1;
 end loop;
 delete from public.rate_limits where expires_at<now()-interval '1 day';
 delete from public.deletion_jobs where status='completed' and updated_at<now()-interval '30 days';
 return n;
end;$$;

-- Never expose security-definer RPCs to browser roles.
revoke execute on function public.consume_rate_limit(text,integer,integer),public.save_activity(uuid,uuid,jsonb,text,text),public.save_worksheet(uuid,text,jsonb),public.reserve_upload(uuid,uuid,uuid,jsonb),public.finalize_upload(uuid,uuid,uuid),public.replace_aliases(uuid,uuid,jsonb),public.queue_deletion(uuid,uuid,text,uuid[],uuid),public.claim_deletion(uuid),public.finish_deletion(uuid),public.expire_uploads(uuid) from public,anon,authenticated;
grant execute on function public.consume_rate_limit(text,integer,integer),public.save_activity(uuid,uuid,jsonb,text,text),public.save_worksheet(uuid,text,jsonb),public.reserve_upload(uuid,uuid,uuid,jsonb),public.finalize_upload(uuid,uuid,uuid),public.replace_aliases(uuid,uuid,jsonb),public.queue_deletion(uuid,uuid,text,uuid[],uuid),public.claim_deletion(uuid),public.finish_deletion(uuid),public.expire_uploads(uuid) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('literature-images','literature-images',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
-- No anon/authenticated Storage policies. Access only through server-issued signed URLs.
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.activities,public.worksheets,public.image_submissions;
 end if;
end;$$;
commit;
