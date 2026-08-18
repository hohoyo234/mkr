-- ============================================================
-- recipes — dish cost cards: what goes in the bowl, and what the bowl sells for.
--
-- The join between the shelf and the menu board. Stock knows beef went up 18%;
-- this knows the bowl holds 0.2 kg of it and sells for $18.50; together they
-- answer whether the dish is still worth cooking.
--
-- Deliberately coarse: three to five ingredients in the unit the shelf already
-- uses, not a gram-accurate bill of materials. Nobody types the latter for
-- forty dishes, and a costing a few per cent out still says the same thing
-- about an 18% price rise.
--
-- This is NOT a menu. Nothing in here is shown to a customer, ordered or sold —
-- the app has no point of sale. It is a calculator over prices already in stock.
--
-- Same shape as every other table: id + data(jsonb) + updated_at, with
-- per-tenant RLS keyed off data->>'kitchenId'. Run supabase/security-setup.sql
-- FIRST so is_super() / is_active() / my_kitchen() exist.
-- ============================================================

create table if not exists public.recipes(
  id text primary key, data jsonb, updated_at timestamptz default now());

revoke all on public.recipes from anon;
grant select, insert, update, delete on public.recipes to authenticated;
alter table public.recipes enable row level security;
alter table public.recipes force row level security;

drop policy if exists recipes_tenant on public.recipes;
create policy recipes_tenant on public.recipes for all to authenticated
  using      ( public.is_super() or (public.is_active() and (data->>'kitchenId') = public.my_kitchen()) )
  with check ( public.is_super() or (public.is_active() and (data->>'kitchenId') = public.my_kitchen()) );

do $$ begin
  alter publication supabase_realtime add table public.recipes;
exception when duplicate_object then null;
end $$;
