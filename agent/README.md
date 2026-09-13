# Scheduled scan agent

Every 30 minutes, opens the deployed desk, forces the **Agente** and **T212**
tabs to a fixed setup, and runs the scan on each. Screenshots and a per-action
`report.json` are uploaded as workflow artifacts.

It drives the public site the same way a person would — it is not wired into the
app's internals, and it changes nothing in this repo.

## The setup it enforces

`config.json` holds the desired state; edit that rather than the code.

| Tab | Control | State |
| --- | --- | --- |
| Agente | Long após H / Disciplina (toggle) / Evitar NY mid | off |
| Agente | Malha larga / Todos setups | **on** |
| T212 | preset **Estrito** | applied first |
| T212 | Risco / TP / Dados | Agressivo · 1R · Twelve Data |
| T212 | Malha larga / Todos setups | **on** |
| T212 | CFD prático / Disciplina (toggle) | off |
| Both | Alertas | **on** |
| T212 | Watchlist extras | all selected (135 = 11 core + 124 extras) |

`Selecionar todos` only means *all* extras while the watchlist's class filter is
on **Todos**; under **Crypto** it relabels itself to `Selecionar Binance live`
and picks only the Binance-backed pairs. The agent therefore selects the Todos
filter first, then clicks it.

**Alertas turns on the toggle, but no notification reaches you from a scheduled
run.** They are browser notifications, delivered to the browser that raised them
— on GitHub's runner that is a headless Chromium which is destroyed when the job
ends. The toggle is set so the scan behaves identically to your own session; to
actually be alerted, keep the desk open somewhere, or wire the scan results in
`report.json` to a real notification channel.

Estrito is applied **before** everything else on purpose: it is a preset that
rewrites several toggles at once, so it has to land first or it would undo the
values set after it.

The Agente tab's own Risco/TP are deliberately left alone — they weren't part of
the requested setup. Add them to `config.json` under `selects` (`"Perfil de
risco"`, `"Modo TP"`) if you want them pinned too.

## What a fresh browser has to get past

None of this is visible when you open the site yourself, because your browser
already has the state. A CI browser starts empty every run, so the agent:

- seeds `active-app=crypto`, or the app boots into **GARIMPO** instead of the desk;
- seeds `tjr-onboarding-v1`, or the onboarding modal's overlay swallows every click;
- forces the `Ajustes` `<details>` open, since its controls are unclickable while collapsed;
- on the Agente tab falls back to **Analisar mercado**, because **Aplicar + scan**
  only renders once a scan has produced rows.

## Reading a run

Each action reports `OK` / `WARN` / `FAIL`, and the run exits non-zero if
anything failed:

- **FAIL** — a control wasn't found, or a value didn't take. Something in the UI
  moved; the selectors need updating.
- **WARN** — nothing was wrong to act on: the scan button was disabled (T212
  shows `Mercado fechado` at weekends), or the scan came back with
  `Dados falharam: …` for some symbols.

`report.json` also captures the headline tiles (LONG JÁ, SHORT JÁ, AGUARDAR,
INSTRUMENTOS), so you can read a run without opening the screenshots.

## Running it

On the schedule, by itself. By hand: **Actions → crypto-signal-desk scan → Run
workflow** (tick *dry run* to see what it would change without changing it).

Locally:

```bash
pip install -r agent/requirements.txt
python -m playwright install chromium
python agent/run.py --dry-run    # report only
python agent/run.py              # apply and scan
python agent/run.py --headed     # watch it work
```

## Scheduling caveats

- GitHub's cron is best-effort: `*/30` means *about* every 30 minutes, and runs
  are delayed at peak times. It is not a precise 30-minute tick.
- Scheduled workflows only run from the **default branch**, and GitHub disables
  them after 60 days without repository activity.
- The scan runs against whatever is deployed at the URL in `config.json`.
