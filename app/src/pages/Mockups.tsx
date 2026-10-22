/** Mockup: decide on something real before anything is planned. The page exists before its content so the loop is whole in the nav. */
import { useCurrentApp } from '../current-app'

export function Mockups() {
  const { app } = useCurrentApp()
  return (
    <>
      <div className="page-head"><div>
        <h1>✏️ Mockup{app ? <span className="muted" style={{ fontWeight: 400 }}> · {app.name}</span> : null}</h1>
        <p className="muted" style={{ margin: '4px 0 0' }}>Decide fast, on something real: stories, prototypes, variants side by side. What you agree to here becomes the checks the build is held to.</p>
      </div></div>
      <section className="panel">
        <h2>Today</h2>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>Homework Gate's Storybook, every page in every state from the real templates: <a href="http://localhost:6006" target="_blank" rel="noreferrer">localhost:6006</a>.</li>
          <li>The spaced-repetition proof of concept, eight screens with the two open questions as variants: <a href="http://localhost:6008" target="_blank" rel="noreferrer">localhost:6008</a> (homework-gate PR #18).</li>
        </ul>
      </section>
      <section className="panel">
        <h2>Lands here</h2>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li><strong>A preview per branch</strong>: the app and its Storybook run from a plan's worktree, linked from the plan.</li>
          <li><strong>Variants as a first-class thing</strong>: a question is two stories side by side; the pick becomes the decision.</li>
          <li><strong>The POC phase</strong>: the planner's first phase for anything with a surface, landing as stories, verified by "every story renders".</li>
        </ul>
      </section>
    </>
  )
}
