import { describe, expect, it } from 'vitest'
import { parseT212Csv, rebuildT212FromCsv } from './t212-csv'

const sampleCsv = `Record Type,Date (UTC),Account currency,Instrument,Symbol,Instrument currency,Direction,Units,Position ID,Order ID,Order type,Intent,Status,Date created (UTC),Date opened (UTC),Date closed (UTC),Average price (instrument currency),Close price (instrument currency),Target price (instrument currency),Executed price (instrument currency),Exchange rate,Spread (account currency),Result (account currency),FX fee (account currency),Result after FX fee (account currency),Overnight interest (account currency),Dividend adjustment (account currency),Total result (account currency),Interest rate (instrument currency),Transaction ID,Transaction type,Amount (account currency)
Order,2026-08-04 09:21:50+00:00,EUR,Germany 40,GER40,EUR,Buy,0.0038160500,POS55200123248,55200123245,MARKET,OPEN,EXECUTED,2026-08-04 09:21:50+00:00,,,,,26205.1000000000,26205.1000000000,,,,,,,,,,,,
Order,2026-08-04 09:21:50+00:00,EUR,Germany 40,GER40,EUR,Sell,0.0038160500,POS55200123248,55200123249,TAKE PROFIT,CLOSE,CANCELLED,2026-08-04 09:21:50+00:00,,,,,27514.9000000000,,,,,,,,,,,,,
Order,2026-08-06 16:22:13+00:00,EUR,Germany 40,GER40,EUR,Sell,0.0038160500,POS55200123248,55310853866,MARKET,CLOSE,EXECUTED,2026-08-06 16:22:13+00:00,,,,,26239.9000000000,26239.9000000000,,,,,,,,,,,,
Closed position,2026-08-06 16:22:13+00:00,EUR,Germany 40,GER40,EUR,Buy,0.0038160500,POS55200123248,55310853866,,,,,2026-08-04 09:21:50+00:00,2026-08-06 16:22:13+00:00,26205.1000000000,26239.9000000000,,,1.0000000000,3.20000,0.13,0.00,0.13,-0.02,0.00,0.11,,,,
Order,2026-08-06 16:40:49+00:00,EUR,Meta Platforms,META,USD,Buy,0.1952572000,POS55310863082,55310863079,MARKET,OPEN,EXECUTED,2026-08-06 16:40:49+00:00,,,,,589.9500000000,589.9500000000,,,,,,,,,,,,
Order,2026-08-06 16:40:49+00:00,EUR,Meta Platforms,META,USD,Sell,0.1952572000,POS55310863082,55310863083,TAKE PROFIT,CLOSE,PENDING,2026-08-06 16:40:49+00:00,,,,,610.0000000000,,,,,,,,,,,,,
`

describe('parseT212Csv', () => {
  it('uses Closed position for PnL and ignores CANCELLED/PENDING', () => {
    const result = parseT212Csv(sampleCsv)
    expect(result.closedTrades).toHaveLength(1)
    expect(result.closedTrades[0].base).toBe('GER40')
    expect(result.closedTrades[0].pnlUsdc).toBeCloseTo(0.11, 2)
    expect(result.closedTrades[0].id).toBe('t212-pos-POS55200123248')
    expect(result.closedTrades[0].side).toBe('long')
    expect(result.executions).toHaveLength(3) // open+close GER40 + open META
    expect(result.openExecutions).toHaveLength(1)
    expect(result.openExecutions[0].instrument).toBe('META')
  })

  it('closes open from earlier CSV when later CSV brings Closed position', () => {
    const openOnly = `Record Type,Date (UTC),Account currency,Instrument,Symbol,Instrument currency,Direction,Units,Position ID,Order ID,Order type,Intent,Status,Date created (UTC),Date opened (UTC),Date closed (UTC),Average price (instrument currency),Close price (instrument currency),Target price (instrument currency),Executed price (instrument currency),Exchange rate,Spread (account currency),Result (account currency),FX fee (account currency),Result after FX fee (account currency),Overnight interest (account currency),Dividend adjustment (account currency),Total result (account currency),Interest rate (instrument currency),Transaction ID,Transaction type,Amount (account currency)
Order,2026-08-06 16:23:25+00:00,EUR,Japan 225,JPN225,JPY,Buy,0.2772493300,POS55310854494,55310854491,MARKET,OPEN,EXECUTED,2026-08-06 16:23:25+00:00,,,,,65813.8000000000,65821.8000000000,,,,,,,,,,,,
`
    const first = parseT212Csv(openOnly)
    expect(first.openExecutions).toHaveLength(1)
    expect(first.closedTrades).toHaveLength(0)

    const laterClose = parseT212Csv(`Record Type,Date (UTC),Account currency,Instrument,Symbol,Instrument currency,Direction,Units,Position ID,Order ID,Order type,Intent,Status,Date created (UTC),Date opened (UTC),Date closed (UTC),Average price (instrument currency),Close price (instrument currency),Target price (instrument currency),Executed price (instrument currency),Exchange rate,Spread (account currency),Result (account currency),FX fee (account currency),Result after FX fee (account currency),Overnight interest (account currency),Dividend adjustment (account currency),Total result (account currency),Interest rate (instrument currency),Transaction ID,Transaction type,Amount (account currency)
Order,2026-08-07 10:00:00+00:00,EUR,Japan 225,JPN225,JPY,Sell,0.2772493300,POS55310854494,999,MARKET,CLOSE,EXECUTED,2026-08-07 10:00:00+00:00,,,,,66000.0000000000,66000.0000000000,,,,,,,,,,,,
Closed position,2026-08-07 10:00:00+00:00,EUR,Japan 225,JPN225,JPY,Buy,0.2772493300,POS55310854494,999,,,,,2026-08-06 16:23:25+00:00,2026-08-07 10:00:00+00:00,65813.8000000000,66000.0000000000,,,0.0055,1.00,0.50,0.00,0.50,-0.01,0.00,0.49,,,,
`)
    const rebuilt = rebuildT212FromCsv(
      [...first.closedPositions, ...laterClose.closedPositions],
      [...first.executions, ...laterClose.executions],
    )
    expect(rebuilt.closedTrades).toHaveLength(1)
    expect(rebuilt.openExecutions).toHaveLength(0)
    expect(rebuilt.closedTrades[0].pnlUsdc).toBeCloseTo(0.49, 2)
  })
})
