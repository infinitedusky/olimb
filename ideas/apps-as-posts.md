---
title: Apps as posts
app: Idea Factory
lane: parked
hypothesis: If apps are as cheap to make as posts, a Substack-shaped feed where each post is a small, self-evident app finds readers who subscribe and come back to use them.
measure: subscribed, post_opened, app_opened, app_returned (same reader, later day); per post, like a read rate.
baseline: None. Nobody publishes apps to subscribers; the closest are Observable notebooks and Val.town's feed.
look_by:
prs: []
---
A distribution layer like Substack, where the posts are apps: a concept you use rather than read about. The
factory already gives every app its demonstration and telemetry, so a post is the app showing itself and the
telemetry is its read rate. Lineage: explorable explanations (Bret Victor), playable essays (Nicky Case),
Observable, Glitch, Val.town, Artifacts.

Design that survives the graveyard (Glitch shut app hosting in 2025; Observable went enterprise; the GPT Store
fizzled): a post is a self-contained app that runs in the reader's browser, built from the factory's known
components on a sandboxed runtime, with a thin shared backend only for state. A publishing format, not a
code-hosting platform.

Cheapest test, no code: run it on Substack itself. A newsletter where every post is an app link, the email as
the vehicle; subscribes, clicks and returning use are the behaviour that costs something.
