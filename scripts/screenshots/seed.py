"""Seeds the README demo: a 2nd-year CS semester, "today" = Thu 19 Nov 2026 10:30. Talks to the demo server only."""

import sys
from datetime import date, datetime, timedelta

import httpx

BASE = sys.argv[1]  # http://127.0.0.1:PORT/api
BRIEF = sys.argv[2]
c = httpx.Client(base_url=BASE, timeout=60)
assert c.get("/modules").json() == [], "demo database isn't empty"


def post(path, **json):
    r = c.post(path, json=json)
    assert r.status_code in (200, 201), (path, r.status_code, r.text)
    return r.json()


def patch(path, **json):
    r = c.patch(path, json=json)
    assert r.status_code == 200, (path, r.status_code, r.text)
    return r.json()


SEM_START = date(2026, 9, 28)  # Monday, week 1
WEEKS = 11


def weekly(module, title, weekday, hour, minute, minutes, location):
    ids = []
    for week in range(WEEKS):
        day = SEM_START + timedelta(days=7 * week + weekday)
        when = datetime(day.year, day.month, day.day, hour, minute)
        ids.append(post("/lectures", module_id=module, title=title, scheduled_at=when.isoformat(),
                        duration_minutes=minutes, location=location, week_number=week + 1)["id"])
    return ids


mods = {}
for key, name, code, color in [
    ("os", "Operating Systems", "COMP2021", "#0ea5e9"),
    ("la", "Linear Algebra", "MATH2040", "#14b8a6"),
    ("db", "Databases", "COMP2031", "#f59e0b"),
    ("alg", "Algorithms", "COMP2011", "#6366f1"),
]:
    mods[key] = post("/modules", name=name, code=code, color=color, term="Semester 1", credits=15)["id"]

lec = {
    "alg": weekly(mods["alg"], "Lecture", 0, 11, 0, 60, "Rutherford LT1") + weekly(mods["alg"], "Lab", 3, 14, 0, 120, "Computer Science Lab 2"),
    "os": weekly(mods["os"], "Lecture", 1, 9, 0, 60, "Wills G25") + weekly(mods["os"], "Tutorial", 4, 13, 0, 60, "MVB 1.11"),
    "la": weekly(mods["la"], "Lecture", 2, 10, 0, 60, "Fry LT") + weekly(mods["la"], "Problem class", 0, 15, 0, 60, "Fry G.10"),
    "db": weekly(mods["db"], "Lecture", 2, 12, 0, 60, "Queens 1.40") + weekly(mods["db"], "Lab", 4, 10, 0, 120, "MVB 2.11"),
}

# --- topics ---------------------------------------------------------------------------------------------

EIGEN = r"""# Eigenvalues & Eigenvectors

:::columns
An **eigenvector** of $A$ is a nonzero $v$ with $Av = \lambda v$, and $\lambda$ is its **eigenvalue**.

Find the eigenvalues as the roots of the **characteristic polynomial** $\det(A - \lambda I)$, then each eigenvector by solving $(A - \lambda I)v = 0$.
:::side Quick checks
- $\operatorname{tr}(A) = \sum \lambda_i$
- $\det(A) = \prod \lambda_i$
- Triangular $A$: eigenvalues sit on the diagonal
:::

$$\det(A - \lambda I) = 0$$

> [!tip] Check before you solve
> Add up your eigenvalues and compare with the trace before working out any eigenvectors.

## Worked example

$$A = \begin{pmatrix} 2 & 1 \\ 1 & 2 \end{pmatrix}, \qquad \det(A - \lambda I) = (2-\lambda)^2 - 1 = 0 \implies \lambda \in \{1, 3\}$$

- $\lambda = 3$: $v = (1, 1)^T$
- $\lambda = 1$: $v = (1, -1)^T$

If $A$ has $n$ linearly independent eigenvectors it is **diagonalisable**: $A = PDP^{-1}$. See [[Diagonalisation]].
"""

