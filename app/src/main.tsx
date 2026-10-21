import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes, useParams } from 'react-router'
import './tokens.css'
import './app.css'
import { findIdea, ideas } from './ideas'
import { modules } from './providers'
import { Shell } from './components/Shell'
import { Board } from './pages/Board'
import { IdeaPage } from './pages/IdeaPage'
import { Settings } from './pages/Settings'
import { Plans } from './pages/Plans'
import { PlanPage } from './pages/PlanPage'
import { NewPlan } from './pages/NewPlan'

function IdeaRoute() {
  const idea = findIdea(useParams().slug ?? '')
  return idea ? <IdeaPage idea={idea} /> : <p>No such idea.</p>
}

const apps = [...new Set(ideas.map((i) => i.app).filter(Boolean))]

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Shell apps={apps}>
        <Routes>
          <Route path="/" element={<Board ideas={ideas} />} />
          <Route path="/ideas/:slug" element={<IdeaRoute />} />
          <Route path="/plans" element={<Plans />} />
          <Route path="/plans/new" element={<NewPlan />} />
          <Route path="/plans/:id" element={<PlanPage />} />
          <Route path="/settings" element={<Settings modules={modules} />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  </StrictMode>,
)
