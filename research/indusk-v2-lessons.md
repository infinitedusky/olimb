# InDusk → V2: design system, mockups, stories, docs

Read-only study of `/Users/the_dusky/code/sandbox/dusk`, 2026-10-20. Paths are
relative to that repo. Goal: keep what made InDusk powerful (it produced the
supporting work as it went), drop what made it a ritual.

## The one-line lesson

Every artifact started as a useful by-product and was then turned into a
contract that something else checked. Commit history shows the cost: 666
"looks — X approved by Sandy" commits in 9 days; repeated "amendment
approved" / "reopen the impl"; "Build Phase 2 stops at the look check, which
cannot run" (`4874fd586`). V2 keeps the artifacts and removes the contracts.

## What InDusk did, and how it was enforced

| Artifact | How | Enforced by |
|---|---|---|
| Mockup | HTML per screen×state in `.indusk/mockups/<app>/screens/` | `plans approve` refuses a UI brief with no looks — gated |
| Approval | `approved.json`, bound to ~6 hashes (mockup, tokens, base rules, story snapshot, stylesheet…) in `looks/mockups.ts` | `hooks/looks-approval-guard.js`; any CSS change reopened approvals — gated, the worst one |
| Look check | `looks/browser.ts`, `served.ts`, `dev-server.ts`: one load, per device × colour scheme | gated inside phases |
| Stories | 37 CSF3 files in `apps/indusk-admin`; rendered to snapshot HTML and approved per state | `plans accept` — gated; never used as demos |
| Tokens | `.indusk/mockups/admin/foundation.tokens.json` (DTCG) → generator → `foundation.generated.css` | lint refusing raw values, coverage — gated |
| Docs, changelog | VitePress (`apps/docs`, ~335 pages); changelog hand-written, 1,178 lines, essays | `hooks/check-gates.js` document gate — gated; mostly read by agents |

The looks slice alone is ~7.9k lines (`apps/indusk-mcp/src/lib/looks/`).

## Keep

- **The look:** calm palette (ink, ground, surface, line, one accent "dusk"
  `#c2620b`, ok/warn/bad/idle each with a "wash" tint), proper dark values,
  type pairing Bricolage Grotesque / IBM Plex Sans / IBM Plex Mono, dark mode
  as `prefers-color-scheme` + `data-theme` override.
- **~10 generic primitives** (`apps/indusk-admin/src/components/ui/`): Stat,
  Timeline, DecisionCard, Message, PromptBox, Box, Button, Tag, Table,
  Shell/Nav (rail → drawer on phone), plus DeviceFrame, Recommendation,
  CopyButton, CollapsibleSection. `data-component` on every primitive.
- **Story per state with a theme toolbar** (`.storybook/preview.ts`).
- **The promise page** (verdict chip → alert card → Stat grid → evidence) —
  the closest thing to a per-idea dashboard; model the idea page on it.
- **Session panel** (`components/session/`): live agent over SSE, reply, stop.
- **Screenshot machinery:** `browser.ts`, `served.ts`, `dev-server.ts`, and
  `sha256` hashing in `mockups.ts`.
- **Honest live refresh** (`LiveRefresh.tsx`): shows "last updated", stops
  visibly when the server is gone.

## Drop

Approval as a gate, re-approval on change, amendments, coverage, token lint
as refusal, the component-in-mockup composer (`compose.ts`), the reuse cache
keyed on ~10 hashes, a git commit per approval, the document gate and "docs
are never optional", hand-written changelog essays, ~40 plan-shaped
components (PlanRow, PhaseRow, WorkflowStrip, AmendmentCard…), Badge's 13
domain variants, 150+ deep imports from UI into the domain package, the
generator + duplicated spacing tokens + bespoke `.cols-*` classes, a pinned
Next version.

## V2

1. **Storybook is its own server** (decided, SHAPE.md): design-system docs,
   components, and mockups as page stories built only from design-system
   components, with fake data via MSW, labelled.
2. **Tokens by hand:** one `tokens.css` in Tailwind v4 `@theme` — ~16 colours
   × 2 themes, 6 text steps, 4px spacing scale, 5 radii. No generator. DTCG
   export only if a second app needs to share them.
3. **~12 primitives to start**, Badge with a `tone` prop (domain → tone mapping
   lives outside the component), plus new `Card` and `Chart`/`Sparkline`;
   Stat gains baseline and delta (InDusk's couldn't show either).
4. **Approval is a mark, not a gate:** one click, bound to the story's hash,
   recorded; a changed hash shows "changed since approved" on the PR. The
   build waits only if Sandy says so.
5. **Stories are the demonstration:** new or changed components and pages get
   stories; the PR links the published Storybook build and, via
   `browser.ts`-style screenshots, shows the built screen per device beside
   the approved story.
6. **Changelog generated at merge** from the PR (Changesets or release-please
   — check before building): one line, written for a user.
7. **Docs only when public behaviour changes;** the agent proposes the diff.
   Agent context stays in `CLAUDE.md`, not in a docs site.
8. **A thin typed API between UI and domain;** components never import domain
   modules.
9. **Data rules before chrome:** empty, loading, stale, low-confidence states
   for every number on a dashboard.

## First screens (from SHAPE.md)

- **Ideas board:** inbox, three lanes (build / testing / parked) with limits,
  a card per idea.
- **Idea page:** hypothesis, baseline vs now (Stat pairs + chart), look-by
  countdown, verdict DecisionCard, Timeline of events and PRs, session panel
  while building.
- **Settings:** "Telemetry: PostHog" (the only option), project key and host.

## Unsure

Whether DTCG pays for itself here (start without it). The two `malith-dev-*`
screenshots in InDusk's root look like a third party's site, not InDusk's.
