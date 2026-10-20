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
3. **Rent the factory.** *(Superseded 2026-10-20: build it, fed by telemetry — SHAPE.md.)* Parallel agents opening PRs is commodity (Cursor,
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
  - **Correction (Sandy):** the look itself is *provisional, agent-chosen* —
    the colours came from the POC session; nobody picked them. The
    design-system decision is open, via the elicitation process in SHAPE.md
    (references → 2–3 directions as stories → Sandy reacts → recorded).
  - **Design brief, elicitation step 1 (Sandy, 2026-10-20).** Reference:
    https://tincan.kids/ (warm flat saturated blocks — yellow, green, cobalt,
    orange, pink; chunky pills and cards with hard black offset shadows; one
    idea per section; short playful copy; nostalgic, anti-anxious). Feeling:
    designed for ADHD first — getting things done feels overwhelming. This
    is the key to relaxing: through the gate I get to play, without the
    feeling I've screwed up or blown it, no sick feeling going to sleep.
    Hard, but on my side. Implications: one next step at a time; visible
    progress toward the key/unlock; no red or failure language for the
    student — "not yet" always with a concrete next step; parent page can
    stay plain. Tension: Tin Can is daytime-bright, this is used at night —
    borrow warmth/shapes/voice, dim and warm for evening.
    Second reference: https://camp.com/ — warmth on dark grounds (deep navy,
    chocolate brown, cream text, warm brights as accents: lime-yellow,
    orange, teal, red), chunky soft-serif display + rounded sans, wavy
    section edges, dots and plaid, enthusiastic copy. Shared taste:
    retro-warm, chunky friendly type, physical, playful but confident, kid
    without babyish. Resolves the night tension: dark warm grounds, brights
    only for what matters. So A becomes "Camp at night".
    Also looked at (Sandy's message cut off, meaning unclear): getbrick.com
    (calm premium; "take back your time" — self-chosen limit, matches the
    student's "I want to") and bark.us (generic; "parental controls" —
    imposed, the opposite of the feeling).
    **https://heronaiapp.com/ — Sandy: "LOVE", "closest to what I want".**
    Drafting paper (warm off-white, grain, hairline frame, + crop marks,
    monospace title-block labels), pencil/stipple ink drawing, heavy tight
    uppercase sans headline, ONE orange-red accent used sparingly; intro
    draws the building line by line with a % counter. Calm, precise,
    grown-up. Fit: one accent = the eye always finds the next step; the
    night's work as a drawing being built, finished drawing = unlock;
    respects a 13-year-old; night = blueprint (deep blue paper, pale lines,
    same accent). Open question: does Heron replace the Tin Can/Camp warmth
    or keep some of it?
    Directions (third revision): A Drafting table — Heron straight, paper by
    day, blueprint by night (leading); B Drafting table, warmer — A plus
    Camp's warm night palette, softer type, Tin Can's voice.
    **Sandy: mix Heron's line drawings with 1890s natural-history books**
    ("childer" unclear — ask). → Lead direction **Field notebook**: Heron's
    paper, hairline frames, one accent (vermilion, like old plates' red
    ink); engraved specimens with PLATE / Fig. captions (public-domain
    scans: Haeckel's *Kunstformen der Natur*, Biodiversity Heritage
    Library — real engravings, not imitations); old-style serif (Libre
    Caslon / IM Fell) + mono labels; night = cyanotype (Anna Atkins'
    1840s botanical cyanotypes — white lines on Prussian blue). Tonight's
    homework = a plate that fills in as steps complete, finished plate =
    unlock; the learning-skills notebook = his field journal.
    **Sandy: "a field notebook for kids", mixed with Sprayground's
    shark-mouth backpacks.** Built as mockups (homework-gate PR #4, stacked
    on #3): tonight's plate = public-domain 1838 great-white lithograph that
    draws in as steps complete; the gate = a shark mouth (vermilion lips,
    interlocking white teeth) that opens on FREE TIME; one next step per
    screen; no red/failure language ("Not yet… That's information, not a
    verdict"); paper by day, cyanotype at night.
    **Sandy's reaction (step 3):** likes the shark mouth as the gate. Later,
    not now: when it's all the way open it swallows the to-do list and
    dances with you. Keep it a few seconds, tap to skip, quieter with
    reduced motion — it sits between him and free time.
    - Tedious: finding a public-domain image (Wikimedia API needs a user
      agent; most search hits were junk), converting it to ink, screenshot
      checks. Judgement: reading the references into a brief, the
      metaphors (plate draws in, jaw = gate), the copy.
    Earlier directions (superseded): A Camp at night; B The key (calm, single focus,
    key path fills as steps complete); C A+B (recommended). To build as real
    screens in Storybook: home, a tutor moment, a not-passed result.
  - For the design-system module's manifest: detect the stack → pick the
    Storybook framework; a "stories" dev route; tokens file; sample label;
    the drift test. A one-command "show me every state" is the payoff.

### Merged (2026-10-20, Sandy: "you can do all the merges")

idea-factory #1; homework-gate #3 (Storybook) and #5 (field-notebook
direction + `design/references.md` with the brief and reference
screenshots). **Mistake:** #4 was stacked on #3; merging #3 with
`--delete-branch` deleted #4's base and GitHub closed #4. Reopened as #5
against `main`. Factory lesson: with stacked PRs, retarget children to
`main` before deleting a merged base (or don't delete it until they're
retargeted). With many parallel PRs this is a real failure mode. Also: `gh`
inside `idea-factory/homework-gate/` resolved the wrong repo once — pass
`-R infinitedusky/homework-gate`.

### Answer-key baseline: dropped for now (Sandy, 2026-10-20)

"You are asking for an artifact that is too hard to get. Let's just trust it
for now and then do tests when the system is working." The app's own key
(solved by `assistant.py` from the uploaded sheet) is trusted; it was right
on every clean worksheet so far. Measure later, from real use: a "this
answer looks wrong" button on the parent page as an event, and maybe
released state-test items with official keys. This replaces Next step 1–2
above (20–30 photographed pages).
- **Factory lesson:** a test that needs an artifact the person can't easily
  produce won't happen. Ask for cheap evidence, or measure from the working
  system. Also: say which "answer key" — the app's own, or an outside one
  used only to grade the app — Sandy and the agent talked past each other.

### Audience: teenagers (Sandy, 2026-10-20)

"This really is for teenagers. Young kids are not getting homework and their
parents can control their devices more." The student is Sandy's **little
brother**: **13, 8th grade**; plays Fortnite, watches TikTok sports
videos. Consequences:
- Nothing that feels like a kids' app (drop/limit handwritten cheer,
  mascots, Khan Kids tone). Heron's grown-up look, the Sprayground shark and
  Brick's self-chosen framing already fit.
- Borrow from Fortnite: homework steps as daily quests, mastery as tiers,
  XP across nights, the gate opening as the win screen. From TikTok: help is
  short and vertical (60-second explanations); tutor examples from sports.
- Product: teens have their own phones, so the gate must be something they
  accept — autonomy ("this is mine, it helps me") is the core, not the tone.
- Open: who is "the parent" in the interview — Sandy, the parents, or both?
- Sandy also asked to borrow from Khan Academy (mastery levels, colour by
  subject) and link out to Khan and other resources (no public Khan API
  since 2020 → search links). Comp to study: Khanmigo (Khan's AI tutor).
  The kid-style "fun pass" was stopped when the audience became teens.

### Next: a showable POC loop (Sandy, 2026-10-20)

"Let's hold off [the interview], get a POC good enough to start showing
people — we're in the weeds. The AI part is what I wanted to validate and I
think I have. It will work." Build the server and the iPhone TestFlight app
to show the loop: homework + quiz on the laptop → pass → his iPhone
unlocks itself.
- iPhone gating = Apple Screen Time API (FamilyControls / ManagedSettings).
  Development entitlement works now on devices installed from Xcode;
  **Family Controls (Distribution)** is needed for TestFlight — request on
  day one, reported waits days to months, per bundle ID.
- **Parent-managed** (Sandy): Family Sharing / child authorization, like
  Bark — a parent approves on his phone; he can't turn it off. Apple
  combines all apps' restrictions, so Bark/Downtime blocks still apply;
  for the demo Homework Gate must be what blocks games/TikTok. Pitch:
  Bark watches and blocks; Homework Gate unlocks when he's earned it.
- Server: stays on this machine behind a tunnel (Cloudflare Tunnel or
  Tailscale) so the model stays on Sandy's subscription, personal use.
  Hosted + API key later, for real users.
- Fallback demo if Apple stalls: web app + "free time unlocked" push.
- $99 Apple Developer Program is required: Family Controls isn't available
  to free Personal Teams, even for development (Apple DTS on the forums).
- **Proposed order (from `brief.md`):** NextDNS first — per-device profiles
  rewritten through its API when the mode changes; gates the laptop *and*
  the iPhone (configuration profile, no Apple account or approval); ~$20/yr.
  One server switch unlocks both = the showable loop. Then hardening: the
  Windows agent (standard account, service + Firewall + App Control,
  browser secure-DNS off by policy — the corporate endpoint model) and the
  iOS Screen Time app. Risk: DNS leaks (open apps, IP-direct, VPN, profile
  removal — parent locks that in Screen Time); fine for a demo and an
  honest 13-year-old, agents close it later.

### The gate works on a real phone (2026-10-20)

homework-gate PR #8: locked by default; unlock periods (default every day
3–10 pm) set by the parent; inside a period it opens when he turns in
tonight's homework and passes the quiz, or the parent opens it; at the end
it locks no matter what. Locked = allowlist-only (Sandy: "only Google
Classroom and us"): every top-level domain NextDNS supports is blocked
(1,433 of IANA's 1,437; it rejects .kids .merck .music .web), the
allowlist wins. The server re-checks every minute.
**Tested by Sandy on Sandy's own iPhone (profile 483b54): "it works."**
NextDNS logs showed the phone's lookups blocked after the lock, including
iCloud Private Relay's `mask.apple-dns.net`.
- Lessons: pages and DNS answers already on the phone survive the lock for
  a minute or two (Sandy saw nytimes.com "work" — it was loaded before the
  lock); the first live run caught a bug the fake tests couldn't (TLD file
  header read as domains). Hammering the NextDNS API (~480 calls in
  seconds) tripped its rate limit and left stray blocks — slow, one-time
  sweeps only.
- **DNS isn't instant** (Sandy: had to close and reopen Safari after
  unlocking). Apps cache DNS answers — including failures — and keep open
  connections, so unlock may need an app restart and lock leaks for open
  apps (a video playing at 9:59 pm keeps going). Demo-acceptable; tell him
  "close and reopen the app" in the unlock message. Real fix: the native
  layer — iOS Screen Time shields are instant → raises the priority of the
  $99 Apple Developer account and the Family Controls request.
- Tedious: finding which TLDs NextDNS accepts (automated sweep). Judgement:
  the lock model itself — took Sandy three rounds (overrides → two locks →
  unlock periods) to land; the agent's first model was wrong.

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
6. **Tutor directives: two layers** (Sandy, 2026-10-20). Universal (ranked
   directives + hard rules no profile can override) and student-specific
   (grows). The student layer starts with a **parent interview** and a
   **short talk with the child**, then grows from evidence (dated, with the
   evidence, visible and undoable). Proposed: profile has a private part
   (parent only) and a shared part written for him; write "what helps",
   not labels; expert review of the interview and format later. Same
   elicitation pattern as the design references — a reusable factory step.
   Proposed order: interview Sandy by hand in chat → directives + profile
   into the tutor's instructions + private explanation per reply →
   simulated students → child talk as an app screen.
7. **Prevent guessing** (Sandy). Gap: the tutor confirms right answers, so
   he can fish ("is it 5? 6? 9?"); multiple choice is 1-in-4 by luck.
   Principle: don't ban guessing, make reasoning the only thing that pays
   (picking the most likely is a skill — Sandy's earlier point). New hard
   rule: **never confirm an answer he hasn't explained** (or turn it into a
   self-check). Tutor notices rapid different answers and slows down,
   kindly. Quiz: fewer pure multiple choice; choice + one-line why, credit
   needs both; too-fast or flip-flopping answers recorded as signals for
   parent/profile, never penalties on screen. Guessing often means tired /
   too hard / anxious → profile ("guesses more after 9pm") → tutor adapts.
8. **Painless quiz: spoken or visual, like a game** (Sandy). Example item:
   "Walk me through how you would divide fractions." Hold-to-talk answer,
   one friendly follow-up for the why ("how many eighths fit in three
   quarters?"), credit for steps + meaning; "I don't know" opens the tutor
   (two-strikes rule). Plus visual items (drag fraction bars, pick the
   picture, order the steps) and quick taps for early wins; the shark eats
   a bit of the to-do list after each. Speech: browser Web Speech API first
   (Chrome/Edge on his laptop), a transcription provider later. Grading:
   model on the transcript against a short rubric, tolerant of messy maths
   transcription. Risk: speaking aloud at night isn't always comfortable →
   typing always available. Remove the visible per-question countdown and
   auto-submit; keep time as a quiet parent-page signal. Explaining aloud
   also answers "prevent guessing" (7).
9. **TVs and every screen — next after the phone loop** (Sandy: "the TV is
   important… sooner than later"). Need: when the parent's at work, the TV
   doesn't work until homework's done; brand-agnostic.
   **Tamper rule (Sandy): if any part of the gate goes quiet, everything
   locks** — unplug the TV gadget and phone + laptop lock; remove the
   phone's profile and laptop + TV lock; parent alerted. Turns every weak
   spot into a bad trade; makes cheap hardware good enough. Extends the
   brief's "failure means locked" and NextDNS last-seen heartbeat.
   Software *on* the TV is per-platform and mostly can't block other apps
   (Google TV via Family Link the exception) → rejected. Brand-agnostic
   software lives outside the TV: (1) home router → NextDNS, all DNS forced
   (every app on every screen; unplugging the router costs his phone's
   internet too); (2) an HDMI-CEC dongle (Pi-class, our software) for "won't
   turn on at all", tamper rule makes unplugging pointless.
   Recommended order: tamper rule + router next, dongle prototype after.
   Waiting on: router admin access at the house (else a cheap second
   router).
5. **Bounties and a support circle** (parked). Parents post bounties for
   extra work; others in his life join in (an uncle reading with him 3 h a
   week; the parent offers a gift card to the helper) — framed as
   relationships forming his support group, not paying people. Research:
   overjustification effect (contingent rewards for things he'd do anyway
   can lower motivation; unexpected celebrations least harmful);
   self-determination theory (autonomy, competence, relatedness — the circle
   is relatedness). Risk (Sandy): nobody joins → "why is no one helping
   me". Rule if built: the circle is never shown as a count or ranking; he
   sees what people did, never who didn't. Needs a child psychologist
   before building. Cheapest evidence: text three relatives a real invite,
   see who says yes.
   - **Factory lessons:** capture without chasing; some ideas can't be
     tested cheaply or by the agent — say so and offer the cheapest real
     evidence; mark "needs expert" and keep parked rather than fake it.
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
- One git worktree per branch (`idea-factory-worktrees/<branch>`); the main checkout stays on `main` and
  nobody works in it. Two sessions sharing a checkout collided on 2026-10-20.
- Short answers; lead with the answer. State, next step and who takes it.
- Questions are questions, not instructions to change things.
- Lead with the strongest counterargument; give a recommendation, not a survey.
- Telemetry over tests: a real signal from the running app is the proof.
- Say "local" / "this machine", not "laptop".
- Pronouns: they/them.
- Don't reinvent: check for an existing library or official integration first.
- Write decisions into the documents (this log, SHAPE.md) the moment they're
  made; the next session only knows what's written here.
