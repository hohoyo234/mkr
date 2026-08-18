-- ============================================================
-- certs — the tickets an inspector asks to see, with their expiry dates.
--
-- RSA, Food Safety Supervisor, first aid: a type, a number, an expiry and a
-- photo of the thing itself, so it can be produced on the spot rather than
-- hunted for in someone's glovebox. The app counts down to the date and warns
-- before it lapses. It verifies nothing with any issuing body and makes no
-- judgement about whether the venue or the person is compliant.
--
-- Work rights are NOT in here: the staff member records their own visa during
-- onboarding, and it stays on that record. The certificate screen reads it
-- alongside these rows without copying it.
--
-- Same shape as every other table: id + data(jsonb) + updated_at, with
-- per-tenant RLS keyed off data->>'kitchenId'. Run supabase/security-setup.sql
-- FIRST so is_super() / is_active() / my_kitchen() exist.
--
-- Without this table the app still works — certificates just stay on the
-- device they were photographed on.
-- ============================================================

create table if not exists public.certs(
  id text primary key, data jsonb, updated_at timestamptz default now());

revoke all on public.certs from anon;
grant select, insert, update, delete on public.certs to authenticated;
alter table public.certs enable row level security;
alter table public.certs force row level security;

drop policy if exists certs_tenant on public.certs;
create policy certs_tenant on public.certs for all to authenticated
  using      ( public.is_super() or (public.is_active() and (data->>'kitchenId') = public.my_kitchen()) )
  with check ( public.is_super() or (public.is_active() and (data->>'kitchenId') = public.my_kitchen()) );

do $$ begin
  alter publication supabase_realtime add table public.certs;
exception when duplicate_object then null;
end $$;
