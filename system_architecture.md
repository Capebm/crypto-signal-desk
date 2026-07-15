# Agent TJR — previsão de preço + killzones

## Sinais (4 passos)
1. Sweep de draws HTF (session / PDH-PDL / 1h-4h)
2. BOS/IFVG em exec+1h **com displacement**
3. Zona FVG/EQ + discount/premium
4. 1m: BOS contrário → BOS alinhado → **entry = close desse candle**

## Preços
- Stop = 2º swing (+ floor 3.5% / cap 8%)
- Target = draw com prioridade PDH/PDL > NY > London > Asia, R:R ∈ [min, 3]

## Sessões (America/New_York)
- `ny_open` 09:30–11:00 → allowEnterNow
- `ny` 11:00–15:00 → só AGUARDAR (não agressivo)
- `ny_close` 15:00–16:00 + quiet/off → blockEntries
- London → AGUARDAR; COMPRAR JÁ só agressivo

Quick scan nunca COMPRAR JÁ. Gestão do trade = utilizador.
