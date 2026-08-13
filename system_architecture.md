# Agent TJR — previsão de preço + killzones

## Sinais (4 passos)
1. Sweep de draws HTF (session / PDH-PDL / 1h-4h)
2. BOS/iFVG em exec+1h **com displacement** (Disciplina: confirmação 5m; 1h opcional)
3. Zona de continuação com prioridade FVG → EQ → OB confirmado → breaker + discount/premium
4. Disciplina/índices US: sinal contrário 1m **dentro da zona 5m** → BOS/iFVG alinhado → **entry = close desse candle**

## iFVG atualizado (tutorial 6h40)
- BOS exige close além do último swing TJR; wick não conta.
- FVGs consecutivas da mesma expansão, sem retrace, formam uma stack.
- A stack bullish só inverte bearish após close abaixo da gap controladora inferior.
- A stack bearish só inverte bullish após close acima da gap controladora superior.
- `Disciplina` usa a regra estrita; o fallback por gap individual fica exclusivo de `CFD prático`.
- O sinal iFVG só conta no candle que fecha além da fronteira, não indefinidamente.

## Order block / breaker
- OB bullish = última vela bearish antes de BOS/iFVG bullish confirmado.
- OB bearish = última vela bullish antes de BOS/iFVG bearish confirmado.
- Close além da margem de invalidação retira o OB.
- OB bearish quebrado acima muda para breaker bullish; OB bullish quebrado abaixo muda para breaker bearish.
- Breaker deixa de estar activo após close pela margem oposta.
- Disciplina/índices exigem que o retrace 1m ocorra dentro da zona 5m selecionada, incluindo OB/BB.

## ES↔NQ
- Tendência ES/NQ 5m continua visível, mas é apenas informativa.
- SMT real emparelha candles/swings 5m por timestamp.
- Um mercado faz HH/sweep high e o outro falha → SMT bearish.
- Um mercado faz LL/sweep low e o outro falha → SMT bullish.
- Disciplina bloqueia feed ES/NQ inválido ou SMT fresh contrário ao trade.
- Prático mostra feed/SMT como qualidade; não bloqueia oportunidades apenas por ausência de dados ES/NQ.

## Preços
- Stop = 2º swing (+ floor 3.5% / cap 8%)
- Target = draw com prioridade PDH/PDL > NY > London > Asia, R:R ∈ [min, 3]

## Sessões (America/New_York)
- `ny_open` 09:30–11:00 → allowEnterNow
- Índices US mantêm janela rígida 09:30–10:30 ET.
- Forex/Crypto tratam killzone como qualidade/score, não bloqueio.
- Mercado fechado e dados LTF atrasados continuam sem JÁ.

Quick scan nunca COMPRAR JÁ. Gestão do trade = utilizador.