topics = {
    "la": [
        ("Vector Spaces & Subspaces", "# Vector Spaces & Subspaces\n\nA **subspace** is closed under addition and scalar multiplication, and contains $\\mathbf{0}$.\n\n> [!warning] Common slip\n> Check the zero vector first: it's the quickest way to rule a set out.\n"),
        ("Linear Maps", "# Linear Maps\n\n$T(\\alpha u + \\beta v) = \\alpha T(u) + \\beta T(v)$.\n\n**Rank–nullity:** $\\operatorname{rank}(T) + \\operatorname{nullity}(T) = \\dim V$.\n"),
        ("Eigenvalues & Eigenvectors", EIGEN),
        ("Diagonalisation", "# Diagonalisation\n\n$A = PDP^{-1}$ where the columns of $P$ are eigenvectors. Then $A^k = PD^kP^{-1}$.\n"),
    ],
    "alg": [
        ("Graph Traversal", "# Graph Traversal\n\nBFS finds shortest paths in unweighted graphs; DFS gives discovery/finish times.\n"),
        ("Shortest Paths", "# Shortest Paths\n\n**Dijkstra** relaxes edges in order of distance using a priority queue: $O((V+E)\\log V)$.\n\n> [!warning] Negative edges\n> Dijkstra breaks with negative weights: use Bellman–Ford.\n"),
        ("Topological Sort", "# Topological Sort\n\nOrder a DAG by reverse DFS finish time, or Kahn's algorithm with in-degrees.\n"),
        ("Hash Tables", "# Hash Tables\n\nExpected $O(1)$ lookup with a good hash and load factor $\\alpha < 1$.\n"),
        ("Dynamic Programming", "# Dynamic Programming\n\nOptimal substructure + overlapping subproblems. Write the recurrence first, then choose top-down or bottom-up.\n"),
    ],
    "os": [
        ("Processes & Threads", "# Processes & Threads\n\nA process owns an address space; threads share it.\n"),
        ("Scheduling", "# Scheduling\n\nRound robin, MLFQ, and the convoy effect under FCFS.\n"),
        ("Memory Management", "# Memory Management\n\nPaging, TLBs and page replacement (FIFO, LRU, Clock).\n"),
        ("Concurrency", "# Concurrency\n\nMutexes, condition variables and the four Coffman conditions for deadlock.\n"),
    ],
    "db": [
        ("ER Modelling", "# ER Modelling\n\nEntities, relationships, cardinalities, weak entities.\n"),
        ("Normalisation", "# Normalisation\n\n1NF → 2NF → 3NF → BCNF. A table is in BCNF when every determinant is a candidate key.\n"),
        ("SQL Joins", "# SQL Joins\n\nInner, left, right and full outer joins.\n"),
    ],
}
sub = {}
for key, items in topics.items():
    for title, body in items:
        sub[title] = post("/submodules", module_id=mods[key], title=title, content_markdown=body)["id"]

# Topics covered by past lectures (Linear Algebra lectures, in order).
la_lectures = lec["la"][:WEEKS]
for i, title in enumerate(["Vector Spaces & Subspaces", "Vector Spaces & Subspaces", "Linear Maps", "Linear Maps",
                           "Eigenvalues & Eigenvectors", "Eigenvalues & Eigenvectors", "Diagonalisation"]):
    r = c.put("/lectures/submodules", json={"lecture_ids": [la_lectures[i]], "submodule_ids": [sub[title]]})
    assert r.status_code == 200, r.text

# --- assignments ----------------------------------------------------------------------------------------


def assignment(key, title, weight, due, status="not_started", earned=None, maximum=None, **extra):
    return post("/assignments", module_id=mods[key], title=title, weight_percent=weight, due_at=due.isoformat(),
                status=status, grade_earned=earned, grade_max=maximum, **extra)["id"]


d = datetime
assignment("alg", "Lab 1: Sorting benchmarks", 5, d(2026, 10, 9, 17), "graded", 18, 20)
assignment("alg", "Coursework 1: Route planner", 20, d(2026, 10, 23, 17), "graded", 34, 40)
assignment("alg", "Lab 2: Hash table internals", 5, d(2026, 11, 6, 17), "graded", 17, 20)
cw2 = assignment(
    "alg", "Coursework 2: Dynamic programming", 20, d(2026, 11, 27, 17),
    description="Solve the three DP problems in the brief and write up the recurrences.",
    notes_markdown=r"""## Approach

1. **Edit distance**: classic table, $O(nm)$ time. Recurrence:

$$D[i][j] = \min\big(D[i-1][j] + 1,\ D[i][j-1] + 1,\ D[i-1][j-1] + [a_i \ne b_j]\big)$$

2. **Knapsack**: 1-D rolling array to keep memory at $O(W)$.
3. **Longest increasing subsequence**: patience sorting for $O(n \log n)$.

> [!info] Submission
> Report max **4 pages**. Include a complexity table and at least one worked example per problem.

Office hours: Tuesday 2–3pm, Dr. Patel.
""",
)
assignment("alg", "Final exam", 50, d(2027, 1, 14, 9, 30), kind="exam", duration_minutes=120, location="Sports Hall")

