begin;

alter table public.upload_jobs add column docent jsonb;
alter table public.image_submissions add column docent jsonb;

create function public.reserve_docent_upload(
  p_activity uuid, p_worksheet uuid, p_id uuid, p_data jsonb, p_docent jsonb
) returns public.upload_jobs
language plpgsql security invoker set search_path = '' as $$
declare
  job public.upload_jobs;
begin
  if p_docent is not null and (
    p_data->>'image_type' is distinct from 'scene' or
    jsonb_typeof(p_docent) is distinct from 'object' or
    jsonb_typeof(p_docent->'script') is distinct from 'string' or
    coalesce(length(btrim(p_docent->>'script')), 0) not between 1 and 120 or
    jsonb_typeof(p_docent->'voice_description') is distinct from 'string' or
    coalesce(length(btrim(p_docent->>'voice_description')), 0) not between 1 and 160
  ) then
    raise exception 'INVALID_DOCENT';
  end if;

  job := public.reserve_upload(p_activity, p_worksheet, p_id, p_data);
  if job.image_type is distinct from p_data->>'image_type' then
    raise exception 'INVALID_DOCENT';
  end if;
  if job.docent is distinct from p_docent then
    if job.docent is not null or job.status <> 'pending' or p_docent is null then
      raise exception 'INVALID_DOCENT';
    end if;
    update public.upload_jobs set docent = p_docent where id = job.id
      returning * into job;
  end if;
  return job;
end;
$$;

create function public.finalize_docent_upload(
  p_activity uuid, p_worksheet uuid, p_job uuid
) returns public.image_submissions
language plpgsql security invoker set search_path = '' as $$
declare
  image public.image_submissions;
  narration jsonb;
begin
  image := public.finalize_upload(p_activity, p_worksheet, p_job);
  select docent into narration from public.upload_jobs where id = p_job;
  if image.docent is distinct from narration then
    update public.image_submissions set docent = narration where id = image.id
      returning * into image;
  end if;
  return image;
end;
$$;

revoke all on function public.reserve_docent_upload(uuid, uuid, uuid, jsonb, jsonb),
  public.finalize_docent_upload(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_docent_upload(uuid, uuid, uuid, jsonb, jsonb),
  public.finalize_docent_upload(uuid, uuid, uuid) to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('literature-docents', 'literature-docents', false, 960044, array['audio/wav'])
on conflict (id) do nothing;

commit;
