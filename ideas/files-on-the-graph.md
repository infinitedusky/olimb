---
title: Files on the graph
app: Self Evident
lane: building
hypothesis: When a shared file is a node of its own between the phases that claim it, a person reading the graph sees why a phase waits without opening it, and plans get written with fewer collisions.
measure: phase.held reasons that name a file; time a phase spends held over a file; how often a plan's phases share a file at all
baseline: Held reasons said "shares files with phase #N"; the graph drew nothing for it. On the schedule plan (homework-gate #21), three phases waited on api.py and the graph showed three plain boxes.
look_by: 2026-11-05
prs:
  - https://github.com/infinitedusky/self-evident/pull/__
---
Sandy, 2026-10-22, watching the schedule plan run: "if it shares the file and it's going to go second, then it should be
dependent on it", then "the dependency is on the file, not the phase", then "put the file on the graph and connect the
phases to it".

The model is the action graph (Bazel: actions and artifacts; Make: targets are files; Dagster moved from ops to assets
for the same reason): two kinds of node. A phase claims files; a file claimed by more than one open phase is drawn as a
node between them. The phase that has it points at the file, the file points at the ones waiting; with nobody holding it
yet, the claimants hang off it undecided. The held reason reads off the graph: "waiting on phase #10 (api.py)". The
scheduler is unchanged: a claim is still a Petri-net place with one token.

Next, on the same model: a claim with a mode. An append (new routes at the end of a file, a new table) is a place with
many tokens: no hold, git merges it at landing, only a true overlap conflicts and re-runs. Then three phases adding
routes to api.py run together.
