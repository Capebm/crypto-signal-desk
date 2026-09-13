"""Drive crypto-signal-desk: apply a fixed setup and run the scan on each tab.

Selectors here are written against the deployed build (branch
cursor/trading-session-execution-window in Capebm/crypto-signal-desk), so they
target the real markup rather than guessing from the rendered page:

  tabs        nav.desk-rail-nav > button   (the active one carries .active)
  settings    <details class="setup-advanced">, collapsed until opened
  toggles     label.tv-setup-toggle > input[type=checkbox], labelled by a <span>
  dropdowns   <select aria-label="Perfil de risco" | "Modo TP" | "Fonte de dados">
  scan        button.setup-reapply ("Aplicar + scan"), else button.agent-scan-btn

Three things about a fresh browser that this has to handle, none of which apply
when you open the site yourself:

  * The app boots into GARIMPO, not the desk -- `active-app` in localStorage is
    what normally sends you straight to the desk, so we seed it before load.
  * The settings live in a <details> that starts closed.
  * On the Agente tab "Aplicar + scan" only exists once a scan has produced
    rows; before that the trigger is "Analisar mercado".

  python run.py                 # apply the setup and scan
  python run.py --dry-run       # report what it would change, touch nothing
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import traceback
from datetime import datetime, timezone

from playwright.sync_api import Error as PWError
from playwright.sync_api import TimeoutError as PWTimeout
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).parent
OUT = HERE / "out"

# Sent before any of the app's own code runs, so it boots into the desk on the
# right tab instead of GARIMPO. Mirrors the keys the app itself writes.
SEED_JS = """
try {
  // Boot straight into the desk instead of GARIMPO...
  localStorage.setItem('active-app', 'crypto');
  // ...and mark the onboarding tour as seen. A fresh browser shows it on every
  // run, and its .agent-modal-bg overlay swallows every click underneath.
  localStorage.setItem('tjr-onboarding-v1', '1');
} catch (e) {}
"""


class Report:
    """One line per action, so a bad run says exactly which control missed."""

    def __init__(self) -> None:
        self.entries: list[dict] = []
        self.failed = False

    def add(self, tab: str, control: str, status: str, detail: str = "") -> None:
        if status == "FAIL":
            self.failed = True
        self.entries.append(
            {"tab": tab, "control": control, "status": status, "detail": detail}
        )
        line = f"  [{status:4}] {tab}/{control}"
        print(f"{line} - {detail}" if detail else line, flush=True)

    def count(self, status: str) -> int:
        return sum(1 for e in self.entries if e["status"] == status)


def dismiss_overlay(page, rep: Report) -> None:
    """Belt and braces: if a modal is up despite the seeded flag, close it."""
    overlay = page.locator(".agent-modal-bg")
    try:
        if not overlay.count() or not overlay.first.is_visible():
            return
        close = overlay.locator('button[aria-label="Fechar"]')
        if close.count():
            close.first.click()
        else:
            overlay.first.press("Escape")
        page.wait_for_timeout(600)
        still = overlay.count() and overlay.first.is_visible()
        rep.add("<app>", "modal", "FAIL" if still else "OK",
                "overlay still blocking clicks" if still else "dismissed")
    except PWError as exc:
        rep.add("<app>", "modal", "FAIL", str(exc).splitlines()[0])


def enter_desk(page, rep: Report) -> bool:
    """The seeded localStorage should land us on the desk; click through if not."""
    rail = page.locator("nav.desk-rail-nav")
    try:
        rail.wait_for(state="visible", timeout=15000)
        return True
    except PWTimeout:
        pass

    switch = page.get_by_role("button", name="Crypto Desk", exact=True)
    try:
        if switch.count():
            switch.first.click()
            rail.wait_for(state="visible", timeout=15000)
            rep.add("<app>", "Crypto Desk", "OK", "switched from GARIMPO")
            return True
    except (PWError, PWTimeout):
        pass

    rep.add("<app>", "desk", "FAIL", "desk navigation never appeared")
    return False


def open_tab(page, name: str, rep: Report) -> bool:
    button = page.locator("nav.desk-rail-nav button").filter(
        has=page.locator(f'span:text-is("{name}")')
    )
    try:
        if not button.count():
            rep.add(name, "<tab>", "FAIL", "tab button not found")
            return False
        button = button.first
        classes = button.get_attribute("class") or ""
        if "active" in classes.split():
            rep.add(name, "<tab>", "OK", "already active")
        else:
            button.click()
            page.wait_for_timeout(1200)
            rep.add(name, "<tab>", "OK", "opened")
        return True
    except PWError as exc:
        rep.add(name, "<tab>", "FAIL", str(exc).splitlines()[0])
        return False


def open_settings(page, tab: str, rep: Report) -> None:
    """The Ajustes <details> is collapsed on load; its controls are unclickable."""
    details = page.locator("details.setup-advanced")
    try:
        if not details.count():
            rep.add(tab, "Ajustes", "FAIL", "settings panel not found")
            return
        details = details.first
        if details.get_attribute("open") is not None:
            rep.add(tab, "Ajustes", "OK", "already open")
            return
        details.evaluate("(d) => { d.open = true; }")
        page.wait_for_timeout(500)
        if details.get_attribute("open") is None:
            rep.add(tab, "Ajustes", "FAIL", "panel did not open")
        else:
            rep.add(tab, "Ajustes", "OK", "opened")
    except PWError as exc:
        rep.add(tab, "Ajustes", "FAIL", str(exc).splitlines()[0])


def apply_preset(page, tab: str, label: str, rep: Report, dry: bool) -> None:
    """A preset chip rewrites several toggles at once, so it runs before them."""
    chip = page.locator("button.preset-chip").filter(has_text=label)
    try:
        if not chip.count():
            rep.add(tab, f"preset {label}", "FAIL", "preset chip not found")
            return
        if dry:
            rep.add(tab, f"preset {label}", "DRY", "would apply")
            return
        chip.first.click()
        page.wait_for_timeout(600)
        rep.add(tab, f"preset {label}", "OK", "applied")
    except PWError as exc:
        rep.add(tab, f"preset {label}", "FAIL", str(exc).splitlines()[0])


def set_select(page, tab: str, aria: str, want: str, rep: Report, dry: bool) -> None:
    sel = page.locator(f'select[aria-label="{aria}"]')
    try:
        if not sel.count():
            rep.add(tab, aria, "FAIL", "dropdown not found")
            return
        sel = sel.first
        current = sel.evaluate(
            "(s) => s.options[s.selectedIndex] ? s.options[s.selectedIndex].text : ''"
        ).strip()
        if current == want:
            rep.add(tab, aria, "OK", f"already {want}")
            return
        if dry:
            rep.add(tab, aria, "DRY", f"would set {current!r} -> {want!r}")
            return
        sel.select_option(label=want)
        page.wait_for_timeout(300)
        after = sel.evaluate(
            "(s) => s.options[s.selectedIndex] ? s.options[s.selectedIndex].text : ''"
        ).strip()
        if after == want:
            rep.add(tab, aria, "OK", f"set {current!r} -> {want!r}")
        else:
            rep.add(tab, aria, "FAIL", f"wanted {want!r}, got {after!r}")
    except PWError as exc:
        rep.add(tab, aria, "FAIL", str(exc).splitlines()[0])


def set_checkbox(page, tab: str, label: str, want: bool, rep: Report, dry: bool) -> None:
    box = page.locator("label.tv-setup-toggle").filter(
        has=page.locator(f'span:text-is("{label}")')
    ).locator('input[type="checkbox"]')
    try:
        if not box.count():
            rep.add(tab, label, "FAIL", "toggle not found")
            return
        box = box.first
        before = box.is_checked()
        if before == want:
            rep.add(tab, label, "OK", f"already {'on' if want else 'off'}")
            return
        if dry:
            rep.add(tab, label, "DRY", f"would set {before} -> {want}")
            return
        # check/uncheck click the box and assert the resulting state themselves.
        box.check() if want else box.uncheck()
        page.wait_for_timeout(300)
        rep.add(tab, label, "OK", f"set {before} -> {want}")
    except (PWError, PWTimeout) as exc:
        rep.add(tab, label, "FAIL", str(exc).splitlines()[0])


def run_scan(page, tab: str, wait_ms: int, rep: Report, dry: bool) -> None:
    """Click whichever trigger this tab is showing and wait for it to finish."""
    for selector, name in (
        ("button.setup-reapply", "Aplicar + scan"),
        ("button.agent-scan-btn", "Analisar"),
    ):
        button = page.locator(selector)
        try:
            if not button.count() or not button.first.is_visible():
                continue
            button = button.first
            if button.is_disabled():
                # Both triggers disable while a scan runs and when T212 judges
                # the market closed -- the label says which.
                rep.add(tab, name, "WARN", f"disabled ({button.inner_text().strip()})")
                return
            if dry:
                rep.add(tab, name, "DRY", "would click")
                return
            button.click()
            page.wait_for_timeout(1500)
            # The button re-enables when the scan completes.
            try:
                page.wait_for_function(
                    "(sel) => { const b = document.querySelector(sel);"
                    " return b && !b.disabled; }",
                    arg=selector,
                    timeout=wait_ms,
                )
                rep.add(tab, name, "OK", "scan completed")
            except PWTimeout:
                rep.add(tab, name, "WARN", f"still running after {wait_ms // 1000}s")
            return
        except PWError:
            continue

    rep.add(tab, "scan", "FAIL", "no scan button found")


def collect_results(page) -> dict:
    """The headline tiles plus any data-failure notice, so the report is
    readable without opening the screenshot."""
    return page.evaluate("""() => {
      const out = {};
      // The KPI row is a <section> of <article><span>label</span><strong>value</strong>.
      document.querySelectorAll('article').forEach(el => {
        const label = el.querySelector(':scope > span');
        const value = el.querySelector(':scope > strong');
        if (label && value) {
          const k = label.innerText.trim();
          if (k && !(k in out)) out[k] = value.innerText.trim();
        }
      });
      const fail = Array.from(document.querySelectorAll('p, div'))
        .map(e => (e.innerText || '').trim())
        .find(t => t.startsWith('Dados falharam:'));
      if (fail) out['_dados_falharam'] = fail.slice(0, 300);
      return out;
    }""")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the crypto-signal-desk scan.")
    parser.add_argument("--dry-run", action="store_true", help="report only")
    parser.add_argument("--config", default=str(HERE / "config.json"))
    parser.add_argument("--headed", action="store_true", help="show the browser")
    parser.add_argument("--chromium", default=None, help="Chromium executable path")
    args = parser.parse_args()

    cfg = json.loads(pathlib.Path(args.config).read_text(encoding="utf-8"))
    OUT.mkdir(exist_ok=True)
    rep = Report()
    results: dict = {}
    started = datetime.now(timezone.utc)
    print(f"crypto-signal-desk @ {started.isoformat(timespec='seconds')}")
    print(f"  {cfg['url']}  dry_run={args.dry_run}", flush=True)

    launch: dict = {"headless": not args.headed}
    if args.chromium:
        launch["executable_path"] = args.chromium

    with sync_playwright() as p:
        browser = p.chromium.launch(**launch)
        context = browser.new_context(
            viewport=cfg.get("viewport", {"width": 1280, "height": 1800}),
            locale="pt-PT",
            timezone_id="Europe/Lisbon",
        )
        # Notification permission is requested by the Alertas toggles; granting
        # it up front stops a prompt from swallowing a click.
        try:
            context.grant_permissions(["notifications"], origin=cfg["url"])
        except PWError:
            pass
        page = context.new_page()
        page.set_default_timeout(20000)
        page.add_init_script(SEED_JS)

        try:
            page.goto(cfg["url"], wait_until="domcontentloaded", timeout=60000)
            try:
                page.wait_for_load_state("networkidle", timeout=30000)
            except PWTimeout:
                pass
            page.wait_for_timeout(cfg.get("settle_ms", 2500))

            dismiss_overlay(page, rep)

            if enter_desk(page, rep):
                for tab in cfg["tabs"]:
                    name = tab["name"]
                    print(f"\n== {name} ==", flush=True)
                    if not open_tab(page, name, rep):
                        continue
                    open_settings(page, name, rep)
                    for preset in tab.get("presets", []):
                        apply_preset(page, name, preset, rep, args.dry_run)
                    for aria, want in tab.get("selects", {}).items():
                        set_select(page, name, aria, want, rep, args.dry_run)
                    for label, want in tab.get("checkboxes", {}).items():
                        set_checkbox(page, name, label, bool(want), rep, args.dry_run)
                    run_scan(
                        page, name, cfg.get("scan_wait_ms", 180000), rep, args.dry_run
                    )
                    try:
                        found = collect_results(page)
                    except PWError:
                        found = {}
                    if found.get("_dados_falharam"):
                        rep.add(name, "dados", "WARN", found["_dados_falharam"][:120])
                    results[name] = found
                    page.screenshot(
                        path=str(OUT / f"{name.lower()}.png"), full_page=True
                    )
        except Exception:
            rep.add("<session>", "<run>", "FAIL", traceback.format_exc().splitlines()[-1])
            traceback.print_exc()
            try:
                page.screenshot(path=str(OUT / "error.png"), full_page=True)
            except PWError:
                pass
        finally:
            browser.close()

    summary = {
        "started": started.isoformat(timespec="seconds"),
        "finished": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "url": cfg["url"],
        "dry_run": args.dry_run,
        "ok": not rep.failed,
        "results": results,
        "entries": rep.entries,
    }
    (OUT / "report.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False))
    print(
        f"\n{len(rep.entries)} actions, {rep.count('FAIL')} failed,"
        f" {rep.count('WARN')} skipped"
    )
    return 1 if rep.failed else 0


if __name__ == "__main__":
    sys.exit(main())
