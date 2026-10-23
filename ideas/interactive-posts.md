---
title: Interactive posts
app: Self Evident
lane: parked
hypothesis: If an interactive post is as cheap to make as a written one, a Substack-shaped feed of them finds readers who subscribe and come back, because a post that lets you try the claim proves itself.
measure: subscribed, post_opened, interacted (first interaction with the post's element), app_returned (same reader, later day); per post, like a read rate.
baseline: None. Interactive posts exist as a genre (NYT, The Pudding, Observable, Distill) but nobody publishes them to subscribers, because they cost too much to produce.
look_by:
prs: []
---
Reframed from "apps as posts" (Sandy, 2026-10-22: "maybe a better framing is interactive posts"). An app is a
thing you run and maintain; an interactive post is **content with behaviour**: a concept you can try, not just
read about. It's a spectrum, from a paragraph with one slider to a full tool, so the constrained format is the
natural case rather than a limitation.

Lineage: explorable explanations (Bret Victor), playable essays (Nicky Case), NYT interactives, The Pudding,
Observable, Idyll (a markup language for interactive articles), Artifacts. The telling precedent is **Distill**,
the interactive machine-learning journal, which shut down in 2021 because producing interactive articles was too
expensive for authors and editors. The format never lacked readers; it lacked cheap production. That is what the
factory changes: every post carries its own demonstration and telemetry, so a post is the claim showing itself
and its telemetry is the read rate. Substack couldn't go here for two reasons, production cost and email; the
factory removes the first. The second stays: the email carries a teaser and a link; the post runs on the web.

Two tiers (Sandy: "either self-host or use our approved stack"). The **approved stack is the format**: a
self-contained bundle of Self Evident's known components on the sandboxed browser runtime, a thin shared backend
for state, and a declared capability list the runtime enforces (extended by PR, in the open); it runs in the feed
with telemetry we can vouch for. **Self-hosting is the escape hatch**: anyone runs the whole thing themselves,
and a post that needs more than the format allows is published as a link, with no embedding and no vouched
telemetry. The format is open and runs identically hosted or self-hosted; we host the convenient instance.

Cheapest test, no code: run it on Substack itself. A newsletter where every post links to its interactive
element (an Artifact, a Homework Gate page); subscribes, clicks and returning use are the behaviour that costs.
