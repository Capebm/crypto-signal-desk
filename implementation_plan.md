# Plano: melhor previsão de preço / qualidade de sinal

Foco do utilizador: **gestão do trade é dele**; o algoritmo deve **ler estrutura TJR e acertar melhor entry / stop / alvo**.

## Gaps actuais

1. **Entrada** — em AGORA usa `exec.price` genérico; não o close do BOS 1m
2. **Alvo** — pega no 1º nível de liquidez acima/abaixo; pode ser ruído perto demais ou longe demais
3. **Stop** — clamp 3.5–8% pode ignorar o swing estrutural “certo” (2º high/low TJR)
4. **Bias** — long com só 1h altista (4h neutro/bear) gera sinais fracos
5. **Displacement** — confirmação 5m sem exigir candle com corpo forte (TJR: mudança de order flow)
6. **Score** — não penaliza ausência de step 4 / draw sweep real

## Alterações (algoritmo)

### [MODIFY] `src/lib/tjr-engine.ts`
- Entry AGORA = close do candle 1m que fez BOS (ou último close 1m se fresco)
- Targets: escolher draw com melhor R:R ≥ min **e** ≤ 3R (evitar alvos absurdos); preferir session/PDH-PDL
- Stop: preferir 2º swing estrutural; % só como floor se swing &lt; ruído **e** R:R ainda válido
- Bias duro: 4h alinhado OU (1h + sweep draw) — sem 4h contrário
- Confirmação 5m: exigir displacement (corpo ≥ 1.2× média) no BOS/IFVG
- Score: +peso steps 1–4 completos; −peso se quick/sem 1m

### [MODIFY] `src/lib/tjr-structure.ts`
- `ltfEntryConfirmation` devolve também `entryPrice`
- Helper `hasDisplacement(candles)`

### [MODIFY] UI (mínimo)
- Mostrar nos cartões: “Entrada BOS 1m” vs “Zona FVG” para o utilizador copiar o preço certo

## Fora de scope
Risk %, journal, top-N UI, partial TP (gestão = utilizador)

## Expectativa
Menos sinais; preços de entrada/alvo mais “no sítio” da estrutura TJR.
