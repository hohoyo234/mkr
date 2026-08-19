-- ============================================================
-- The venue's calendar — run ONCE in Supabase SQL Editor.
--
--   events   pest control, deep cleans, the grease trap, whoever is doing them
--
-- Deliveries are NOT in here: the calendar reads them from `deliveries`, so a
-- date only ever exists in one place.
--
-- Same shape as every other table: id + data(jsonb) + updated_at, with per-tenant
-- RLS keyed off data->>'kitchenId'. Run supabase/security-setup.sql FIRST so the
-- is_super() / is_active() / my_kitchen() helpers exist.
--
-- Without this table the calendar still works — it just stays on the device.
-- ============================================================

create table if not exists public.events(
  id text primary key, data jsonb, updated_at timestamptz default now());

revoke all on public.events from anon;
grant select, insert, update, delete on public.events to authenticated;
alter table public.events enable row level security;
alter table public.events force row level security;

drop policy if exists events_tenant on public.events;
create policy events_tenant on public.events for all to authenticated
  using      ( public.is_super() or (public.is_active() and (data->>'kitchenId') = public.my_kitchen()) )
  with check ( public.is_super() or (public.is_active() and (data->>'kitchenId') = public.my_kitchen()) );

do $$
begin
  execute 'alter publication supabase_realtime add table public.events';
exception when duplicate_object then null;
end $$;

create index if not exists events_date_idx on public.events ((data->>'date'));
