# Idea factory — log

Where things stand, newest first. Read with [SHAPE.md](SHAPE.md) (what we are
building) and `research/` (comps, method, salvage).

## 2026-10-20 — started

### How we got here

Sandy had spent weeks building InDusk (`~/code/sandbox/dusk`), a development
system with plans, briefs, phases, gates, plan reviews and rituals around
Claude Code. On 2026-10-20 it became clear the process had grown faster than
its reliability: plan reviews re-reading their own fixes, a one-line promise
change dragging a finished plan back to the brief stage, UI buttons the server
then refused, sessions deciding from documents that missed what was agreed in
chat. Sandy questioned the whole thing and decided to start from scratch on
the design, salvaging code only where it earns its place.

### Decisions

1. **What we're building** is in SHAPE.md: an idea factory / entrepreneur
   machine. Ideas start with a baseline and a hypothesis; most die on
   evidence; survivors are built in parallel as PRs; each PR comes with a
   demonstration on the real app (fake data labelled); telemetry checks the
   result after shipping. The person is in control: guidance, never gates.
2. **Built on PostHog.** Apps made this way are PostHog-native from their first
   line. Salvaged InDusk telemetry only for what PostHog doesn't cover.
3. **Rent the factory.** Parallel agents opening PRs is commodity (Cursor,
   Devin, Codex, Claude Code cloud). Our part is both ends: the idea and its
   evidence before, the demonstration and the measured outcome after.
4. **First app: Homework Gate**, tutor side first. No users yet.
5. **Act as the factory by hand first.** Do on Homework Gate what the factory
   would do, write down every step, mark which were tedious (→ automate) and
   which needed judgement (→ stay with the person). That log is the spec. Do
   not build the tool before the log shows what it is.

### Homework Gate

- Repo: https://github.com/infinitedusky/homework-gate — `main` has only a
  README; the proof of concept is **PR #1, branch `poc-learning-loop`**
  (commit `860eeef`), being built by Sandy in a separate Claude Code session.
  **Merged to `main` 2026-10-20** (`4d3f418`), with a repo `CLAUDE.md` that
  hands off context (invariants, API notes, next steps). Work on branches off
  `main`.
- `~/code/sandbox/homework-gate-workbench` is something else, unrelated to
  this work; don't use it.
- Local clone: `idea-factory/homework-gate/` (gitignored; its own repo and
  commits), so sessions here have the app's full context.
- `brief.md` at the repo root: the whole product (laptop + iPhone gating, the
  evening flow, architecture). v1 = the learning system; gating is a manual
  switch the parent flips.
- `poc/`: FastAPI + SQLite + Jinja, ~1,100 lines of Python. The assistant
  (`hg/assistant.py`) reads an assignment (photo, PDF, text) and builds a
  private answer key; the tutor (`hg/tutor.py`) climbs a hint ladder; the
  answer-leak guard (`hg/guard.py`) checks every reply by number match against
  the key plus a second model call that rewrites leaks into hints; the quiz
  (`hg/quiz.py`, `hg/grading.py`) makes five fresh questions, graded by SymPy
  and the model; a parent page. `HG_FAKE_LLM=1` runs canned responses; tests
  with `pytest`. Every call uses `claude-opus-5-5` (`HG_MODEL`).
- No telemetry yet: no PostHog, no timing, no logging.
- **Model access in development: Sandy's Claude Code subscription** (decided
  2026-10-20). The API costs money and the subscription is already paid, so
  while developing, `llm.py` gets a backend that calls headless Claude Code
  (`claude -p`), kept as close to the API calls as possible. Not the Agent
  SDK: Anthropic's terms have said subscription logins are not for the SDK.
  Production uses the API with a key; the API path stays the default.
  Differences to remember when reading dev numbers: Claude Code's own system
  prompt, process start-up time, no refusal fallback, token counts instead of
  billed dollars.

### Hypotheses to baseline (no users needed)

