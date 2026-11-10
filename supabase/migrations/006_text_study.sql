-- Original PDFs are private and can only be uploaded/read with teacher-issued URLs.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('literature-texts','literature-texts',false,41943040,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=41943040,allowed_mime_types=array['application/pdf'];
-- No browser-role policies: image upload limits and permissions remain independent.
