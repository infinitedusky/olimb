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
   not build the tool before the log shows what it is. *(Amended 2026-10-20:
   Lightsprint plays the middle — see "Build Homework Gate with Lightsprint"
   below; the ends stay by hand.)*

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

### Idea raised: a minimal brand ERP, Lightsprint-style (Sandy, 2026-10-21)

"ERP very lightly": describe a business process in plain English → an agent wires the brand's SaaS tools
(Shopify, suppliers, inventory, shipping, accounting, email) into a workflow → preview on real data → approve.
Start with clothing, which Sandy knows. Fit: a second *app* the factory builds (database-driven, working on
external systems; the brand's own numbers propose and judge changes), not a second engine. Strain: positioned
as an extension of Shopify, not PostHog — different buyer; crowded (Odoo, ERPNext, Katana, Cin7, n8n agents);
new part is agent wiring + Sandy's industry knowledge. Decision: capture, don't build before the engine exists
(the engine builds it). Cheapest test, Sandy's: 3–5 clothing-brand owners, what they'd pay to stop doing by
hand, kill line set first.
**Sharpened (Sandy):** focus on manufacturing. The wedge is a **standardized tech pack**: manufacturers accept it
(or we convert to standards that exist), then advertise on our site. Findings: no open tech-pack schema exists
(Excel/Illustrator templates, PLM-vendor formats); nearby: ASTM/ISO sizing, GS1; the forcing function is the
**EU Digital Product Passport for textiles** (ESPR; JRC proposal 49 data points / 4 categories at batch level;
delegated act ~end 2027) — a DPP-ready tech pack is a standard with regulation behind it. Standards win by
converter + network: "send any tech pack, get a complete, factory-ready one, missing fields flagged" (agent-shaped
work); clean packs = fewer rounds for factories; listings bring RFQs; open schema + open converter fits the
open-source thrust. Counterargument: marketplace graveyard (Zilingo, Fashinza) — trust, MOQs, sampling, payment
are the hard parts, not formats; supply-side adoption is the risk. Cheapest test (Sandy's): 3–5 manufacturers —
share of packs needing clarification, would they list free if packs came clean; then a fake door (upload a real
tech pack). Engine first; the converter is a candidate first idea for the factory to run end to end.
**Then (Sandy): "It's hard to retrofit any company, easier if you start using this."** Be the default for
people *starting* a brand — no process to replace, the standard is theirs from the first garment; the converter
runs outward (our standard → each factory's existing format), so manufacturers change nothing either. Flips the
cheapest test to the demand side: people starting a clothing line (Shopify communities, print-on-demand
graduates, fashion-school grads); fake door "build your first tech pack, factory-ready"; a real sign-up is the
behaviour that costs. Manufacturers second, once packs arrive.
**Then (Sandy): all communication runs through the system and is recorded.** The communication is the data:
every factory clarification question = a missing field in the standard (the loop applied to a standard; events:
rounds per pack, fields questioned, time to first sample); the trust layer the graveyard lacked (what was
specified, changed, agreed, when); DPP provenance by construction; possible because new brands have no channel
yet. Counterargument: people route around channels (WhatsApp/WeChat/email; Upwork fights it; Alibaba keeps chat
because payment runs through it) → communication stays where the *obligation* lives: RFQ, quote, PO, sample
approval, change request, payment — make the actions happen in the system, let conversation attach, never a
rule against outside chat. Open (Sandy's): **do payments run through the system?** Decides completeness of the
record and the business model. Note: tech packs are IP; EU data → retention/consent from day one.

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

### Research correction: Lightsprint seeds previews by default (Sandy, 2026-10-20)

Sandy found it in Lightsprint's onboarding (step 4 of 8): "What data should
your preview use?" — **Sample data (Recommended)**, "realistic placeholder
users, accounts and records", versus "My real data" via env vars, switchable
in Settings. Not in their docs; our research read the docs and said "no
generated seed data in previews". Corrected in `research/lightsprint.md`,
both `comps-*.md` and SHAPE.md.
- What it changes: a seeded preview is table stakes, not our edge. Our edge
  narrows to what's still unfound — the demo saying which data is fake, the
  demo tied to a hypothesis and baseline, and telemetry judging the result
  after merge. Confirms the build order: telemetry loop first.
- Borrow the pattern: sample data by default, real data opt-in.
- Open: how they make it (likely the setup agent writes a seed script per
  stack), whether it's deterministic or scoped to the change, whether the
  preview labels it. The free tier would tell us — hand it one Homework Gate
  change (still the cheap test proposed in the comps).
- Factory lesson for research: open the product, not just its docs.
- **PostHog in Lightsprint** (Sandy noticed; docs checked): a Composio
  connector agents can query when asked ("what's the funnel conversion…",
  "is the feature used"). Not an automation trigger, nothing after merge.
  Data is a tool there, not the input or the judge — our positioning holds.
  Risk: their Triage action makes a PostHog trigger a sprint away (closes
  signal → task; not baseline → verdict). Sandy to check in the app whether
  PostHog shows up as a trigger. Details: `research/lightsprint.md`.

### Build Homework Gate with Lightsprint, to learn it (Sandy, 2026-10-20)

Sandy is connecting Lightsprint to the homework-gate repo and will build with
it: "understand their product as best as I possibly can and see if there's
actually a gap." Two principles from Sandy: (1) know the closest competitor by
using it, not reading it; (2) "just because they're doing the same thing
we're doing, you can position your company slightly differently and win."

How this fits "act as the factory by hand": Lightsprint *is* the by-hand
factory for the middle (describe → build → preview → QA → PR). The ends stay
by hand — baseline and hypothesis before, labelled fake data in the demo,
telemetry verdict after — because they don't do them. Per task, log three
things: what Lightsprint did, what we had to do ourselves, what it couldn't
do. The third column is the spec.

Questions it should answer (checked in the product, since the docs undersell
it):
1. **Sample data** on a Python/FastAPI/SQLite/Jinja stack: how it's made,
   whether it's the same across tasks, whether anything in the preview or PR
   says it's fake.
2. **The model in the preview.** Their sandbox can't use Sandy's Claude
   subscription (`HG_CLAUDE_CODE=1` is local `claude -p`). The preview runs
   on `HG_FAKE_LLM=1` (canned) or an API key in their env vars. Watch whether
   the QA "Verification" comment says the tutor's replies were canned — the
   exact "what's fake and why" problem, on a real PR.
3. **PostHog**: is it an Automations trigger? Can Triage take a PostHog
   event? Can a plan or task carry a success metric at all?
4. **After merge**: anything at all?
5. **Plan mode pushback**: does it ever say "don't build this" or "measure
   first"?
6. **Setup agent** on a non-JS stack: how much by hand, how many PRs.
7. **Stacked / parallel tasks** from one base — the failure we hit with
   PR #4.

Cautions:
- **Claude subscription in Lightsprint — corrected 2026-10-20.** The earlier
  "don't connect it" was too strong. Anthropic's own docs: `claude
  setup-token` mints a one-year `CLAUDE_CODE_OAUTH_TOKEN` "for CI pipelines,
  scripts, or other environments where interactive browser login isn't
  available", on Pro/Max/Team/Enterprise, and the GitHub Action runs Claude
  Code on it on GitHub's runners ("runs use your Claude subscription instead
  of API billing"). So Claude Code headless on someone else's machine on a
  subscription is sanctioned. What was cut off in Feb 2026 is third-party
  harnesses using subscription OAuth as their own credential. **The
  discriminator is what Lightsprint's "connect Claude" asks for:** paste a
  `claude setup-token` → they run the real `claude` binary in the sandbox,
  same shape as the GitHub Action, fine; a "sign in with Claude" OAuth
  redirect → app-level OAuth, the restricted shape, don't. Their docs don't
  say which ("where available"). Two costs either way: Lightsprint tasks
  draw from the same Max weekly caps as local Claude Code, and the token is
  readable by anything on the stack like any env var.
- Their env vars are readable by every agent on the stack — staging keys
  only; the NextDNS key and any Anthropic key with real spend stay out.
- Free tier is 5 tasks/plans a week; spend them on the questions above.
  **Connecting the Claude subscription doesn't lift it** (Sandy, 2026-10-20):
  the 5/week is a plan cap on tasks, separate from who pays for the model.
  Their billing docs even say a free seat ignores the personal subscription
  ("runs count against the workspace's credits and weekly limit"), which
  contradicts the pricing page. Pro ($40/seat) removes the cap; with the
  subscription connected, the 10M credits then cover only sandboxes and
  previews. Sandy connected it; which flow (pasted setup-token vs OAuth
  redirect) still to note.

### Funding path: apply to YC with Homework Gate (Sandy, 2026-10-20)

Sandy's lean: apply with Homework Gate, pivot (to the factory) if it doesn't
hold. Context: "an idea is not enough to get funded" now, and building
exposes you to a better-funded copy — the way out is users who depend on it
plus the evidence (the cohort table), which the factory produces per idea.
- YC funds founders over ideas and routinely funds competitors of its own
  portfolio (TechCrunch 2024: a dozen-plus AI code editors across batches),
  so Lightsprint being YC S26 does not block the pivot.
- **Winter 2027 deadline: November 2, 2026, 8pm PT** (ycombinator.com/apply,
  confirmed) — 13 days out. Decisions by Dec 11; interviews by video Nov–Dec;
  late applications still read. Batch Jan–Mar 2027 in San Francisco. Spring
  2027 deadline projected ~Feb 2027 (unconfirmed).
- Proposed, not decided: apply W27 with what exists (cheap; a read on the
  reaction), and set lines for S27 the way the method says — e.g. 5–10
  families using it on 3+ nights a week for 4 weeks, at least one paying.
  Hit the lines → the application is Homework Gate, the factory is "how we
  build". Miss them → the application is the factory, Homework Gate its
  first product and proof. One thesis per application, the other as the
  alternative idea, never both as the pitch.

### DECIDED: go hard on Homework Gate (Sandy, 2026-10-20)

"We need to go hard on Homework Gate. I am going to get usage as quickly as
possible. I also need to start talking to as many VCs and other people in
the edtech space that I can." Supersedes the "Next" sections above.

- **Homework Gate is the company for now.** The idea factory is how it gets
  built: Lightsprint for the middle, the loop by hand at the ends (baseline,
  hypothesis, PostHog verdict), every step still logged here. The factory's
  own UI (`app/`, branch `ui-minimal`) waits.
- **Usage first.** Families using it on real phones, by hand (PG: recruit
  them one at a time, set each one up yourself). Activation = a first night
  completed: homework turned in, quiz passed, phone unlocked. The one weekly
  metric: nights completed per family. PostHog goes in now — it's the
  evidence for YC and for every investor conversation.
- **Conversations, Mom Test rules:** commitments, not compliments. A VC
  conversation counts if it ends in an intro, a follow-up or a term; a
  parent conversation counts if it ends in a setup call booked. Log each
  one (who, what they committed to) — that ledger is the investor update.
- **YC W27, deadline Nov 2** (above). Apply with what exists; reapply with
  the numbers.

### Lightsprint connected; first observation (2026-10-20, 21:50Z)

homework-gate PR #10, branch `ls/3-get-the-preview-env-working-wp1Z`, "Fix
unstyled pages in the stack preview (root-relative static URLs)" — the
setup agent's PR to make the preview load on the FastAPI/Jinja stack,
exactly the docs' "opens pull requests when repository changes are needed".
Question 6 (setup agent on a non-JS stack): one PR so far, a static-URL
fix. **Sandy deleted the task in Lightsprint's UI** — PR #10 is closed; the
`ls/3-…` branch is still on origin (deleting a task closes the PR, leaves
the branch). Preview setup gets redone after the Next.js move, since the
stack becomes two services (Next + FastAPI). Also open: PR #9 (`posthog`
branch) — PostHog telemetry on the night's counts, timings and outcomes.

### Idea raised, not decided: open-source the factory (Sandy, 2026-10-20)

Sandy, mid-build: "we make idea-factory open source", "we don't try to
make money", "a VS Code extension with some upgrades that are cheap if you
want pro", "we open source it and try to get contributors."
- Reading: open core (free core, cheap pro) — PostHog's and GrowthBook's
  shape, and YC-compatible (PostHog is YC). It is the natural form of
  "an extension of PostHog": the thing PostHog users install, and what
  PostHog would buy. Lightsprint is closed, so this is a real difference.
- Counterargument: contributors follow users, not licences. OSS is a
  distribution channel only once there is a working loop on a real app to
  show (Show HN, PostHog's community). The order doesn't change: Homework
  Gate usage first; the factory opens with Homework Gate as its proof.
- VS Code extension: a surface, not the product. The loop (telemetry in,
  PRs out, verdicts) lives in a local daemon — InDusk's MCP server + admin
  shape — and an extension is one front end on it, alongside the web UI.
  Cline-style marketplace distribution is cheap and real; decide the
  surface when the daemon exists.
- Cheap to do now: product code in its own repo from the first commit,
  with an MIT or Apache licence, no secrets; this design repo (LOG, SHAPE,
  the brother's details) stays private and never gets opened as-is.
- Sandy: "it is a passion project worst case." That's the floor, and it's
  a fine one; the method's kill rules still apply to the ceiling.

### DECIDED: Homework Gate UI moves to React (Sandy, 2026-10-20)

Sandy: "I don't like the idea of building that part on Python." The Jinja
UI was the agent's default, never asked — same failure as the colours
earlier today. **Correction, Sandy:** "the distraction and the problem is
that you built this as you built it without asking." Rule recorded in
SHAPE (stack is foundational: ask) and in memory.
- Backend stays Python: FastAPI, SQLite, assistant/tutor/guard/quiz/grading.
  Jinja routes become JSON endpoints.
- Front end: **Next.js** (Sandy's pick over Vite; agent had recommended
  Vite), TypeScript, Tailwind v4 (tokens in `@theme`), React Storybook +
  MSW for the labelled fake states (port the 19 states from PR #3, not the
  server-mode plumbing), PostHog JS SDK.
- Parity with the five pages first, then the shark gate and the quiz UX.
- **Built with Claude Code locally** (Sandy's pick), not Lightsprint.
  **Lightsprint parked until funded** (Sandy, 2026-10-20: "we build here,
  we can use this when we are funded") — the free tier's 5 tasks/week
  isn't lifted by the subscription, and Pro is $40/seat on top. The seven
  questions stay open; the Billing page still shows what the setup task
  cost, worth one look.

### Done by hand: Homework Gate UI on Next.js — homework-gate PR #11 (2026-10-20)

Branch `next-ui` off `main` (not stacked on #9). `web/`: Next.js 16 (Cache
Components), five pages as views with data in as props, 19 page states as
React Storybook stories from `stories/sample.ts`, a vitest run that renders
them all headless, browser PostHog as page views by role. `poc/`: the night's
state machine and actions moved to `hg/night.py`; `hg/api.py` serves them as
JSON under `/api`; `app.py` keeps the Jinja pages on the same functions, so
`main` (his phone's server) keeps working. 23 pytest, tsc, lint, `next build`,
19/19 stories, and an end-to-end smoke through the proxy all pass.
- **The API test caught a real leak.** Returning SQLite rows as JSON sent the
  answer key (and quiz answers) to the student; the Jinja templates had only
  ever *displayed* safe fields. Fixed with `public_state` at the API boundary
  and an assertion that scans the JSON. Factory lesson: a serializer shows
  everything a template hid — any HTML→API move needs a leak test, and the
  invariant ("the answer key never reaches the student") must be a test, not
  a sentence.
- **Hazard: a live server shares the dev machine.** Port 8000 was Sandy's
  other session's server (the one his phone uses). My first smoke test hit it
  by accident, and my cleanup `pkill` pattern was broad enough to have killed
  it — it survived only because its command line differed. Rule from now:
  tests use their own ports, processes are killed by PID only, and the
  factory must know which processes on a machine are production.
- **Next 16 changed under me.** `create-next-app` now enables Cache
  Components; anything reading request data (`cookies()`, `usePathname()`,
  uncached fetch) must sit behind `<Suspense>` or the build fails. The
  framework ships its docs in `node_modules/next/dist/docs` and says to read
  them first; reading them before writing saved a rewrite. Storybook's
  `next/navigation` mock needs `parameters.nextjs.appDirectory: true`.
- Tedious (→ automate): the scaffold and addon trimming; porting templates
  1:1 to components; porting tokens; porting the 19 sample states; the CI
  job; the smoke-test script; the README/CLAUDE.md updates.
- Judgement: keep Python as the backend and share one set of actions between
  both UIs rather than duplicate; keep the Jinja pages until the React app
  has done real nights; keep the provisional look (tokens make the
  field-notebook re-skin cheap, and the look is Sandy's call); where the
  Suspense boundaries go.
- Not in #11: the 10 field-notebook mockups (still Jinja, in the server-mode
  Storybook until the look is chosen); re-placing #9's telemetry calls into
  `night.py` after it merges; pointing the tunnel at :3000 (two processes
  now); removing Jinja, `stories.py` and `storybook/` (follow-up PR).
- Next: Sandy reviews #11; merge #9, then the telemetry re-placement; then
  the shark gate and the quiz UX on the React app.

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
