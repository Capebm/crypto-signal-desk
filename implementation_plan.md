# Plano: Position Advisor (manter / reforçar / sair)

## Inputs do utilizador
- Par (ex. PEOPLE ou F)
- Preço de entrada (Cost Price)
- Quantidade (opcional)
- Stop actual (opcional)

## Lógica `[NEW] src/lib/position-advisor.ts`
Compara posição aberta com `evaluateTjrFull`:
- **SAIR** — BOS contrário, stop atingido, invalidação, ou preço ≤ stop TJR
- **REALIZAR** — alvo atingido / perto do alvo (≥85% do caminho entry→target)
- **COMPRAR MAIS** — estrutura intacta + COMPRAR JÁ + preço em discount/zona + PnL ≥ -0.5R (não reforçar em perda profunda)
- **MANTER** — bias ok, estrutura intacta, entre stop e alvo

## UI `[NEW] PositionAdvisor.tsx` + `[MODIFY] AgentDashboard`
Secção “A minha posição” no topo do agente; resultado grande: SAIR / MANTER / COMPRAR MAIS / REALIZAR.
