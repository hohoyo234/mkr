-- ============================================================
-- Stock chain + training tables — run ONCE in Supabase SQL Editor.
--
--   suppliers   who you buy from, and who you actually ring
--   purchases   every invoice: what, from whom, at what unit price
--   stocktakes  what you physically counted (the only source of usage data)
--   deliveries  the back-door confirmation form
--   sops        the venue's written procedures
--   trainings   one SOP assigned to one person, with a sign-off
--
-- Same shape as every other table: id + data(jsonb) + updated_at, with per-tenant
-- RLS keyed off data->>'kitchenId'. Run supabase/security-setup.sql FIRST so the
-- is_super() / is_active() / my_kitchen() helpers exist.
--
-- Without these tables the app still works — it just stays local-only for them.
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array['suppliers','purchases','stocktakes','deliveries','sops','trainings']
  loop
    execute format('create table if not exists public.%I(
      id text primary key, data jsonb, updated_at timestamptz default now())', t);

    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);

    execute format('drop policy if exists %I on public.%I', t||'_tenant', t);
    execute format($p$create policy %I on public.%I for all to authenticated
      using      ( public.is_super() or (public.is_active() and (data->>'kitchenId') = public.my_kitchen()) )
      with check ( public.is_super() or (public.is_active() and (data->>'kitchenId') = public.my_kitchen()) )$p$,
      t||'_tenant', t);

    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- Handy indexes for the two tables that get scanned by time.
create index if not exists purchases_ts_idx  on public.purchases  ((data->>'ts'));
create index if not exists stocktakes_ts_idx on public.stocktakes ((data->>'ts'));

-- ------------------------------------------------------------
-- Tables retired with the POS / payroll / customer removal. They are NOT dropped
-- here: dropping is irreversible and you may want the history. Uncomment only if
-- you are certain you want that data gone for good.
-- ------------------------------------------------------------
-- drop table if exists public.menu cascade;
-- drop table if exists public.orders cascade;
-- drop table if exists public.reconciliations cascade;
-- drop table if exists public.members cascade;
-- drop table if exists public.coupons cascade;