Run on a fixed set of real homework pages:

1. **The answer key is right** — riskiest; the guard, grading and quiz all
   trust it. Measure: problems extracted and solved correctly, missed, wrong.
2. **The guard catches leaks and doesn't over-fire** — leaks caught, missed,
   harmless hints wrongly rewritten.
3. **Grading is fair** — model-graded short answers agree with Sandy's grading.
4. **Speed and cost** — seconds and dollars per evening; hypothesis: a smaller
   model is good enough for the guard and grading.

Plus: PostHog (Python SDK) in the app for errors, time per step, guard
rewrites, hint level reached, quiz pass rate. No homework text in events.

### Next

1. **Sandy:** photograph 20–30 real homework pages from recent weeks, as varied
   as possible (worksheets, handwriting, a PDF, a reading question), with the
   correct answers — old graded homework is ideal.
2. **Agent:** on a new branch of homework-gate, an evaluation script that runs
   the assistant on each page and compares against the answers: problems
   found/missed, answers right/wrong, time and cost per page; a simple report
   page — the first idea dashboard.
3. Record the baseline here, and log each step taken by hand (tedious or
   judgement).

### Steps taken by hand (2026-10-20)

- **First live run, done.** Branch `live-run` in homework-gate: `HG_CLAUDE_CODE=1`
  backend in `poc/hg/llm.py` (`claude -p`, stream-json content blocks in,
  `--json-schema`, `--effort`, own `--system-prompt`, no tools/settings/MCP).
  Not committed yet. A whole evening ran live on a made-up four-problem
  worksheet (labelled fake): answer key all correct, tutor didn't give
  answers when pushed, private check caught the wrong answer to #3, quiz
  generated and graded (4/5, one wrong on purpose). Nothing broke.
  Speed: analyze 13–15s, tutor ~10s per reply, check 5–7s, quiz 24s,
  grading 4.5s. Tutor latency is the one a student would feel.
  - Tedious (→ automate): probing CLI flags, writing the live-evening script
    (scratchpad, not in repo), reading results out of SQLite.
  - Judgement: subscription vs API for development; reading tutor replies
    for leaks ("plug 9 in and see if you get 10" — self-check, judged OK).

### Storybook: do it on Homework Gate, record it for the factory (2026-10-20)

Sandy: two separate things. (1) The idea factory should *know* to set up
Storybook, a design system and stories for an app. (2) We do it by hand on
Homework Gate now and record each step; the factory's own UI (idea board,
settings) waits until the log shows what the tool is. Lessons from InDusk:
`research/indusk-v2-lessons.md`.

- Homework Gate is server-rendered Jinja, no JS build. Proposed: Storybook's
  server mode (`@storybook/server-webpack5`, 10.6.3, current) fetching real
  templates rendered with labelled fake data from a dev-only FastAPI route;
  tokens pulled from `base.html`'s existing `:root` variables. Not React.
- Factory lesson already: it must fit Storybook to the app's stack, not
  assume React.
- **Done by hand: homework-gate PR #3** (open). Storybook server framework,
  tokens moved to `tokens.css` (+ `data-theme` override for a theme
  toolbar), dev-only `/_stories/<id>` route (`HG_STORIES=1`), 19 page-state
  stories with labelled sample data, a design-system MDX page, and a test
  that renders every story and checks Storybook lists the same set.
  - Tedious (→ automate): installing and configuring Storybook; moving inline
    CSS into token and style files; writing the stories route and CORS;
    generating the `*.stories.json` from the Python list (I scripted it);
    browser screenshots to check it rendered; README/CLAUDE.md updates.
  - Judgement: which states are worth a story (the night's status banner
    drives most of them); writing believable sample data (reused the science
    worksheet and the squirrel exchange); fixtures as hand-written contexts
    vs seeding a fake database and rendering real routes — chose contexts,
    with a test guarding drift.
  - For the design-system module's manifest: detect the stack → pick the
    Storybook framework; a "stories" dev route; tokens file; sample label;
    the drift test. A one-command "show me every state" is the payoff.

