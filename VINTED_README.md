# GARIMPO

**Compra no mundo · vende em Portugal**

App integrado a partir do teu `garimpo.jsx` — encontra oportunidades de arbitragem para revender no Vinted.pt.

## Executar

```bash
npm install
npm run dev
```

## 3 modos

### 1. Caçar na web (mundial)
IA + web search via Anthropic. Pesquisa em:
- eBay UK/DE, Vinted ES/FR/DE/UK, Wallapop
- Lotes/atacado, Grailed/Depop, Vestiaire, AliExpress
- Qualquer fonte que a pesquisa web encontrar

**Requer** `ANTHROPIC_API_KEY` no `.env` (só server-side).

### 2. Scrapers UE (sem IA)
APIs públicas diretas, em paralelo:
- **OLX** Portugal, Polónia
- **Vinted** Espanha, França, Alemanha, UK, Itália, Polónia

Compara cada anúncio com preços no **Vinted.pt** e calcula margem.

### 3. Manual
Avalia uma peça à mão com estimativa IA do preço de revenda em PT.

## Economia

- Conversão de moeda (EUR, GBP, USD, PLN)
- IVA 23% para compras fora da UE
- Score de oportunidade (0–100): ROI, lucro, volume, procura, liquidez
- Veredito: BOM FLIP / MARGEM CURTA / PASSA

## Deploy

```bash
npm run build
```

Define `ANTHROPIC_API_KEY` nas variáveis de ambiente do Netlify para o modo caça.

## Limitações

- Scrapers dependem de APIs públicas — podem falhar ou ser bloqueados
- eBay/Wallapop/AliExpress no modo caça dependem da web search (não scraper direto ainda)
- Estimativas ≠ garantia — valida sempre anúncios e portes
