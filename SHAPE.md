# Idea factory — the shape

Working name. Brainstormed with Sandy, 2026-10-20, after deciding InDusk had
grown more process than product. Draft: research in `research/` fills in the
comps, the method and what to salvage.

## What it is

An entrepreneur machine. A person has many ideas; the machine tests them all
at once, kills most of them on evidence, builds the ones that survive in
parallel, and shows each result working before anyone says yes. Ideas are
cheap and execution is expensive, so the machine makes an idea earn its build.

It takes over where Claude Code stops being enough: the app is good, the list
of improvements grows faster than a person can judge it, and nobody knows what
is working.

## The loop

1. **An idea arrives** — from the person, talking it through with the agent
   (which pushes back: good, bad, here are the problems), or from telemetry
   ("checkout errors tripled after Tuesday").
2. **Baseline first.** The first answer to any idea or complaint is "let's
   measure": put telemetry on it, state a hypothesis, set up a few cheap tests
   (fake doors, A/B, watching the people who'd use it), and give the idea its
   own small dashboard with a look-by date. The agent says plainly when an
   idea can't be tested well ("you have 40 users; here's the best we can do").
3. **Decide on evidence.** On the look-by date the findings say yes, no or
   not yet. Most ideas die quietly here.
4. **Propose.** For a yes: the chunks and why they were cut that way, what
   success looks like and how it's measured, mockups or an animation of the
   result.
5. **Factory.** Every chunk that isn't waiting on another is built at once,
   each as a PR. Only a blocked chunk costs anything.
6. **Demonstrate.** Each PR comes with a demonstration: the real app running
   the change, with fake data filled in where needed — and the agent knows and
   says which data is fake and why. Kinds: before and after, a walkthrough,
   numbers before and after, the failing case now passing, the effect on data.
   The pitch is an employee to a boss: what it does, why we need it, the data
   behind it, what could go wrong and how we'd know, one button to say yes or
   "talk to me".
7. **Ship and check.** Telemetry checks the claim against the baseline. What it
   sees feeds the next ideas.

The person can follow every step as it happens, interrupt at any point, or ask
"what are you doing".

## Principles

- **The person is in control.** Guidance, never gates. The evidence-first way
  is the easy, enjoyable one; skipping it is allowed, and then the telemetry
  goes in anyway so the decision is measured after the fact.
- **Review what it does, not the code.**
- **Evidence the agent can't dress up.** Real telemetry, and every pitch says
  what it is unsure of.
- **Web apps first.**
- **No plan ceremony.** No document chains that gate each other, no reviews of
  reviews. The checks are the evidence, the demonstration and the telemetry.

## The hard, mechanical parts

- The demonstration environment: a preview of the app per PR, a database copy
  per PR with generated data, stand-ins for outside services, and a record of
  what was faked.
- The factory: many agents building in parallel without stepping on each
  other.
- Telemetry that installs itself into an app and explains itself.
- The per-idea dashboard: baseline, hypothesis, tests, findings, look-by date.

## What the research says (2026-10-20)

Details and sources in `research/`.

- **Rent, don't build:** parallel agents each opening a PR (Cursor, Devin,
  Codex, Jules, Copilot, Claude Code cloud, Factory); PRs with videos and
  screenshots (mainstream since Feb 2026); error-to-PR autofix (Sentry Seer,
  Datadog, PostHog); preview deployments and database branches (Vercel, Neon,
  Supabase); service mocks (MSW); experiments (GrowthBook, open source).
- **Nobody does:** the idea as the unit of work — baseline, hypothesis,
  testability verdict, look-by date, verdict, re-check after shipping; an agent
  that pushes back on whether an idea is worth building; ideas proposed from
  telemetry (not just bug fixes); demos on a seeded preview that label the fake
  data and tie to the hypothesis. Seed data is the weak spot — the open tools
  are stalled or gone, so we may own that layer.
- **Closest threats:** PostHog (self-driving loop, June 2026: signals → agent
  → draft PR → checks the metric returned to baseline; MIT core) and Cursor
  (agents with demos). Building on PostHog may beat competing with it.
- **Caution on parallelism:** Factory found mostly-serial work beat broad
  parallelism; ideas in parallel is safer than chunks in parallel.
- **Method:** validate on behaviour that costs the user something (click <
  email < details < money), never compliments. Stages with time boxes and
  kill lines set before data: frame → problem evidence (interviews) → demand
  (1–3 weeks) → value (a real first version) → traction. The tool says when a
  test can't detect a realistic effect with the traffic available. Solo: one
  idea in the real-product stage, two or three in demand testing. Fundable
  evidence is the retention cohort, weekly growth and revenue quality, not a
  landing-page conversion rate. People run interviews and make the kill call.
- **Salvage from InDusk:** the telemetry layer (app scaffold, local daemon,
  own server, signal reading) ~9–10k LOC nearly as is; sessions, questions
  with a cost, run records, the looks/browser slice and UI primitives adapted;
  ~60k LOC of plan ceremony dropped.

