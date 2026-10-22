import { parseIdea } from './ideas'

// Sample ideas for stories: made up, and say so.
export const sampleIdea = parseIdea('sample-checkout', `---
title: "Sample: one-page checkout"
app: Sample Shop
lane: building
hypothesis: Collapsing checkout to one page lifts completed orders by 5% without more payment errors.
measure: checkout_completed / checkout_started; payment_failed
baseline: 61% completion over the last 30 days.
look_by: 2026-11-30
prs:
  - https://github.com/example/shop/pull/42
---
Made up for Storybook.`)

export const bareIdea = parseIdea('sample-bare', `---
title: "Sample: dark mode"
app: Sample Shop
lane: parked
hypothesis: ""
---
`)
