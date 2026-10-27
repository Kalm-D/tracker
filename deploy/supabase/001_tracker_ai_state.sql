-- Apply once with Supabase SQL Editor. Private server-only storage; no browser access.
create table if not exists public.tracker_ai_cloud_lease (
 id integer primary key check (id=1), owner uuid,
 lease_until timestamptz not null default '-infinity'
);
create table if not exists public.tracker_ai_cloud_documents (
 key text primary key,
 value jsonb not null check (jsonb_typeof(value)='object'),
 byte_size integer not null check (byte_size between 0 and 8388608),
 updated_at timestamptz not null default now()
);
alter table public.tracker_ai_cloud_lease enable row level security;
alter table public.tracker_ai_cloud_documents enable row level security;
revoke all on table public.tracker_ai_cloud_lease, public.tracker_ai_cloud_documents from public, anon, authenticated, service_role;

create or replace function public.tracker_ai_state(p_owner uuid,p_action text,p_changes jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.tracker_ai_cloud_lease%rowtype; k text; v jsonb; total bigint; amount integer; files jsonb;
begin
 if p_owner is null or p_action is null or p_action not in ('acquire','renew','write','release') then raise exception 'invalid_request'; end if;
 insert into public.tracker_ai_cloud_lease(id) values(1) on conflict do nothing;
 select * into s from public.tracker_ai_cloud_lease where id=1 for update;
 if p_action='acquire' then
  if s.owner is not null and s.owner<>p_owner and s.lease_until>clock_timestamp() then raise exception 'writer_busy'; end if;
  update public.tracker_ai_cloud_lease set owner=p_owner,lease_until=clock_timestamp()+interval '120 seconds' where id=1;
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into files from public.tracker_ai_cloud_documents;
  return jsonb_build_object('ok',true,'files',files);
 end if;
 if s.owner is distinct from p_owner or s.lease_until<=clock_timestamp() then raise exception 'writer_expired'; end if;
 if p_action='release' then
  update public.tracker_ai_cloud_lease set owner=null,lease_until='-infinity' where id=1;
  return jsonb_build_object('ok',true);
 end if;
 if p_action='write' then
  if p_changes is null or jsonb_typeof(p_changes)<>'object' then raise exception 'invalid_changes'; end if;
  for k,v in select * from jsonb_each(p_changes) loop
   if k !~ '^(jobs/[a-f0-9-]{36}[.]json|gateway/(usage|restore-hold)[.]json|monitoring/monitors[.]json)$'
    or jsonb_typeof(v)<>'object' or octet_length(v::text)>8388608 then raise exception 'invalid_file'; end if;
  end loop;
  for k,v in select * from jsonb_each(p_changes) loop
   insert into public.tracker_ai_cloud_documents(key,value,byte_size)
    values(k,v,octet_length(v::text))
    on conflict(key) do update set value=excluded.value,byte_size=excluded.byte_size,updated_at=clock_timestamp();
  end loop;
  select count(*),coalesce(sum(byte_size),0) into amount,total from public.tracker_ai_cloud_documents;
  if amount>103 or total>33554432 then raise exception 'state_limit'; end if;
 end if;
 update public.tracker_ai_cloud_lease set lease_until=clock_timestamp()+interval '120 seconds' where id=1;
 return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.tracker_ai_state(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.tracker_ai_state(uuid,text,jsonb) to service_role;
