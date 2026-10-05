"""README screenshots from the seeded demo server. Usage: shots.py OUT_DIR [name ...] (default: all).

Uses the system Chromium at $CHROMIUM (default /usr/bin/chromium) when it exists, else Playwright's own
(`uv run --with playwright playwright install chromium`)."""

import os
import sys
from datetime import datetime

import httpx
from playwright.sync_api import sync_playwright

BASE = f"http://127.0.0.1:{os.environ.get('PORT', '8800')}"
OUT = sys.argv[1]
ONLY = set(sys.argv[2:])
api = httpx.Client(base_url=BASE + "/api")
NOW = datetime(2026, 11, 19, 10, 30)

ids = {a["title"] + "|" + str(a["module_id"]): a["id"] for a in api.get("/assignments").json()}
mods = {m["name"]: m["id"] for m in api.get("/modules").json()}
subs = {s["title"]: s["id"] for s in api.get("/submodules").json()}
ALG, LA = mods["Algorithms"], mods["Linear Algebra"]
CW2 = ids[f"Coursework 2: Dynamic programming|{ALG}"]
LA_EXAM = ids[f"Final exam|{LA}"]
EIGEN = subs["Eigenvalues & Eigenvectors"]
eigen_session = next(
    s["id"] for s in api.get("/revision-sessions", params={"assignment_id": LA_EXAM}).json()
    if any(t["title"] == "Eigenvalues & Eigenvectors" for t in s["submodules"])
)


def theme(mode):
    api.patch("/settings", json={"theme_mode": mode})


def settle(page, ms=900):
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(ms)  # entrance animations, KaTeX, grid layout


shots = {}


def shot(name, size=(1440, 900)):
    def register(fn):
        shots[name] = (fn, size)
        return fn
    return register


@shot("overview", (1440, 1300))
def _(page):
    page.goto(BASE + "/"); settle(page, 1500)


@shot("overview-dark", (1440, 1300))
def _(page):
    theme("dark")
    try:
        page.goto(BASE + "/"); settle(page, 1500)
        page.screenshot(path=f"{OUT}/overview-dark.png")
    finally:
        theme("light")
    return True


@shot("edit-layout", (1440, 1300))
def _(page):
    page.goto(BASE + "/"); settle(page)
    page.get_by_role("button", name="Edit layout").click(); settle(page, 700)


@shot("module")
def _(page):
    page.goto(f"{BASE}/modules/{ALG}"); settle(page, 1200)


@shot("notes")
def _(page):
    page.goto(f"{BASE}/modules/{LA}/submodules/{EIGEN}"); settle(page, 1500)


@shot("flashcards")
def _(page):
    page.goto(f"{BASE}/modules/{LA}/submodules/{EIGEN}"); settle(page, 1200)
    page.get_by_role("button", name="Study").first.click(); settle(page, 700)
    page.keyboard.press("Space"); settle(page, 700)


@shot("assignment")
def _(page):
    page.goto(f"{BASE}/modules/{ALG}/assignments/{CW2}"); settle(page, 2500)


@shot("assignment-exam")
def _(page):
    page.goto(f"{BASE}/modules/{LA}/assignments/{LA_EXAM}"); settle(page, 1500)


@shot("revision-plan")
def _(page):
    page.goto(f"{BASE}/modules/{ALG}/assignments/{ids[f'Final exam|{ALG}']}"); settle(page, 1200)
    page.get_by_role("button", name="Plan revision").click(); settle(page, 700)
    page.evaluate("document.activeElement.blur()"); settle(page, 300)


@shot("revision-session")
def _(page):
    page.goto(f"{BASE}/modules/{LA}/assignments/{LA_EXAM}?session={eigen_session}"); settle(page, 1500)


@shot("settings-ai")
def _(page):
    page.goto(BASE + "/"); settle(page)
    page.get_by_role("button", name="Settings").first.click(); settle(page, 500)
    page.get_by_role("button", name="AI Integration").click(); settle(page, 700)


with sync_playwright() as p:
    chromium = os.environ.get("CHROMIUM", "/usr/bin/chromium")
    browser = p.chromium.launch(executable_path=chromium if os.path.exists(chromium) else None)
    for name, (fn, (w, h)) in shots.items():
        if ONLY and name not in ONLY:
            continue
        context = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=2, color_scheme="light")
        page = context.new_page()
        page.clock.set_fixed_time(NOW)
        done = fn(page)
        if not done:
            page.screenshot(path=f"{OUT}/{name}.png")
        print("captured", name)
        context.close()
    browser.close()
