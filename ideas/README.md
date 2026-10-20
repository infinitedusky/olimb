# Ideas

One file per idea. The fields at the top are what the factory's board shows:

- `lane`: `building`, `testing` or `parked` (one or two building at a time).
- `hypothesis`: what we believe, in a sentence.
- `measure`: the telemetry that will show it (event names, not free text).
- `baseline`: what's true before.
- `look_by`: when the evidence gets read.
- `prs`: the PRs that build it.
- `evidence`: what's been seen so far, for or against.

Changes go through PRs like everything else.
