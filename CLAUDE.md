# Idea factory

Start here: read [LOG.md](LOG.md) (where things stand, decisions, next step)
and [SHAPE.md](SHAPE.md) (what we're building). Research is in `research/`.

This folder holds the design (LOG.md, SHAPE.md, `research/`) and, since 2026-10-20, the factory's code:
`engine/` (Postgres schema, server, event stream, scheduler; see `engine/README.md`) and `app/` (the minimal
UI). pnpm workspace at the root. Work in a git worktree per branch, never in the main checkout. We are acting as the
factory by hand on Homework Gate first and logging each step; the tool gets
built from that log. Keep it light: no plan ceremony, no gates. When something
is decided, write it into LOG.md or SHAPE.md before moving on.