assignment("os", "Quiz 1: Processes", 5, d(2026, 10, 12, 9), "graded", 8, 10)
assignment("os", "Quiz 2: Scheduling", 5, d(2026, 10, 26, 9), "graded", 7, 10)
assignment("os", "Coursework: Shell", 25, d(2026, 11, 13, 17), "submitted")
assignment("os", "Quiz 3: Memory management", 5, d(2026, 11, 23, 9))
assignment("os", "Final exam", 60, d(2027, 1, 18, 14), kind="exam", duration_minutes=120, location="Main Hall")

for n, (due, earned) in enumerate([(d(2026, 10, 8, 12), 9), (d(2026, 10, 22, 12), 8), (d(2026, 11, 5, 12), 10), (d(2026, 11, 12, 12), 7)], 1):
    assignment("la", f"Problem sheet {n}", 5, due, "graded", earned, 10)
assignment("la", "Problem sheet 5", 5, d(2026, 11, 26, 12))
assignment("la", "Midterm", 20, d(2026, 11, 2, 10), "graded", 31, 40, kind="exam", duration_minutes=60, location="Fry LT")
la_exam = assignment(
    "la", "Final exam", 50, d(2027, 1, 12, 9, 30), kind="exam", duration_minutes=180, location="Main Hall",
    description="Four questions, all compulsory. No calculators.",
    covered_submodule_ids=[sub[t] for t, _ in topics["la"]],
    notes_markdown=r"""## Strategy

Past papers follow the same shape: one proof, one computation, two mixed questions. Eigenvalues come up **every year**.

> [!tip] From the revision lecture
> Always state the theorem you're using. Method marks are given even when the arithmetic slips.

### Formulas to know cold

- Rank–nullity: $\operatorname{rank}(T) + \operatorname{nullity}(T) = \dim V$
- Change of basis: $[T]_{\mathcal C} = P^{-1}[T]_{\mathcal B}P$
- Powers: $A^k = PD^kP^{-1}$

### Weak spots

- Proving a set is a subspace (closure, *and* the zero vector)
- Spotting when a repeated eigenvalue breaks diagonalisability
""",
)

assignment("db", "Coursework 1: ER design", 30, d(2026, 10, 30, 17), "graded", 33, 40)
db_test = assignment("db", "Class test", 20, d(2026, 12, 3, 10), kind="exam", duration_minutes=50, location="Queens 1.40",
                     covered_submodule_ids=[sub["ER Modelling"], sub["Normalisation"]])
assignment("db", "Coursework 2: Query optimisation", 50, d(2026, 12, 11, 17))

for text, done in [("Edit distance + tests", True), ("Knapsack (rolling array)", True), ("LIS in O(n log n)", False),
                   ("Complexity table", False), ("Write report", False)]:
    t = post(f"/assignments/{cw2}/todos", text=text)
    if done:
        patch(f"/assignments/{cw2}/todos/{t['id']}", done=True)
for text, done in [("Past paper 2025", True), ("Past paper 2024", False), ("Redo problem sheet 4", False),
                   ("Formula sheet from memory", False)]:
    t = post(f"/assignments/{la_exam}/todos", text=text)
    if done:
        patch(f"/assignments/{la_exam}/todos/{t['id']}", done=True)
with open(BRIEF, "rb") as f:
    r = c.post(f"/assignments/{cw2}/attachments", files={"file": ("CW2 brief.pdf", f, "application/pdf")})
    assert r.status_code == 201, r.text

# --- flashcards (with review history, so weakness and "due" vary) --------------------------------------

