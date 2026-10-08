-- Equilíbrio de draws no momento do sinal (hipótese «cookies» do TJR): só medição.
alter table public.signals add column draws jsonb;
