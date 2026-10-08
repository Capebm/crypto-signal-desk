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

## Risco (V3.1 · diário ago–set 2026)
- R:R mínimo **1.5** em todos os perfis e modos (`MIN_RR_FLOOR`); o modo TP 1R foi retirado (1R a ~47% de acerto perdia após custos).
- Avisos (não bloqueiam, ficam gravados no sinal): fora de 13:30–16:00 UTC · ação CFD · alt Spot < 1 $ · máx. posições abertas · limite de perda diária.
- Stake «Auto · risco»: notional = capital × risco% ÷ distância do stop (Spot ≤ 1× capital, CFD ≤ 5×).

## Sinais medidos (Supabase)
- Cada JÁ (Agente/T212, sem CONFIRMAR LIVE) → tabela `signals` directamente do browser (supabase-js, chave publishable).
- Acesso: login por link mágico; RLS só deixa a sessão de capebm@gmail.com ler/escrever as suas linhas (`is_desk_owner`).
- Dedupe: ativo + lado + janela de 15 min. Fila local se a BD falhar.
- Resolução com velas 5m depois do sinal: TP, SL, SL/TP na mesma vela = −1R (conservador), ou R no fecho às 48h.
- Diário liga trades ao sinal mais próximo (≤ 2h depois, mesmo lado) → plano vs execução; `journal_trades` faz upsert por id.

## Preços
- Stop = 2.º swing de execução com buffer ATR; Crypto só usa o clamp 3.5–8% se não houver ATR.
- Alvo 1R/1.5R usa esse risco estrutural e nunca atravessa o draw oposto mais próximo.
- Sem liquidez à frente (preço no extremo) o R:R de espaço é 0 — nunca `JÁ`.
- Modo liquidez ignora o draw mais próximo se ficar abaixo do R:R mínimo; não inventa um alvo a 1.5%.

## Anti-chase / timing
- `AGORA` exige toque real na zona de continuação (preço ou retrace LTF dentro da FVG/EQ/OB/BB).
- `softOpposed` / malha pode manter a direção, mas desce sempre para `RETRACE`.
- Se o preço já está contra a liquidez oposta, o motor espera retrace na zona em vez de perseguir.
- Spot: o sweep mais recente manda. Um HIGH antigo não bloqueia um LOW posterior (lookback Crypto 18h).
- Confirmação tem de ser no mesmo bar ou depois do sweep controlador, e recente: 12 velas no 5m / 6 velas no 1h.
- Sweep de sessão usa o high/low *antes* da vela do raid; o pavio em curso não actualiza o próprio nível.
- Disciplina / Equilibrado / Agressivo exigem draw HTF. Só Malha pode usar micro-swing 1h.
- Agente Prático/Malha (`scanAllSetups` e não Disciplina) usa as mesmas regras práticas que o T212 crypto (`cfdPractical`: confirmação 5m **ou** 1h, iFVG permissivo, LTF 5m, opposed stale = aviso).
- Cryptos do catálogo T212 (XRP, BTC, ETH, …) entram sempre no refine MTF do Agente.
- `A_AGUARDAR` só aparece em setups executáveis à espera de retrace; progresso parcial com `ESPERAR` fica `BLOQUEADA`.

## Sessões (America/New_York; índices: bolsa de cada um)
- Índices fora dos EUA usam as mesmas killzones no relógio da sua bolsa (`index-exchanges.ts`): abertura → +90 min = JÁ · meio = AGUARDAR · última hora = sem entradas · 2 h antes = pré-abertura. GER40/EU50 Frankfurt 09:00, UK100 Londres 08:00, FRA40/SPA35/ITA40/SWISS20/NETH25 09:00 local, JP225 Tóquio 09:00, HK50 Hong Kong 09:30.
- Janela de entrada (aviso `fora_janela`) = abertura da bolsa do ativo + 2h30; sem bolsa conhecida → NY 09:30–12:00 ET.
- Índices US: histórico dos futuros (Yahoo, ~10 min atraso) + cauda ao vivo do índice à vista (^GSPC/^NDX/^DJI) deslocada pela diferença futuro − índice. A T212 cota estes CFDs pelos futuros.
- `ny_open` 09:30–11:00 → allowEnterNow
- Índices US mantêm janela rígida 09:30–10:30 ET.
- Forex/Crypto tratam killzone como qualidade/score, não bloqueio.
- Mercado fechado e dados LTF atrasados continuam sem JÁ.

Quick scan nunca COMPRAR JÁ. Gestão do trade = utilizador.