## Decided

- **Built on PostHog** (Sandy, 2026-10-20). An app made with the idea factory
  is PostHog-native from its first line: every feature ships with its events,
  its feature flag, its experiment where one fits, session replay and error
  tracking, named and wired the way the idea's hypothesis needs. So when an app
  starts getting traction, it already has the best PostHog integration it
  could have, as a result of how it was built. The salvaged InDusk telemetry
  covers only what PostHog doesn't (server-side traces and signals).

- **First app: Homework Gate** (Sandy, 2026-10-20) — its web side: the parent
  dashboard (locks and rewards) and the student tutor (reads homework, teaches
  rather than answers, grades, tracks progress over time). The iOS and native
  locking pieces stay outside the loop at first.

- **It builds the supporting work as it goes** (Sandy, 2026-10-20) — kept from
  InDusk, which did this well: mockup first, then build, then stories, plus a
  design system, changelog and docs, each encouraged at the right moment.
  Here they are by-products, never gates: nothing waits on a document, a
  missing one is flagged, not blocking (InDusk's gates and reviews are what
  made it cumbersome). Every artifact needs a reader or it isn't made: mockup
  → Sandy before code; design system → the next mockup and the app; stories
  (Storybook) → the demonstration, every state including faked ones;
  changelog → Sandy and the pitch; docs → the next session.

- **Storybook is the home of the design system, stories and mockups**
  (Sandy, 2026-10-20), as its own server — not built into our UI (InDusk
  built its looks/approval flow into the admin and fought it). Tokens and
  components documented there; mockups are page stories built only from
  design-system components (so an approved mockup is most of the real
  screen); every state is a story, with fake data via MSW, labelled; the
  same stories serve as PR demonstrations.

- **PRs are a source of production failures, so each carries telemetry and a
  rollback plan** (Sandy, 2026-10-20). At volume (hundreds of PRs a day) a
  problem can surface after many later merges: redeploying the old version
  undoes all of them, and reverting one PR can conflict with work built on
  it. The practice: separate deploy from release with feature flags (PostHog)
  so rollback means turning off one flag; release gradually with a guard
  metric; tag events with the release and the flags on, so a late problem
  traces to one PR; schema changes go expand-then-contract so they stay
  reversible. Every PR's pitch states: the off switch (which flag; "none"
  must be justified), how we'd know (guard metric), schema impact, and
  whether it can be reverted alone. Work is PRs only; `main` is production.
  Schema changes: additive (new table, nullable/defaulted column, index built
  concurrently) is flag-safe; breaking (NOT NULL without default, drop/rename,
  type change, tighter constraint) needs expand-then-contract across PRs.
  Trap: additive schema can still break rollback through data (e.g. a new
  enum value written while the flag was on, which flag-off code can't read).
  So "does the flag work?" is two checks — flag-off code against the new
  schema, and against data written with the flag on — and the PR
  demonstration runs both: flag on, write data, flag off, old path still
  works.
  No gating migrations by person (Sandy: slow, and no safer). Classify each
  change by schema *and data* — the same NOT NULL / unique / backfill is
  trivial or dangerous depending on row counts, nulls, duplicates. Use
  existing tools for the schema side (Squawk, Atlas migrate lint,
  strong_migrations; pgroll/Reshape for expand-contract), add the data side
  by querying the real database. Simple → goes; needs care → agent splits it
  into expand-contract PRs; hard/irreversible → more evidence (dry run on a
  DB copy, snapshot first, "irreversible" stated in the pitch), Sandy still
  decides. Database is a module with a provider (most tools are
  Postgres-first; Homework Gate is SQLite).

- **Modules and providers** (Sandy, 2026-10-20). Modules are what the factory
  can do; each needs a role filled; extensions are providers for a role, and
  a module unlocks when its role has a provider. Telemetry → PostHog; design
  system / stories / mockups → Storybook; server traces → salvaged local
  OTel/Jaeger; model access for the app → Claude Code subscription (dev) or
  Claude API (prod) — `HG_CLAUDE_CODE` is already this; code host → GitHub.
  Builds on InDusk's extensions (`apps/indusk-mcp/extensions/`, ~20, each a
  `manifest.json`: skill, MCP server, health checks, env template, detect),
  which were a flat list with overlaps settled by hand in a README "decision
  matrix". Keep it light: a module is a named role + manifest; no generic
  adapter code until a second provider for a role is real. Settings shows each
  role with its provider(s) — PostHog the only telemetry option for now.

- **Tiny visual start, as mockups** (Sandy, 2026-10-20): the idea board
  (inbox, three lanes — build / testing / parked — and a card per idea) and
  a settings page, "Telemetry: PostHog" as the only option.

## Open questions

- Comps: who already does each part (`research/comps-*.md`).
- The best route from idea to funding, and what evidence each idea should
  produce to be fundable (`research/idea-to-funding-method.md`).
- What to salvage from InDusk (`research/salvage-from-indusk.md`).
- The first real web app to build it against.
