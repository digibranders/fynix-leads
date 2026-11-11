-- Phase 1 spike (2026-11-11): can two-sided isolation be enforced by Postgres itself?
-- Run against a throwaway database on PostgreSQL 16. Findings are in the phase 1 plan.

\set ON_ERROR_STOP off
\pset pager off
create role spk_client nologin; create role spk_agency nologin; create role spk_fynix nologin;
create function app_current_org_id() returns uuid language sql stable as $$ select nullif(pg_catalog.current_setting('app.org_id', true), '')::uuid $$;
grant execute on function app_current_org_id() to spk_client, spk_agency, spk_fynix;
create table campaign(id int primary key, client_org uuid not null, agency_org uuid not null, brand text, internal_notes text);
create table lead(id int primary key, campaign_id int references campaign(id), client_org uuid not null, agency_org uuid not null, prospect text, created_by text, secret_rep text);
insert into campaign values (1,'11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Kestrel','private note'),(2,'22222222-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Other','x'),(3,'11111111-1111-1111-1111-111111111111','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Kestrel','y');
insert into lead values (1,1,'11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Tom','agency-user-1','Imogen'),(2,2,'22222222-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Ann','agency-user-1','Dan'),(3,3,'11111111-1111-1111-1111-111111111111','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Bob','agency-user-2','Priya');
alter table lead enable row level security; alter table campaign enable row level security;
-- column grants: client never gets agency_org or created_by; agency never gets client_org or secret_rep
grant select (id, campaign_id, client_org, prospect, secret_rep) on lead to spk_client;
grant select (id, campaign_id, agency_org, prospect, created_by) on lead to spk_agency;
grant select on lead, campaign to spk_fynix;
create policy lead_client on lead for select to spk_client using (client_org = app_current_org_id());
create policy lead_agency on lead for select to spk_agency using (agency_org = app_current_org_id());
create policy lead_fynix on lead for select to spk_fynix using (true);
grant select (id, client_org, brand) on campaign to spk_client;
grant select (id, agency_org, brand) on campaign to spk_agency;
create policy camp_client on campaign for select to spk_client using (client_org = app_current_org_id());
create policy camp_agency on campaign for select to spk_agency using (agency_org = app_current_org_id());
create policy camp_fynix on campaign for select to spk_fynix using (true);

\echo === T1 client org 1111: allowed columns, only own rows
begin; set local role spk_client; select set_config('app.org_id','11111111-1111-1111-1111-111111111111',true); select id, prospect from lead order by id; commit;
\echo === T2 client: select * (expect permission denied)
begin; set local role spk_client; select set_config('app.org_id','11111111-1111-1111-1111-111111111111',true); select * from lead; rollback;
\echo === T3 client: select agency_org (expect denied)
begin; set local role spk_client; select set_config('app.org_id','11111111-1111-1111-1111-111111111111',true); select agency_org from lead; rollback;
\echo === T4 client: probe via WHERE on hidden column (expect denied)
begin; set local role spk_client; select set_config('app.org_id','11111111-1111-1111-1111-111111111111',true); select id from lead where agency_org = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; rollback;
\echo === T5 client: probe via ORDER BY / GROUP BY on hidden column (expect denied)
begin; set local role spk_client; select set_config('app.org_id','11111111-1111-1111-1111-111111111111',true); select id from lead order by created_by; rollback;
\echo === T6 client with NO scope set (expect zero rows)
begin; set local role spk_client; select id from lead; commit;
\echo === T7 agency A: own campaigns only, no client_org
begin; set local role spk_agency; select set_config('app.org_id','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',true); select id, prospect, created_by from lead order by id; select client_org from lead; rollback;
\echo === T8 policy referencing a column the role cannot read: client policy using agency_org (does the policy still work?)
create policy lead_client_probe on lead as restrictive for select to spk_client using (agency_org is not null);
begin; set local role spk_client; select set_config('app.org_id','11111111-1111-1111-1111-111111111111',true); select id from lead order by id; commit;
drop policy lead_client_probe on lead;
\echo === T9 security_invoker view exposing a hidden column to client (expect denied), and safe view
create view lead_v with (security_invoker = true) as select id, prospect, agency_org from lead;
create view lead_safe with (security_invoker = true) as select id, prospect from lead;
grant select on lead_v, lead_safe to spk_client;
begin; set local role spk_client; select set_config('app.org_id','11111111-1111-1111-1111-111111111111',true); select * from lead_v; rollback;
begin; set local role spk_client; select set_config('app.org_id','11111111-1111-1111-1111-111111111111',true); select * from lead_safe order by id; rollback;
\echo === T10 DEFINER view (default) bypasses RLS: client sees all rows (expect 3, the hazard)
create view lead_default as select id, prospect from lead; grant select on lead_default to spk_client;
begin; set local role spk_client; select set_config('app.org_id','11111111-1111-1111-1111-111111111111',true); select count(*) as rows_seen_through_default_view from lead_default; rollback;
\echo === T11 role cannot switch itself to fynix (expect error)
begin; set local role spk_client; set local role spk_fynix; rollback;
\echo === T12 SECURITY DEFINER boolean function for exclusion check
create table exclusion(client_org uuid, domain text); insert into exclusion values ('11111111-1111-1111-1111-111111111111','halden.co.uk');
create function is_excluded(d text) returns boolean language sql security definer set search_path = pg_catalog, public stable as $$ select exists (select 1 from public.exclusion e where e.client_org = app_current_org_id() and e.domain = d) $$;
revoke all on function is_excluded(text) from public; grant execute on function is_excluded(text) to spk_agency, spk_client;
begin; set local role spk_agency; select set_config('app.org_id','11111111-1111-1111-1111-111111111111',true); select is_excluded('halden.co.uk') as excluded_yes, is_excluded('nope.com') as excluded_no; select * from exclusion; rollback;
\echo === T13 count(*) with no column grants needed? (client)
begin; set local role spk_client; select set_config('app.org_id','11111111-1111-1111-1111-111111111111',true); select count(*) from lead; rollback;
\echo === T14 error text leak: client inserts (expect denied without revealing org data)
begin; set local role spk_client; insert into lead values (9,1,'11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','x','y','z'); rollback;

\set ON_ERROR_STOP off
\echo === T13 client count(*)
begin; set local role spk_client; select set_config('app.org_id','11111111-1111-1111-1111-111111111111',true); select count(*) from lead; rollback;
\echo === T14 client insert (expect permission denied, no data in message)
begin; set local role spk_client; insert into lead values (9,1,'11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','x','y','z'); rollback;
