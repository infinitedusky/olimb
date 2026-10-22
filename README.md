# 🔭🧠💡✏️🔨 Olimb

**Observe · Learn · Ideate · Mockup · Build.** (That's the logo, too.) An open-source factory that turns ideas into software and keeps
them honest with telemetry. Agents plan, build and open the PRs; the running app's signal decides what was worth
it and what to roll back.

The thesis, in three parts:

1. **Decide fast, on something real.** Mock-ups and proofs of concept before plans, so you agree to a thing you
   can see, not a description of it.
2. **The decision becomes the checks.** What you agreed to turns into stories, tests and clauses the machine holds,
   during the build and after.
3. **Telemetry catches the rest; recovery is the metric.** No attempt at full coverage; ship, watch, fix fast.

## Where things stand

This repository holds the design and the first code. Read [LOG.md](LOG.md) for where things stand and every
decision in the order it was made, [SHAPE.md](SHAPE.md) for what is being built, and `research/` for the
comparisons that shaped it (Lightsprint, InDusk, PostHog). The engine and the web UI live in `engine/` and `app/`
once their pull requests land; `engine/README.md` has the run instructions (`pnpm dev` at the root).

The first app built through it is Homework Gate, a home system that opens a student's screen time when the
homework is done *and understood*. Olimb is built the same way it builds anything else: it is an app inside itself.

## Working rules

Pull requests only; `main` is production. One git worktree per branch. Decisions go into LOG.md or SHAPE.md the
moment they are made. Keep it light: no plan ceremony, no gates.

## License

[MIT](LICENSE).
