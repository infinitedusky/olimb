import type { Idea } from '../ideas'
import { IdeaCard } from './IdeaCard'

export function LaneColumn({ label, hint, ideas }: { label: string; hint: string; ideas: Idea[] }) {
  return (
    <section className="lane" data-component="LaneColumn">
      <div className="lane-head"><h2>{label}</h2><span className="mono faint">{ideas.length}</span></div>
      <p className="muted" style={{ margin: '0 4px 10px', fontSize: 13 }}>{hint}</p>
      <div className="lane-list">
        {ideas.length ? ideas.map((i) => <IdeaCard key={i.slug} idea={i} />) : <div className="empty">Nothing here.</div>}
      </div>
    </section>
  )
}
