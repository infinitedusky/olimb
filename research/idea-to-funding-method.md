# Idea to validated product to funding — a practical method (2026)

Researched 2026-10-20. Every claim carries a source URL. Confidence is marked **high / moderate / low**. Anything taken from memory rather than a page fetched for this note is marked **[unverified]**. Most of the benchmark numbers come from secondary sources (vendor blogs, newsletters). Treat them as directional starting points that each idea replaces with its own baseline.

---

## 1. The strongest counterargument first

The idea factory model assumes that cheap, parallel validation tests find winners. The best evidence cuts both ways.

- **Studios that do this at scale kill about 90% of ideas, and most of their output still comes from a tiny fraction.** Pioneer Square Labs tested "nearly 250 ideas", spun out 25 and killed about 90% ([PSL](https://psl.com/feed-posts/5-steps-to-embrace-test-driven-learning-to-find-product-market-pull-pmp)). Its validation stage takes about four months per idea, using interviews, landing pages with targeted traffic and in-house kill tooling ([GeekWire 2021](https://www.geekwire.com/2021/seattle-startup-studio-pioneer-square-labs-spun-25-ideas-5-years-way/)). The kill rate works, but it costs a full-time team plus paid traffic. A solo founder running ten ideas at once does not have four months of team time per idea. **Confidence: high** that a parallel portfolio needs either a smaller per-idea budget or fewer ideas running at once.
- **Timing beats the idea.** Bill Gross's Idealab analysis ranked timing first, accounting for 42% of the difference between successes and failures, ahead of team, idea, business model and funding ([tech.co summary of TED 2015](https://tech.co/bill-gross-ted-2015-06)). It is a single talk, not a peer-reviewed study (**moderate**). A fake-door test measures interest today and says little about timing.
- **Fake doors measure curiosity, not use.** Painted-door tests "measure initial interest and may not accurately predict actual behavior once a feature is built" ([Amplitude](https://amplitude.com/explore/experiment/painted-door-testing)). A factory that only runs top-of-funnel tests will mostly select for good copywriting.
- **Studio outperformance is self-reported.** GSSN reports that 72% of studio startups go from seed to Series A, against 42% of traditional startups. An independent Bowery Capital sample of in-house incubations found only 12% raised a Series A ([Bowery](https://bowerycap.com/blog/insights/thoughts-on-vc-firms-incubating-ideas/), [Investing.com skeptic](https://www.investing.com/studios/article-383340)). **Confidence: low** that "studio method → higher success" is established.

The method below takes these seriously. Tests climb a commitment ladder, an idea is only called validated on behavior that costs the user something, and the factory says plainly when a test cannot be read.

---

## 2. What each body of practice contributes

| Source | Use it for | Key rule |
|---|---|---|
| **Lean Startup** (Ries) | The loop and the decision | Name the leap-of-faith assumptions, set a baseline, tune, then decide to pivot or persevere. Vanity metrics "give the rosiest possible picture". Speed through the *whole* loop matters, not any one step ([summary](https://www.antoinebuteau.com/lessons-from-eric-ries/), [summary](https://chrislehnes.substack.com/p/the-lean-startup-by-eric-ries)). |
| **The Mom Test** (Fitzpatrick) | Interviews | Compliments are worthless and commitments are gold. A meeting only counts as a success if it ends in a commitment or advancement (time, reputation, money). Ask about past behavior, never hypotheticals ([mtlynch](https://mtlynch.io/book-reports/the-mom-test/), [Unusual VC](https://www.unusual.vc/rob-fitzpatricks-mom-test/)). |
| **Jobs to be done / switch interviews** (Moesta) | Why people switch, and which competitor you are really replacing | Four forces: push and pull must beat anxiety and habit. Reconstruct the timeline from first thought through passive looking, active looking and deciding to consuming. Anchor on a specific recent purchase ([Business of Software talk](https://businessofsoftware.org/talks/understanding-your-customer-jtbd/), [jobstobedone.org](https://jobstobedone.org/)). |
| **Pretotyping** (Savoia, *The Right It*) | Turning ideas into falsifiable, cheap tests | Over 80% of new products fail even when competently executed ([Product Compass](https://www.productcompass.pm/p/how-to-build-the-right-product-with)). "Trust only in Your Own DAta (YODA)" ([pretotyping.org](https://www.pretotyping.org/)). **XYZ hypothesis**: "At least X% of Y will do Z" ([Product Compass resources](https://res.productcompass.pm/top-product-management-books/the-right-it)). Weight evidence by skin in the game. |
| **Fake door / painted door** | Demand for one feature or product | Set the threshold before launch, use real target traffic, always close the loop honestly, never fake payment or cancellation paths ([Amplitude](https://amplitude.com/explore/experiment/fake-door-testing), [Koji](https://www.koji.so/docs/fake-door-testing-guide)). |
| **YC / Paul Graham** | Launch and growth | "A good growth rate during YC is 5-7% a week. If you can hit 10% a week you're doing exceptionally well." Measure revenue, or active users if you are not charging yet. 1% a week means you haven't found direction ([PG, Startup = Growth](https://paulgraham.com/growth.html)). Recruit users by hand, delight them, do the work manually first ([PG, Do Things That Don't Scale](https://paulgraham.com/ds.html)). Seibel: "launch something bad quickly" ([summary](https://www.antoinebuteau.com/lessons-from-michael-seibel/)). |
| **Sean Ellis test** | Product-market-fit signal once you have users | Share answering "very disappointed" ≥ 40% (a heuristic Ellis admits is somewhat arbitrary). Drop non-users from the denominator, segment the results, and pair them with cohort retention ([learningloop](https://learningloop.io/plays/product-market-fit-survey), [Koji](https://www.koji.so/docs/sean-ellis-test-product-market-fit)). |

**Pretotype types from *The Right It*** [unverified: from memory of the book, not confirmed by a fetched page]: Mechanical Turk (a human behind the machine), Pinocchio (a non-working mock you carry around), Fake Door, Facade, Infiltrator (your product placed inside someone else's channel), One-Night Stand (deliver the service once, by hand), Re-label, Provincial (a small local launch), YouTube (a video demo), and MVP. Also from the book [unverified]: **hypozooming**, which narrows a big XYZ down to a local "xyz" you can test this week (e.g. "at least 10% of the students in this building will…").

---

## 3. How studios run many ideas and kill most of them

| Studio | Pipeline | Kill rate or ratio | Source |
|---|---|---|---|
| Pioneer Square Labs | Ideation → validation (about 4 months, most ideas die here) → creation → spinout → scale | about 250 tested, 25 spun out, ~90% killed | [PSL](https://psl.com/feed-posts/5-steps-to-embrace-test-driven-learning-to-find-product-market-pull-pmp), [GeekWire](https://www.geekwire.com/2021/seattle-startup-studio-pioneer-square-labs-spun-25-ideas-5-years-way/), [Global Venturing](https://globalventuring.com/corporate/information-technology/cvc-unplugged-best-way-to-do-ai-is-kill-bad-ideas-early-pioneer-square-labs/) |
| Atomic (Jack Abraham) | Standing list of 800+ ideas. A few hundred thousand dollars proves the thesis, then low single-digit millions to build. Studio partners co-found every company and recruit the CEO. | "roughly half" of started companies shut down before using much money. 16 founded in one year. | [Fortune 2023](https://www.fortune.com/2023/05/15/venture-studio-atomic-raised-320-million-fund), [TechCrunch 2021](https://techcrunch.com/2021/11/17/talking-atomic/) |
| Hexa (formerly eFounders) | Studio team plus an entrepreneur paired for 12–18 months. Market deep dive, competitor map and interviews before launch. 40+ companies (Aircall, Front, Spendesk). The founder calls it "handcrafted" and hard to scale. | Not published | [tech.eu](https://tech.eu/2022/11/30/efounders-rebrands-to-hexa/), [Hexa letter](https://www.hexa.com/blog/news/hexa-letter-1-a-new-way-for-entrepreneurship) |
| Idealab (Bill Gross) | Many companies over decades. Analysis showed timing mattered most. | n/a | [tech.co](https://tech.co/bill-gross-ted-2015-06) |

**Common pattern (moderate):**
1. A large backlog with cheap entry.
2. Staged capital or time with a gate at each stage.
3. A dedicated validation stage measured in months, not years.
4. Killing is celebrated. PSL says the ~90% kill rate is what it is "most proud of".
5. A founder or CEO is attached only after validation.

Atomic's two-stage cheque structure is the clearest model for an individual: a small, fixed budget per idea that unlocks a larger budget only on evidence.

---

## 4. How AI changes the economics

- **Build cost has collapsed.** About a quarter of YC's Winter 2025 batch had codebases that were ~95% AI-written (Jared Friedman). Garry Tan said the batch as a whole grew 10% a week ([CNBC via NBC](https://www.nbcnewyork.com/news/business/money-report/y-combinator-startups-are-fastest-growing-most-profitable-in-fund-history-because-of-ai/6188199/)). These are YC's own claims, not independently audited (**moderate**).
- **The bottleneck moves to specification, distribution and proof.** One analysis argues "the cost of building software has dropped toward zero, but the cost of building a successful business has never been higher" ([Fueler](https://fueler.io/blog/how-ai-is-changing-startup-building)). That is a blog, not data (**low–moderate**), but it is consistent with investors' 2026 focus on retention and quality of revenue (below).
- **What this means for the factory (my inference, moderate):**
  1. When a working v0 costs a day of agent time, a *real* minimal product is often a cheaper and more honest test than a fake door. A fake door is still right when the build is costly (integrations, regulation, hardware) or when you need to measure demand before you have any users.
  2. The scarce input is *qualified traffic and conversations*, not code. Budget per idea should be in people reached, not features built.
  3. Shipping fast multiplies maintenance cost. One analysis reports a big rise in code volume and technical debt ([Epsilla](https://epsilla.com/blogs/2026-03-07-coding-agents-singularity), **low**). A killed idea's code should be deleted, not kept running.
  4. Agents can run the operations: generating landing pages and variants, setting up event tracking, buying small ad budgets, summarizing interview notes, drafting reports. They must not *decide* to kill or continue, and must not invent interview evidence.

---

## 5. What investors want (2025–2026)

| Stage | Typical bar | Source and confidence |
|---|---|---|
| **Pre-seed** | Team plus insight plus early proof: a live product and first users or LOIs. YC's guidance is to launch within weeks, and to grow 5–7% a week once launched. | [PG](https://paulgraham.com/growth.html), [Seibel summary](https://www.antoinebuteau.com/lessons-from-michael-seibel/) — moderate. No authoritative numeric pre-seed bar found. |
| **Seed** | Median 2025 seed pre-money about $16M (Carta Q1 2025). Round about $4M median and about 20% dilution (secondary summary of Carta). Traction rules of thumb: $5K–$50K MRR (SaaS), 50–500 engaged users (consumer), 5–15 customers (enterprise). AI companies are judged more on growth rate than on absolute ARR. Some European AI seeds ask for €500K+ ARR. | [Carta Q1 2025](https://carta.com/data/state-of-private-markets-q1-2025-full-report/), [ful.io](https://ful.io/blog/raising-capital-for-saas), [unicorn-nest](https://unicorn-nest.com/media/analytics/ai-genai-seed-metrics-2026/), [causo](https://hub.causo.ai/guides/seed-mrr-benchmarks-2026) — Carta high, the rest low–moderate |
| **Seed → Series A** | Median gap 616 days (Q2 2025). Plan on about 20 months of runway, not 12. Series A median revenue about $2.5M (Carta-based; sources range $1M–$5M). Only about 30–35% of 2025 seeds reached a Series A. | [CRV, Jul 2026](https://crv.com/content/ai-startup-funding), [Carta Q2 2025](https://carta.com/data/state-of-private-markets-q2-2025/), [ful.io](https://ful.io/blog/raising-capital-for-saas) — moderate |
| **AI-specific diligence (2026)** | Quality of revenue: AI ARR often blends one-off, credit-based and outcome-based revenue. Investors look at **usage depth** (embedded in daily workflows vs. experimenting) and **pilot-to-production conversion** ("only about one in 10" companies move agents to production). They want a rising retention trajectory and expansion, not SaaS-level retention yet. Burn multiple is tracked. | [CRV AI funding](https://crv.com/content/ai-startup-funding), [CRV KPIs](https://www.crv.com/content/key-performance-indicators) — moderate–high |

**Implication.** A fundable idea-factory output is not "a landing page converted at 12%". It is a **cohort table**: who came, who activated, who came back at week 4, 8 and 12, who paid, who expanded, and the weekly growth rate of the one metric that matters. The factory should produce that table automatically from day 1 of a real product.

---

## 6. The method

### Stage 0 — Capture (minutes)
Write a one-line idea, a target user (Y), the job to be done, and a **why-now** line (Gross's timing factor).
*Automate:* deduplicate against the backlog, and draft the XYZ from the one-liner.

### Stage 1 — Frame (≤ 1 day)
- List the **leap-of-faith assumptions**: value (will they use it?), growth (how will they find it?), willingness to pay.
- Write each one as an **XYZ hypothesis**, then **hypozoom** it to a local xyz testable within 2 weeks: "≥ 8% of [r/devops visitors who click our ad] will join the waitlist with their work email".
- **Pre-register** the kill line, the success line and a **look-by date** before seeing any data ([Amplitude](https://amplitude.com/explore/experiment/painted-door-testing): "Decide what your tolerance is before running the painted door, not after").
- **Testability check (honesty gate).** Run a sample-size/MDE calculation against reachable traffic. If the minimum detectable effect is larger than any plausible lift, the factory says so: "this cannot be A/B tested; use interviews/concierge" ([Convert](https://convert.com/blog/a-b-testing/i-dont-have-enough-traffic-to-a-b-test-now-what/), [RevenueCat](https://www.revenuecat.com/blog/growth/testing-strategies-for-low-traffic-apps.md)). Rough rule: below about 10K monthly visitors on the tested page, only lifts of about 30% or more are detectable. That threshold is from a vendor and **low** confidence. Compute it per idea.

### Stage 2 — Problem evidence (1–2 weeks, budget: hours plus at most about $0)
- 5–10 **Mom Test / switch interviews** with Y. Log *past behavior*, current workaround, money or time already spent, and the four forces.
- **Kill if:** fewer than about 3 of 10 can describe a recent concrete struggle, or nobody has spent time or money on a workaround. This threshold is my heuristic (**low**). Its purpose is to make the rule explicit and editable.
- **Advance if:** at least one commitment per interview set (intro, pilot, deposit, follow-up call).

### Stage 3 — Demand evidence (1–3 weeks, budget about $100–$500 of traffic or outreach)
Pick the *cheapest test that reaches the needed rung of the commitment ladder*:

| Rung (weak → strong) | Test | Rough benchmark (directional) |
|---|---|---|
| Click | Fake or painted door, ad CTR | Set per idea. No standard benchmark exists ([search result summary; Amplitude/Koji](https://www.koji.so/docs/fake-door-testing-guide)) |
| Email | Landing page or waitlist | Warm traffic 25–45%, cold organic 10–20%, paid 3–10% ([LaunchList](https://blog.getlaunchlist.com/blog/why-is-my-waitlist-not-converting)). Below 5% sustained suggests weak interest or messaging ([summary](https://painonsocial.com/blog/smoke-tests-complete-guide-startup-founders)) — low |
| Specifics | Email plus a qualifying question, or booking a call | — |
| Money | Pre-order, deposit, card capture, paid pilot | Strongest signal. Waitlist → paid 5–25%, about 20% if admitted within a month, under 10% after 3 months (Lenny via a16z speedrun, secondhand: [flowjam](https://www.flowjam.com/blog/waitlist-conversion-calculator)) — low–moderate |

- **Ethics (enforced, not optional):** after a fake-door click, show an honest "not built yet, want early access?" message. Never fake payment completion or cancellation ([Koji](https://www.koji.so/docs/fake-door-testing-guide)).
- **Kill if** the pre-registered line is missed at the look-by date with an adequate sample. **Extend once** if the sample was too small, then kill or reframe.
- AI shortcut: if a real v0 can be built in about a day, prefer a **concierge or Wizard-of-Oz v0** (Savoia's Mechanical Turk, PG's "do things by hand") over a pure fake door. It produces activation and retention data, not just clicks.

### Stage 4 — Value evidence (4–8 weeks, real users, v0 product)
- Ship a narrow v0 to the waitlist within weeks ("launch something bad quickly"). Admit people fast: waitlist conversion decays after about 30 days (see above).
- Instrument: **activation event** (the user's first moment of real value), **week-1/4/8 retention cohorts**, **one weekly metric** (revenue, or active users).
- **Advance if:**
  - The retention curve **flattens** instead of decaying to zero. That is my reading of standard practice; benchmarks below.
  - Weekly growth is ≥ 5% on the chosen metric ([PG](https://paulgraham.com/growth.html)).
  - At least some users pay, or would pay at a stated price.
  - Sean Ellis "very disappointed" ≥ 40% among active users, once there are 30–40 or more of them. The sample-size floor is my heuristic (**low**).
- **Kill or pivot if:** retention decays to near zero by week 4–8, or growth stays at about 1% a week ("haven't found direction", [PG](https://paulgraham.com/growth.html)).

### Stage 5 — Traction and fundability (2–6 months)
- Retention benchmarks at **6 months** (Lenny Rachitsky, good / great): consumer social 25% / 45%, consumer transactional 30% / 50%, consumer SaaS 40% / 70%, SMB SaaS 60% / 80%, enterprise 70–75% / 90% ([Lenny's Newsletter](https://www.lennysnewsletter.com/p/what-is-good-retention-issue-29)) — moderate–high as a widely used reference.
- For AI products, also report **usage depth** (daily-workflow share), **pilot → paid conversion**, gross margin after compute, and the revenue mix (recurring vs one-off vs credits) ([CRV](https://crv.com/content/ai-startup-funding)).
- **Raise when** the cohort table and growth rate tell the story by themselves. Seed rules of thumb are in §5.

### Stage 6 — Ship and measure (continuous, for anything built)
Each shipped feature restates its hypothesis, gets a baseline, and gets a look-by date. A demo plus a post-ship measurement replaces "done". If a feature misses its line, remove it or reframe it, and record why.

---

## 7. Portfolio rules

- **Work-in-progress cap.** A solo founder can run 1 idea in Stage 4+, 2–3 in Stage 3, and any number in Stages 0–1. This is my inference (**moderate**): studios with full teams spend about 4 months per idea in validation (PSL). Interviews and traffic don't parallelize for a single person the way code does with agents.
- **Time boxes.** Stage 2 ≤ 2 weeks, Stage 3 ≤ 3 weeks, Stage 4 ≤ 8 weeks, each with a look-by date. One extension at most, only for insufficient sample.
- **Budget gates (Atomic-style).** A small fixed allotment per stage, and the next allotment unlocks only on evidence ([Fortune](https://www.fortune.com/2023/05/15/venture-studio-atomic-raised-320-million-fund)).
- **Expected yield.** Plan for about 90% of ideas to die (PSL) and about half of started companies to die early (Atomic). A healthy factory dashboard shows mostly kills. A dashboard that shows mostly "promising" means the lines are too loose.
- **Kill hygiene.** Write a one-paragraph death note (what we believed, what we saw, what would revive it), archive the code, and keep the audience list. Dead ideas' audiences seed new tests.

---

## 8. What the factory should produce per idea

| Artifact | Contents | Why it matters for funding |
|---|---|---|
| Hypothesis card | XYZ, the zoomed xyz, assumptions, kill and success lines, look-by date, why-now | Shows discipline. Investors ask "why now?" |
| Testability verdict | Reachable sample, MDE, "testable / interviews only / not testable yet" | Honest about what the data can say |
| Evidence ledger | Each test: rung reached, n, result vs line, raw data link. Interviews coded by commitment level. | YODA. Commitments, not compliments. |
| Funnel | Visitor → signup → activation → retained W4/W8 → paid | The table seed investors want |
| Cohort retention chart | Weekly or monthly cohorts against category benchmarks | The main 2026 diligence item |
| Growth line | Week-over-week % on the one metric | PG's compass, 5–7% a week |
| PMF survey | Ellis score with n and segment | Supporting evidence |
| Revenue quality | Recurring vs one-off vs credits, pilot → paid, gross margin | AI-specific 2026 diligence (CRV) |
| Decision log | Persevere / pivot / kill with dates | Shows judgment. Produces the investor update for free. |

---

## 9. What to automate and what stays human

**Automate (agents or infrastructure):**
- Generating the landing page, fake door and v0
- Wiring telemetry (events, cohorts) on day 1
- Sample-size/MDE calculation and the testability verdict
- Small ad buys and UTM tagging
- Look-by reminders, with a dashboard that turns red at the date
- Transcribing interviews and tagging them by commitment rung and four forces. A human must have run the interview.
- Drafting the weekly investor or self update from the ledger
- Archiving code on kill

**Keep human (guide, never force):**
- Choosing the kill and success lines; the tool suggests defaults with their sources
- Running interviews
- The persevere / pivot / kill call; the tool shows the evidence against the line and recommends
- Overriding a kill. Allowed, but logged with a reason and a new look-by date.

**Say honestly when an idea can't be tested well:**
- Too little traffic for the effect size: switch to qualitative or concierge testing
- A new feature with no users yet: run an interview and fake-door combination, labelled "interest only"
- Enterprise with a long sales cycle: use LOIs and paid pilots as the rung, not sign-ups
- Timing-dependent ideas: the test measures today, not the market in 18 months

---

## 10. Open questions and unverified items

- Savoia's exact pretotype taxonomy, skin-in-the-game point values and his result-reading scale are **unverified** here. Check *The Right It* directly.
- No authoritative 2026 pre-seed numeric bar was found. The seed numbers are mostly from secondary Carta summaries and vendor blogs.
- The waitlist→paid 5–25% figure is anecdotal and secondhand.
- Studio success-rate claims (GSSN) are self-reported and contested.
- The interview kill thresholds in Stage 2 and the Ellis sample floor are the author's heuristics, not sourced benchmarks.
