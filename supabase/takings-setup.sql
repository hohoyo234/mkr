-- ============================================================
-- takings — what the till took, one row per venue per day.
--
-- The only revenue figure in this app. Every cost it already tracks (food,
-- waste, labour hours) is meaningless without it: $4,000 of food is either
-- fine or a disaster depending on this number.
--
-- Same shape as every other table: id + data(jsonb) + updated_at, with
-- per-tenant RLS keyed off data->>'kitchenId'. Run supabase/security-setup.sql
-- FIRST so is_super() / is_active() / my_kitchen() exist.
--
-- Without this table the app still works — takings just stay on the device
-- they were typed on.
-- ============================================================

create table if not exists public.takings(
  id text primary key, data jsonb, updated_at timestamptz default now());

revoke all on public.takings from anon;
grant select, insert, update, delete on public.takings to authenticated;
alter table public.takings enable row level security;
alter table public.takings force row level security;

drop policy if exists takings_tenant on public.takings;
create policy takings_tenant on public.takings for all to authenticated
  using      ( public.is_super() or (public.is_active() and (data->>'kitchenId') = public.my_kitchen()) )
  with check ( public.is_super() or (public.is_active() and (data->>'kitchenId') = public.my_kitchen()) );

do $$ begin
  alter publication supabase_realtime add table public.takings;
exception when duplicate_object then null;
end $$;
