import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router'
import './tokens.css'
import './app.css'
import { findIdea, ideas } from './ideas'
import { modules } from './providers'
import { CurrentAppProvider } from './current-app'
import { Shell } from './components/Shell'
import { AgentWindow } from './components/TalkDrawer'
import { Board } from './pages/Board'
import { IdeaPage } from './pages/IdeaPage'
import { Settings } from './pages/Settings'
import { Plans } from './pages/Plans'
import { PlanPage } from './pages/PlanPage'
import { NewPlan } from './pages/NewPlan'
import { AppGraph } from './pages/AppGraph'
import { Now } from './pages/Now'
import { Learn } from './pages/Learn'
import { Validate } from './pages/Validate'
import { Mockups } from './pages/Mockups'
import { Tasks } from './pages/Tasks'

function IdeaRoute() {
  const idea = findIdea(useParams().slug ?? '')
  return idea ? <IdeaPage idea={idea} /> : <p>No such idea.</p>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <CurrentAppProvider>
        <Routes>
          <Route path="/agent" element={<AgentWindow />} />
          <Route path="*" element={<Shell>
          <Routes>
            <Route path="/" element={<Now />} />
            <Route path="/learn" element={<Learn />} />
            <Route path="/plans" element={<Plans mode="plan" />} />
            <Route path="/plan" element={<Navigate to="/plans" replace />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/validate" element={<Validate />} />
            <Route path="/mockups" element={<Mockups />} />
            <Route path="/build" element={<Plans mode="build" />} />
            <Route path="/ideas" element={<Board ideas={ideas} />} />
            <Route path="/ideas/:slug" element={<IdeaRoute />} />
            <Route path="/graph" element={<AppGraph />} />
            <Route path="/plans/new" element={<NewPlan />} />
            <Route path="/plans/:id" element={<PlanPage />} />
            <Route path="/settings" element={<Settings modules={modules} />} />
          </Routes>
          </Shell>} />
        </Routes>
      </CurrentAppProvider>
    </BrowserRouter>
  </StrictMode>,
)