cards = {
    "Eigenvalues & Eigenvectors": [
        (r"Equation for the eigenvalues of $A$?", r"$\det(A - \lambda I) = 0$", [5, 2, 4, 5]),
        (r"Eigenvalues of $\begin{pmatrix} 2 & 1 \\ 1 & 2 \end{pmatrix}$?", r"$\lambda = 1, 3$", [2, 4, 1, 4]),
        (r"Sum of the eigenvalues equals…?", r"$\operatorname{tr}(A)$", [4]),
        (r"Product of the eigenvalues equals…?", r"$\det(A)$", [2, 4]),
    ],
    "Diagonalisation": [
        (r"When is $A$ diagonalisable?", "When it has $n$ linearly independent eigenvectors.", [4, 5]),
        (r"$A^k$ for diagonalisable $A$?", r"$PD^kP^{-1}$", [3]),
    ],
    "Linear Maps": [
        ("Rank–nullity theorem?", r"$\operatorname{rank}(T) + \operatorname{nullity}(T) = \dim V$", [2, 1, 3]),
        ("Kernel of $T$?", r"$\{v : T(v) = 0\}$", [4]),
    ],
    "Vector Spaces & Subspaces": [
        ("Three subspace conditions?", "Contains 0, closed under + and scalar ×.", [3, 4]),
    ],
    "Shortest Paths": [
        ("Dijkstra's running time with a binary heap?", r"$O((V + E)\log V)$", [4, 5]),
        ("Why does Dijkstra fail with negative edges?", "A settled vertex's distance can still decrease.", [2]),
        ("Algorithm for negative edge weights?", "Bellman–Ford, $O(VE)$", []),
    ],
    "Hash Tables": [("Expected lookup cost?", "$O(1 + \\alpha)$", [5]), ("Open addressing vs chaining?", "Probe within the table vs lists per bucket.", [])],
    "Dynamic Programming": [("Two properties DP needs?", "Optimal substructure and overlapping subproblems.", []),
                            ("LIS in $O(n \\log n)$?", "Patience sorting with binary search.", [])],
    "Graph Traversal": [("BFS finds…?", "Shortest paths in unweighted graphs.", [])],
    "Memory Management": [("What does the TLB cache?", "Page-table entries (virtual → physical).", [3]),
                          ("Clock algorithm approximates…?", "LRU", [])],
    "Scheduling": [("Convoy effect?", "Short jobs stuck behind a long one under FCFS.", []),
                   ("MLFQ demotes a job when…?", "It uses its whole time slice.", [])],
    "Concurrency": [("Coffman conditions?", "Mutual exclusion, hold-and-wait, no preemption, circular wait.", [])],
    "Processes & Threads": [("What do threads share?", "Address space, heap, open files.", [])],
    "Normalisation": [("BCNF?", "Every determinant is a candidate key.", [2]), ("3NF allows…?", "Non-key → key dependencies.", [])],
    "ER Modelling": [("Weak entity?", "Identified through its owner's key plus a partial key.", [])],
}
module_of = {title: key for key, items in topics.items() for title, _ in items}
for topic, items in cards.items():
    for front, back, qualities in items:
        card = post("/flashcards", module_id=mods[module_of[topic]], submodule_id=sub[topic], front=front, back=back)
        for q in qualities:
            post(f"/flashcards/{card['id']}/review", quality=q)

# --- revision plans, busy time, to-dos, notepad, settings ---------------------------------------------

post(f"/assignments/{la_exam}/revision-plan", start_date="2026-11-20", weekdays=[1, 4], session_minutes=90)
post(f"/assignments/{db_test}/revision-plan", start_date="2026-11-19", weekdays=[0, 1, 2, 3, 4], session_minutes=60)
post("/personal-events", title="Football training", weekdays=[3], start_time="18:30", end_time="20:00", valid_from="2026-09-01")
post("/personal-events", title="Café shift", weekdays=[5], start_time="10:00", end_time="16:00", valid_from="2026-09-01")
for text in ["Email Dr. Patel about CW2 extension", "Return library books", "Book OS office hours", "Print problem sheet 5"]:
    post("/quick-todos", text=text)
patch("/quick-note", content="Group project: meet Thursday 4pm in the library, room 3B.\n\nAsk in OS tutorial: why does Clock approximate LRU?\n\nDB class test covers ER + normalisation only, no SQL.")
patch("/settings", setup_completed=True, anthropic_api_key="sk-ant-demo-key-for-screenshots")
# The Overview layout in the screenshots. Respect each widget's minH (calendar 6, progress 4), or the grid
# reflows the board and pushes widgets off the bottom.
patch("/settings", dashboard_layout=[
    {"i": "calendar", "x": 0, "y": 0, "w": 6, "h": 7},
    {"i": "upcoming", "x": 6, "y": 0, "w": 3, "h": 4},
    {"i": "revisionToday", "x": 6, "y": 4, "w": 3, "h": 3},
    {"i": "progress", "x": 9, "y": 0, "w": 3, "h": 4},
    {"i": "notepad", "x": 9, "y": 4, "w": 3, "h": 3},
    {"i": "agenda", "x": 0, "y": 7, "w": 4, "h": 4},
    {"i": "todo", "x": 4, "y": 7, "w": 4, "h": 4},
    {"i": "flashcardsDue", "x": 8, "y": 7, "w": 4, "h": 4},
    {"i": "modules", "x": 0, "y": 11, "w": 12, "h": 3},
])
print("seeded", {k: len(v) for k, v in topics.items()}, "eigen", sub["Eigenvalues & Eigenvectors"], "cw2", cw2, "la_exam", la_exam,
      "mods", mods)