### Ideas raised, not yet decided (2026-10-20)

From Sandy trying the app live on `samples/fake-01-characteristics-of-life`:

1. **Tutor directives, ranked.** Primary: prepare him to do better over time
   — the subject and learning how to learn. Draft order: (1) better over
   time, understanding over answers; (2) learning how to learn (explain,
   self-check, spot own mistakes, pick a strategy, know when to ask);
   (3) tonight's homework done and understood; (4) keep going. "Never give
   the answer" stays a hard rule. Waiting on Sandy's ranking.
2. **Private explanation per tutor reply** (directive, move, expected next
   step), parent-visible. It's a claim, not evidence; evidence is the
   student's next behaviour.
3. **Learning-skills notebook.** Tutor names a meta-skill in one sentence when
   it comes up (e.g. multiple choice = pick the *best* fit, not just a true
   one — the squirrel item), records it, returns to it on later nights; parent
   page lists "talk about at dinner". Risk: over-firing/preachy; cap 1–2 a
   night.
4. **Spaced review in the quiz; the quiz as a learning moment.** Quiz adds
   due concepts from earlier nights and named skills from the notebook. "I
   don't know" opens a short tutor exchange after the result — closer to
   working with a parent than finishing homework. Scheduling: use FSRS
   (`py-fsrs`, open source; verify current) rather than building one.
   Risk: if untaught skill questions count toward passing, the quiz becomes a
   trap tied to his phone. Proposed: split quiz — gate (tonight, counts) +
   review (1–2 questions). Sandy's rule (Leitner-style spaced repetition): a
   first wrong review answer doesn't close the gate — the concept goes back
   to "ask again soon" and the tutor teaches it that night; wrong again on a
   later night closes the gate, and it reopens after a short re-teach plus a
   fresh question. The second ask only counts if teaching happened between. Test: randomize *by concept* (reviewed vs held back) and
   compare recall weeks later — a real within-student experiment at N=1;
   follow-up rate after "I don't know"; gate pass rate and quiz time not
   worse.
- **How to test (proposed):** simulated students (answer-demander, guesser,
  quitter, solid) × the sample worksheet; judge scores replies against the
  directives; baseline tutor vs directive tutor; a deliberately bad tutor
  must score worse or the test is worthless. Then the real student over
  ~4 weeks: hint level per concept, unprompted self-checks/explanations,
  named skills used later unprompted, "just tell me" rate, dinner topics
  marked talked-about. N=1: trends, not proof.
- Policy question noticed: the tutor confirms correct answers ("Yes, D is
  right"). Seems fine; belongs in the directives.

## InDusk, paused

Nothing is running. Left as it stands, nothing archived:

- `admin-pages-load-fast` — landed; promise changed to "every admin page
  answers in under ten seconds"; its re-approval card needs Sandy's click; not
  closed.
- `plan-state-is-a-database` (first plan of master `state-in-a-database`) —
  planning stopped after a plan-review loop (15 of 39 fixes failed recheck).
- `run-the-graph` — approved, not built.
- `one-agent` — draft brief: one agent for the whole admin. Its idea (one
  conversation that knows the page you're on, summarises sub-agents) may
  belong in the idea factory instead.

Salvage map with paths: `research/salvage-from-indusk.md`.

## How Sandy works

- PRs exclusively: `main` is production, never commit to it directly.
- Short answers; lead with the answer. State, next step and who takes it.
- Questions are questions, not instructions to change things.
- Lead with the strongest counterargument; give a recommendation, not a survey.
- Telemetry over tests: a real signal from the running app is the proof.
- Say "local" / "this machine", not "laptop".
- Pronouns: they/them.
- Don't reinvent: check for an existing library or official integration first.
- Write decisions into the documents (this log, SHAPE.md) the moment they're
  made; the next session only knows what's written here.
