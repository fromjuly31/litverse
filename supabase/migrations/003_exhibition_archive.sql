begin;
alter table public.teacher_profiles add column is_admin boolean not null default false;
alter table public.activities add column synopsis text not null default '' check(length(synopsis)<=1800);
alter table public.activities add column final_selection jsonb not null default '{}';
alter table public.activities add column final_result jsonb;
alter table public.activities add column finalized_at timestamptz;
alter table public.activities add column signature text not null default '';
create table public.lesson_access (
  activity_id uuid primary key references public.activities(id) on delete cascade,
  password_hash text not null check(length(password_hash)>=80),
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.lesson_access enable row level security;
revoke all on public.lesson_access from public,anon,authenticated;
grant all on public.lesson_access to service_role;
create index completed_exhibitions_idx on public.activities(finalized_at desc) where finalized_at is not null and not deletion_pending;

create function public.save_lesson(p_teacher uuid,p_id uuid,p_data jsonb,p_worksheet_hash text,p_submission_hash text) returns public.activities
language plpgsql security definer set search_path='' as $$
declare a public.activities;
begin
 select * into a from public.activities where id=p_id for update;
 if found and (a.teacher_id is distinct from p_teacher or a.deletion_pending or a.finalized_at is not null) then raise exception 'FORBIDDEN';end if;
 a=public.save_activity(p_teacher,p_id,p_data,p_worksheet_hash,p_submission_hash);
 update public.activities set synopsis=coalesce(p_data->>'synopsis','') where id=p_id returning * into a;
 return a;
end;$$;
create function public.create_lesson(p_teacher uuid,p_id uuid,p_data jsonb,p_worksheet_hash text,p_submission_hash text,p_password_hash text) returns public.activities
language plpgsql security definer set search_path='' as $$
declare a public.activities;
begin
 if exists(select 1 from public.activities where id=p_id) then raise exception 'FORBIDDEN';end if;
 a=public.save_lesson(p_teacher,p_id,p_data,p_worksheet_hash,p_submission_hash);
 insert into public.lesson_access(activity_id,password_hash) values(p_id,p_password_hash);
 return a;
end;$$;
create function public.reset_lesson_password(p_activity uuid,p_hash text) returns void
language plpgsql security definer set search_path='' as $$begin
 insert into public.lesson_access(activity_id,password_hash) values(p_activity,p_hash)
 on conflict(activity_id) do update set password_hash=excluded.password_hash,version=public.lesson_access.version+1,updated_at=now();
end;$$;
create function public.select_final_image(p_teacher uuid,p_activity uuid,p_image uuid,p_type text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.activities; result jsonb;
begin
 select * into a from public.activities where id=p_activity for update;
 if a.id is null or a.teacher_id is distinct from p_teacher or a.deletion_pending or a.finalized_at is not null then raise exception 'FORBIDDEN';end if;
 if p_type not in ('character','scene') or not exists(select 1 from public.image_submissions where id=p_image and activity_id=p_activity and image_type=p_type and submission_status='complete') then raise exception 'FORBIDDEN';end if;
 update public.activities set final_selection=jsonb_set(final_selection,array[p_type],to_jsonb(p_image::text)) where id=p_activity returning final_selection into result;
 return result;
end;$$;

-- Preserve the existing cleanup implementation, while preventing a late delete
-- request from removing the selected images after finalization commits.
alter function public.queue_deletion(uuid,uuid,text,uuid[],uuid) rename to queue_deletion_unchecked;
create function public.queue_deletion(p_teacher uuid,p_activity uuid,p_type text,p_ids uuid[],p_target uuid default null) returns public.deletion_jobs
language plpgsql security definer set search_path='' as $$
declare a public.activities;
begin
 select * into a from public.activities where id=p_activity for update;
 if a.finalized_at is not null and p_type<>'activity' then raise exception 'STAGE_CLOSED';end if;
 return public.queue_deletion_unchecked(p_teacher,p_activity,p_type,p_ids,p_target);
end;$$;

create function public.finalize_lesson(p_teacher uuid,p_activity uuid,p_result jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.activities; portrait uuid; scene uuid; losers uuid[]; paths text[]; j public.deletion_jobs; jobs jsonb='[]'; k text;
begin
 select * into a from public.activities where id=p_activity for update;
 if a.id is null or a.teacher_id is distinct from p_teacher or a.deletion_pending then raise exception 'FORBIDDEN';end if;
 if a.finalized_at is not null then
   if a.final_result=p_result then return jsonb_build_object('id',a.id,'removed',0,'jobs','[]'::jsonb);end if;
   raise exception 'STAGE_CLOSED';
 end if;
 foreach k in array array['synopsis','temporal_background','spatial_background','signature'] loop
  if coalesce(length(btrim(p_result->>k)),0)=0 then raise exception 'INCOMPLETE_RESULT';end if;
 end loop;
 portrait=(p_result->'character'->>'image_id')::uuid; scene=(p_result->'scene'->>'image_id')::uuid;
 if not exists(select 1 from public.image_submissions where id=portrait and activity_id=p_activity and image_type='character' and submission_status='complete')
 or not exists(select 1 from public.image_submissions where id=scene and activity_id=p_activity and image_type='scene' and submission_status='complete') then raise exception 'FORBIDDEN';end if;
 select coalesce(array_agg(id),'{}') into losers from public.image_submissions where activity_id=p_activity and id not in (portrait,scene) and submission_status='complete';
 if cardinality(losers)>0 then
  j=public.queue_deletion(p_teacher,p_activity,'images',losers,null); jobs=jobs||jsonb_build_array(j.id);
 end if;
 select coalesce(array_agg(image_path),'{}') into paths from public.upload_jobs where activity_id=p_activity and status='pending';
 update public.upload_jobs set status='expired' where activity_id=p_activity and status='pending';
 if cardinality(paths)>0 then
  insert into public.deletion_jobs(teacher_id,activity_id,target_type,image_paths) values(p_teacher,p_activity,'orphan',paths) returning * into j;
  jobs=jobs||jsonb_build_array(j.id);
  insert into public.deletion_jobs(teacher_id,activity_id,target_type,image_paths,not_before) values(p_teacher,p_activity,'orphan',paths,now()+interval '3 hours');
 end if;
 update public.image_submissions set approval_status='approved' where id in (portrait,scene);
 update public.activities set stage='CLOSED',synopsis=p_result->>'synopsis',temporal_background=p_result->>'temporal_background',spatial_background=p_result->>'spatial_background',signature=p_result->>'signature',final_result=p_result,finalized_at=now(),final_selection=jsonb_build_object('character',portrait,'scene',scene) where id=p_activity;
 return jsonb_build_object('id',p_activity,'removed',cardinality(losers),'jobs',jobs);
end;$$;
revoke execute on function public.save_lesson(uuid,uuid,jsonb,text,text),public.create_lesson(uuid,uuid,jsonb,text,text,text),public.reset_lesson_password(uuid,text),public.select_final_image(uuid,uuid,uuid,text),public.queue_deletion(uuid,uuid,text,uuid[],uuid),public.finalize_lesson(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_lesson(uuid,uuid,jsonb,text,text),public.create_lesson(uuid,uuid,jsonb,text,text,text),public.reset_lesson_password(uuid,text),public.select_final_image(uuid,uuid,uuid,text),public.queue_deletion(uuid,uuid,text,uuid[],uuid),public.finalize_lesson(uuid,uuid,jsonb) to service_role;
commit;
