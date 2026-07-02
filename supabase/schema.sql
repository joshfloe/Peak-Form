-- ============================================================================
-- PeakForm — Supabase schema
-- Run this once in your Supabase project's SQL Editor (Dashboard → SQL Editor
-- → New Query → paste this whole file → Run). Safe to re-run; uses IF NOT
-- EXISTS / CREATE OR REPLACE everywhere.
-- ============================================================================

-- One row per user holding their entire app state as JSON (profile, plans,
-- run/lift/food logs). This mirrors the exact shape the app already used in
-- localStorage, so the client code barely has to change.
create table if not exists public.app_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_data enable row level security;

drop policy if exists "app_data: select own row" on public.app_data;
create policy "app_data: select own row"
  on public.app_data for select
  using (auth.uid() = user_id);

drop policy if exists "app_data: insert own row" on public.app_data;
create policy "app_data: insert own row"
  on public.app_data for insert
  with check (auth.uid() = user_id);

drop policy if exists "app_data: update own row" on public.app_data;
create policy "app_data: update own row"
  on public.app_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Subscription status, written ONLY by the Stripe webhook (server-side,
-- using the service role key which bypasses RLS). Users can read their own
-- row to know whether to show the paywall, but can never write to it
-- directly — that would let someone fake themselves a subscription.
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'none', -- none | trialing | active | past_due | canceled
  price_id text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions: select own row" on public.subscriptions;
create policy "subscriptions: select own row"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Intentionally NO insert/update/delete policy for regular users — only the
-- service role key (used by the Stripe webhook function) can write here.

-- Keep updated_at fresh automatically.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_app_data_updated_at on public.app_data;
create trigger set_app_data_updated_at
  before update on public.app_data
  for each row execute function public.set_updated_at();

drop trigger if exists set_subscriptions_updated_at on public.subscriptions;
create trigger set_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();
