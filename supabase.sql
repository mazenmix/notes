-- Run once in the Supabase SQL Editor.
create table if not exists public.vault (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.vault enable row level security;
drop policy if exists "vault_select_own" on public.vault;
drop policy if exists "vault_insert_own" on public.vault;
drop policy if exists "vault_update_own" on public.vault;
drop policy if exists "vault_delete_own" on public.vault;
create policy "vault_select_own" on public.vault for select to authenticated using (auth.uid() = user_id);
create policy "vault_insert_own" on public.vault for insert to authenticated with check (auth.uid() = user_id);
create policy "vault_update_own" on public.vault for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "vault_delete_own" on public.vault for delete to authenticated using (auth.uid() = user_id);
grant select, insert, update, delete on public.vault to authenticated;
revoke all on public.vault from anon;
