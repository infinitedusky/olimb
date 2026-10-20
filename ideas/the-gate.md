---
title: The gate
app: Homework Gate
lane: building
hypothesis: Locked by default with an earned unlock period gets homework done before free time on most school nights, with few parent interventions.
measure: gate_changed (opened after "homework done" vs "you opened it"), parent_action per night
baseline: Before the gate, Downtime was flipped by hand every night.
look_by: 2026-11-17
prs:
  - https://github.com/infinitedusky/homework-gate/pull/7
  - https://github.com/infinitedusky/homework-gate/pull/8
---
Locked unless it's inside an unlock period (3–10 pm); inside, it opens when he turns in tonight's homework and passes
the quiz, or a parent opens it. Allowlist-only: everything but Google Classroom is blocked while locked.
