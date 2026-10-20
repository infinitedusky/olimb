---
title: PostHog telemetry
app: Homework Gate
lane: building
hypothesis: Counts, timings and outcomes from every night show where the evening hurts, without any homework text leaving the house.
measure: assignment_added, tutor_replied, work_checked, quiz_submitted, gate_changed, $ai_generation
baseline: None — nothing measured before.
look_by: 2026-11-03
prs:
  - https://github.com/infinitedusky/homework-gate/pull/9
---
Waiting on the PostHog project token. A test fails if any event carries text from the night.
