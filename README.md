# Crypto Signal Desk

Agente local de decisões técnicas para os mercados Spot USDT mais líquidos da Binance. Analisa o mercado e apresenta `COMPRAR`, `VENDER` ou `ESPERAR`, sem executar ordens.

## Executar

```bash
npm install
npm run dev
```

Para criar uma versão de produção:

```bash
npm run build
```

## Decisão do agente

O agente combina, de forma determinística:

- tendência relativa às médias móveis de 20 e 50 períodos;
- RSI de 14 períodos;
- cruzamento MACD (12, 26, 9);
- volume da última vela relativo à média das 20 velas anteriores;
- suporte e resistência dos últimos 40 períodos;
- relação risco/retorno estimada entre preço atual, suporte e resistência.

`COMPRAR` exige tendência positiva, MACD positivo, RSI abaixo de 70, volume/risco aceitáveis e risco/retorno de pelo menos 1,5. `VENDER` exige tendência e momentum negativos. Caso contrário, o agente diz `ESPERAR`.

Cada decisão mostra a entrada de referência, stop, alvo e risco/retorno estimados.

## Playbook multi-timeframe

O painel “Playbook” é uma tradução simplificada e automatizável das ideias do curso ligado pelo utilizador. Trabalha assim:

1. A estrutura de swing de 4h define o bias altista, baixista ou neutro.
2. A estrutura de 1h escolhe o timeframe de execução: 5m quando está alinhada com 4h; 15m quando diverge.
3. O sistema exige uma confluência de alto timeframe: um sweep na direção do bias ou uma zona de fair value gap/equilíbrio.
4. No timeframe de execução, procura break of structure e reação numa zona de confluência.
5. Só apresenta `CONFIGURAÇÃO CONFIRMADA` quando todas as condições e uma relação risco/retorno estimada de pelo menos 1,5 estão presentes.

Swing points, fair value gaps, equilíbrio e break of structure são heurísticas implementadas a partir de velas históricas. Não são a única definição possível destes conceitos nem substituem validação manual. O estado confirmado não prevê resultados: usa paper trading, backtesting com dados fora da amostra e um diário antes de arriscar dinheiro real.

O cálculo de risco usa apenas capital, percentagem de risco e distância até à invalidação. Não considera quantidades mínimas, comissões, spread, slippage, liquidação, impostos ou requisitos da corretora.

## Confluências adicionais e validação

Além de FVG e equilíbrio, o painel lista uma heurística de order block (a última vela contrária antes do impulso estrutural), breaker block (um order block ultrapassado) e balanced range (sobreposição recente entre FVGs de sentido oposto). As sessões são calculadas em UTC, porque crypto não tem sessões de abertura/fecho equivalentes às de Forex ou ações.

O painel apresenta um replay limitado da última janela de 25 velas do timeframe de execução: assume uma entrada no início da janela, invalidação no extremo das 20 velas anteriores e alvo a 1,5R. É um teste conservador de uma única janela, não uma validação da configuração atual e não um backtest real. Um backtest real precisa de dados paginados, uma definição congelada de regras, comissões, spread/slippage e validação fora da amostra. Não interpretes uma lista de zonas ou um estado técnico como previsão.

## Explicações por IA

A decisão técnica não depende de IA: mantém-se verificável e repetível. Se quiseres acrescentar uma explicação por IA, cria um endpoint **server-side** que receba apenas as métricas já calculadas e define `VITE_AI_EXPLANATION_URL` conforme `.env.example`. Não coloques chaves de API no browser.

## Limitações e risco

Este software é educativo e informativo, não é aconselhamento financeiro e não executa ordens. Dados públicos podem estar atrasados ou indisponíveis; indicadores técnicos podem gerar sinais falsos. Confirma sempre a informação, usa gestão de risco e não invistas capital que não possas perder.
