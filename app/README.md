# Idea Factory app

The minimal UI: the **ideas board** (building / testing / parked), an **idea page** (the bet, its telemetry, the loop
it ran, its evidence — from the database, once connected), and **settings** (modules and their providers, telemetry first).

Ideas are the files in `../ideas/` (one per idea, read at build time). Telemetry isn't connected yet; the idea page
says so. The look is **provisional** (InDusk's palette and fonts in `src/tokens.css`), not yet chosen through Sandy's
references.

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm storybook    # http://localhost:6007 — components and page states
```

React 19 + TypeScript + Vite, React Router, Storybook (react-vite). Tokens by hand in one CSS file; no generator.
