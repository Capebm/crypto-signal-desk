-- Dono da linha + acesso só para o email do Desk (tabelas ainda vazias).
alter table public.signals add column user_id uuid not null default auth.uid() references auth.users (id) on delete cascade;
alter table public.signals drop constraint signals_signal_key_key;
alter table public.signals add constraint signals_user_signal_key_key unique (user_id, signal_key);

alter table public.journal_trades drop constraint journal_trades_pkey;
alter table public.journal_trades add column user_id uuid not null default auth.uid() references auth.users (id) on delete cascade;
alter table public.journal_trades add primary key (user_id, id);
create index signals_user_idx on public.signals (user_id);

create or replace function public.is_desk_owner(owner uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select owner = (select auth.uid())
    and coalesce((select auth.jwt() ->> 'email'), '') = 'capebm@gmail.com'
$$;

create policy "signals owner select" on public.signals for select to authenticated using (public.is_desk_owner(user_id));
create policy "signals owner insert" on public.signals for insert to authenticated with check (public.is_desk_owner(user_id));
create policy "signals owner update" on public.signals for update to authenticated using (public.is_desk_owner(user_id)) with check (public.is_desk_owner(user_id));

create policy "journal owner select" on public.journal_trades for select to authenticated using (public.is_desk_owner(user_id));
create policy "journal owner insert" on public.journal_trades for insert to authenticated with check (public.is_desk_owner(user_id));
create policy "journal owner update" on public.journal_trades for update to authenticated using (public.is_desk_owner(user_id)) with check (public.is_desk_owner(user_id));

revoke all on public.signals, public.journal_trades from anon;
