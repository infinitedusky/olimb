# Ideas

One file per idea. The fields at the top are what the factory's board shows:

- `lane`: `building`, `testing` or `parked` (one or two building at a time).
- `hypothesis`: what we believe, in a sentence.
- `measure`: the telemetry that will show it (event names, not free text).
- `baseline`: what's true before.
- `look_by`: when the evidence gets read.
- `prs`: the PRs that build it.

These files are **authored input only**. Evidence, verdicts and telemetry results are machine-updated state and
live in the factory's database, never here (SHAPE.md: git holds code, the database holds state).

Changes go through PRs like everything else.
