# Lightsprint, taken apart

Public sources only (mainly their docs at https://app.lightsprint.ai/docs/), 2026-10-20. Why: Sandy decided to
build a Lightsprint-like factory and feed it with telemetry (SHAPE.md). We borrow product thinking — patterns and
ideas, never pixels, brand or code.

## The short version

A product layer on rented parts: **E2B sandboxes** (inferred, high confidence: reserved ports 49983/49900/50005,
`/home/user/workspace`, a job ad naming E2B), **Claude Code or Codex** running inside them, **Composio** for
connectors, and the customer's own GitHub CI. What they own: the setup agent, screenshot verification, live shared
sessions, plan mode, the review screen. YC Spring 2026, $6.1M seed (645 Ventures, 2026-10-13), six people, SvelteKit.

## How each part works, and how hard it is to build

| Part | How it works | Build |
|---|---|---|
| Sandbox per task | VM + branch (`ls/*`) + agent per task, booted in seconds from a prebuilt snapshot (repos cloned, setup run); 8/16 GB; pause after ~20 min idle, retire at 7 days; one persistent "primary sandbox" per stack for read-only work and a preview of main | **High.** Snapshots, setup on every boot, long-running services, arbitrary repos. Rent E2B/Daytona |
| Previews | Each dev server gets an unguessable public URL (the Vercel model), optional password; servers bind 0.0.0.0 behind a proxy; some stacks get a database branch per task | Medium–high (proxy + lifecycle) |
| Onboarding agent | "Set up my preview" inspects the stack, fills in setup/test commands, services, agent instructions; **opens PRs when the repo needs changing; setup is done only when the preview loads**. Env vars in `/tmp/.env`, which the agent can read — docs say use staging credentials | **High** — their own main engineering problem |
| Live shared session | App on the left; plan, reasoning, tool calls on the right; one shared message queue ("Send now" interrupts); click an element to attach it; optional terminal | High (multiplayer queue). InDusk's session panel is a start |
| QA | Built-in agent skills: `qa` on every task chooses `visual-qa` (screenshots/video), `expect-qa` (checks the preview can't show, e.g. emails), `flow-diff` (Mermaid of changed flows); `interactive-qa` reports bugs, never fixes. Posted as a "Verification" comment on the PR (Feature / Entry Points shots); `@lightsprint capture …` in a PR comment asks for more; can QA PRs it didn't make | **Low–medium.** Prompts + a headless browser. InDusk's `browser.ts` |
| Merge readiness | Docs: red/yellow/green from CI checks, bot reviews, unaddressed comments, conflicts; auto-merge needs 100, ≥1 passing check, no warnings. The homepage's "design-token linting / component registry" look like marketing — in practice your linters plus a `design-md` skill | **Low.** Summarise GitHub's checks API |
| Plans | Read-only interview with the agent: decision cards with lettered options and a recommended one; ends in product spec + design preview + tech spec (variants: Prototype, Meeting Notes to Plan, "YC Office Hours"); hands off to a task as `plan-handoff.md`; **no approval step** | Medium — conversation design, not code. InDusk's DecisionCard |
| Skills | Per stack, or discovered from `.claude/skills/*/SKILL.md`, or imported from skills.sh; a skill named `design-md` is the design system | Low — copy the pattern |
| Automations | Run as a named user, with budget caps and run limits | Medium |
| Models | Lightsprint credits via an AI gateway token, or connect a personal ChatGPT/Claude/OpenRouter account, or (Enterprise) your gateway. Claude "where available" | — |

## What it does not do

No baseline, hypothesis or post-merge measurement — merging marks a task "Done". No experiments or feature flags. No
idea validation (plans are *what* to build, not *whether*). No generated seed data in previews. Closest: a PostHog
connector so an agent can "check whether the feature they just built is actually being used".

## Lessons for us

- **Customers' Claude subscriptions are off limits.** Anthropic's 2026 terms restrict consumer subscription logins
  to Claude Code and claude.ai, likely why Lightsprint defaults to its own credits. Our own development on `claude -p`
  is fine; the product uses API keys.
- **Borrow:** the setup agent that works by opening PRs; "the preview loads" as the definition of set up;
  Feature / Entry Points screenshots on the PR; `@bot` commands in PR comments; automations with a run-as user,
  budget caps and run limits; honesty about what the agent can read.
- **Ours alone:** the loop from a telemetry signal → idea with baseline and hypothesis → build → the same telemetry
  measures it. Lightsprint offers no hook for a build to carry a hypothesis or report back.
- **Rent:** sandboxes (E2B/Daytona), the coding agent (Claude Code headless / Agent SDK with API keys, Codex),
  connectors (Composio or MCP), CI and merge (GitHub).

## Proposed build order (the edge first)

1. **Telemetry in, ideas out.** Connect PostHog (then Datadog); a signal becomes an idea card with its baseline,
   hypothesis and look-by date. The minimal UI: ideas board, idea page, settings (providers).
2. **Build, simplest form.** One known repo (Homework Gate): Claude Code headless on a branch/worktree (InDusk's
   session manager), PR with QA screenshots (InDusk's browser tooling), the readiness light from GitHub checks.
3. **Measure.** After merge, the same insight against the baseline → a verdict on the idea card. The loop closes.
4. **Thicken the middle.** Rented sandboxes and preview URLs, the onboarding agent, plans as decision cards, the live
   shared session, automations.

## Sources

Docs: preview-setup, agents, steering, terminal, agent-subscriptions, billing, skills, verify-from-github, review,
many-tasks-one-base, plans, mcp, guardrails, automations, workspace-settings — all under
https://app.lightsprint.ai/docs/. Site: https://lightsprint.ai/, /pricing, /llms.txt, /careers/senior-software-engineer,
/blog/lightsprint-raises-6-1m. Company: https://www.ycombinator.com/companies/lightsprint,
https://dealroom.co/news/161992-lightsprint-raises-6-1m-seed-to-help-pms-and-designers-ship-code-safely/,
https://dnyuz.com/2026/10/13/this-y-combinator-startup-raised-6-1-million-to-let-product-managers-and-designers-ship-code-see-its-pitch-deck/,
https://github.com/SprintsAI. Subscription terms: https://gigazine.net/gsc_news/en/20260220-anthropic-third-party-block,
https://winbuzzer.com/2026/02/19/anthropic-bans-claude-subscription-oauth-in-third-party-apps-xcxwbn/.
Not found: changelog, Hacker News launch, Product Hunt, talks; QA browser tool; named customers unconfirmed.
