-- Aplicada ao projeto Supabase "crypto-signal-desk" (ixidmdvaqgfwkcohclnn).
create table public.signals (
  id uuid primary key default gen_random_uuid(),
  signal_key text not null unique,
  venue text not null check (venue in ('spot', 't212')),
  symbol text not null,
  base text not null,
  instrument_kind text not null,
  data_symbol text,
  side text not null check (side in ('long', 'short')),
  entry double precision not null,
  stop double precision not null,
  target double precision not null,
  rr double precision not null,
  score integer not null,
  profile text,
  tp_mode text,
  session text,
  warnings text[] not null default '{}',
  app_version text not null,
  signal_at timestamptz not null,
  created_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'tp', 'sl', 'expired', 'ambiguous')),
  resolved_at timestamptz,
  exit_price double precision,
  r_multiple double precision,
  mfe_r double precision,
  mae_r double precision
);
create index signals_open_idx on public.signals (status, signal_at) where status = 'open';
create index signals_symbol_time_idx on public.signals (base, signal_at desc);

create table public.journal_trades (
  id text primary key,
  venue text not null check (venue in ('spot', 't212')),
  symbol text not null,
  base text not null,
  side text not null check (side in ('long', 'short')),
  asset_class text,
  entry_time timestamptz not null,
  exit_time timestamptz not null,
  entry_price double precision not null,
  exit_price double precision not null,
  quantity double precision not null,
  pnl double precision not null,
  fees double precision not null default 0,
  overnight double precision not null default 0,
  exit_type text check (exit_type in ('tp', 'sl', 'manual', 'trailing')),
  planned_stop double precision,
  planned_target double precision,
  realized_r double precision,
  signal_id uuid references public.signals (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index journal_trades_exit_idx on public.journal_trades (exit_time desc);
create index journal_trades_signal_idx on public.journal_trades (signal_id);

alter table public.signals enable row level security;
alter table public.journal_trades enable row level security;
-- Sem políticas: só a chave secreta (Netlify function) acede.
