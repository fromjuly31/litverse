-- Keep the exact question and answer alongside each uploaded photo.
begin;
alter table public.upload_jobs add column question_responses jsonb not null default '[]'::jsonb check(jsonb_typeof(question_responses)='array' and jsonb_array_length(question_responses)<=3);
alter table public.image_submissions add column question_responses jsonb not null default '[]'::jsonb check(jsonb_typeof(question_responses)='array' and jsonb_array_length(question_responses)<=3);

create or replace function public.reserve_upload(p_activity uuid,p_worksheet uuid,p_id uuid,p_data jsonb) returns public.upload_jobs
language plpgsql security definer set search_path='' as $$
declare a public.activities; w public.worksheets; j public.upload_jobs; revision_id uuid; ext text; responses jsonb; expected jsonb; answer_item record;
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
 responses=coalesce(p_data->'question_responses','[]'::jsonb);
 expected=coalesce(a.settings->'submission_questions','[]'::jsonb);
 if jsonb_typeof(responses)<>'array' then raise exception 'INVALID_QUESTION_RESPONSES';end if;
 if jsonb_array_length(responses)<>jsonb_array_length(expected) or jsonb_array_length(responses)>3 then raise exception 'INVALID_QUESTION_RESPONSES';end if;
 for answer_item in select value,ordinality from jsonb_array_elements(responses) with ordinality loop
  if answer_item.value->>'question' is distinct from expected->>(answer_item.ordinality::integer-1) or jsonb_typeof(answer_item.value->'answer') is distinct from 'string' or length(btrim(answer_item.value->>'answer')) not between 1 and 2000 then raise exception 'INVALID_QUESTION_RESPONSES';end if;
 end loop;
 select revision into revision_id from public.image_submissions where worksheet_id=p_worksheet and image_type=p_data->>'image_type' and slot=(p_data->>'slot')::integer;
 if found and not (a.settings->>'allow_resubmit')::boolean then raise exception 'RESUBMIT_DISABLED';end if;
 ext=case p_data->>'mime' when 'image/png' then '.png' when 'image/jpeg' then '.jpg' else '.webp' end;
 insert into public.upload_jobs(id,activity_id,worksheet_id,image_type,slot,image_path,expected_revision,mime,size,hashtags,one_line_description,question_responses)
 values(p_id,p_activity,p_worksheet,p_data->>'image_type',(p_data->>'slot')::integer,p_activity::text||'/'||p_worksheet::text||'/'||p_id::text||ext,revision_id,p_data->>'mime',(p_data->>'size')::integer,array(select jsonb_array_elements_text(p_data->'hashtags')),p_data->>'one_line_description',responses) returning * into j;
 return j;
end;$$;

create or replace function public.finalize_upload(p_activity uuid,p_worksheet uuid,p_job uuid) returns public.image_submissions
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
 insert into public.image_submissions(activity_id,worksheet_id,image_type,slot,image_path,hashtags,one_line_description,question_responses,approval_status)
 values(p_activity,p_worksheet,j.image_type,j.slot,j.image_path,j.hashtags,j.one_line_description,j.question_responses,case when (a.settings->>'require_approval')::boolean then 'pending' else 'approved' end)
 on conflict(worksheet_id,image_type,slot) do update set image_path=excluded.image_path,hashtags=excluded.hashtags,one_line_description=excluded.one_line_description,question_responses=excluded.question_responses,approval_status=excluded.approval_status,revision=gen_random_uuid(),created_at=now() returning * into result;
 update public.upload_jobs set status='complete',image_id=result.id where id=p_job;
 if old_image.id is not null then
  insert into public.deletion_jobs(teacher_id,activity_id,target_type,image_paths) values(a.teacher_id,p_activity,'orphan',array[old_image.image_path]);
  insert into public.deletion_jobs(teacher_id,activity_id,target_type,image_paths,not_before) values(a.teacher_id,p_activity,'orphan',array[old_image.image_path],now()+interval '3 hours');
 end if;
 return result;
end;$$;

-- CREATE OR REPLACE preserves the existing service-role-only RPC permissions.
commit;
