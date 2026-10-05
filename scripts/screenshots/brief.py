"""A one-page PDF brief for the demo's Coursework 2 attachment. Usage: brief.py OUT.pdf (needs reportlab)."""

import sys

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

s = getSampleStyleSheet()
doc = SimpleDocTemplate(sys.argv[1], pagesize=A4, leftMargin=60, rightMargin=60, topMargin=60)
P = lambda t, st="BodyText": Paragraph(t, s[st])
body = [
    P("COMP2011 Algorithms &amp; Data Structures", "Title"),
    P("Coursework 2: Dynamic programming · 20% of the module · Deadline Friday 27 November 2026, 17:00", "Italic"),
    Spacer(1, 10), P("Overview", "Heading2"),
    P("Design, implement and analyse dynamic programming solutions to the three problems below. For each problem, "
      "state the subproblem, give the recurrence with its base cases, and justify the running time and memory use."),
    P("Problems", "Heading2"),
    P("<b>1. Edit distance.</b> Given strings <i>a</i> and <i>b</i>, compute the minimum number of insertions, deletions "
      "and substitutions that turn <i>a</i> into <i>b</i>, and recover one optimal alignment."),
    P("<b>2. 0/1 knapsack.</b> Given <i>n</i> items with integer weights and values and a capacity <i>W</i>, maximise the "
      "total value. Your solution must use O(W) memory."),
    P("<b>3. Longest increasing subsequence.</b> Return the length and one witness subsequence in O(n log n) time."),
    P("Marking", "Heading2"),
]
t = Table([["Component", "Marks"], ["Correct recurrences and base cases", "30"], ["Implementation and tests", "35"],
           ["Complexity analysis", "20"], ["Report clarity (max 4 pages)", "15"]], colWidths=[330, 80])
t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, colors.grey), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                       ("BACKGROUND", (0, 0), (-1, 0), colors.whitesmoke)]))
doc.build(body + [t])
