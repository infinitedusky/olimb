---
title: Apps as posts
app: Self Evident
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

Two tiers (Sandy: "either self-host or use our approved stack"). The **approved stack is the format**: a
self-contained bundle of Self Evident's known components on the sandboxed browser runtime, a thin shared backend
for state, and a declared capability list the runtime enforces (extended by PR, in the open); it runs in the feed
and the email preview with telemetry we can vouch for. **Self-hosting is the escape hatch**: anyone runs the whole
thing themselves, and an app that needs more than the format allows is published as a link, an external post
with no embedding and no vouched telemetry. The format is open and runs identically hosted or self-hosted; we
host the convenient instance (open core, hosted business).

Cheapest test, no code: run it on Substack itself. A newsletter where every post is an app link, the email as
the vehicle; subscribes, clicks and returning use are the behaviour that costs something.
