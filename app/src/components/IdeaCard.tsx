import { Link } from 'react-router'
import type { Idea } from '../ideas'
import { Badge } from './Badge'

/** One idea on the board: what we believe, and how much support it has so far. */
export function IdeaCard({ idea }: { idea: Idea }) {
  const evidence = idea.evidence.length
  return (
    <Link to={`/ideas/${idea.slug}`} className="card" data-component="IdeaCard">
      <h3>{idea.title}</h3>
      {idea.hypothesis && <p>{idea.hypothesis}</p>}
      <div className="row">
        {idea.app && <Badge>{idea.app}</Badge>}
        <Badge tone={evidence ? 'ok' : 'neutral'} dot>{evidence ? `${evidence} evidence` : 'no evidence yet'}</Badge>
        {idea.prs.length > 0 && <Badge tone="accent">{idea.prs.length} PR{idea.prs.length > 1 ? 's' : ''}</Badge>}
        {idea.lookBy && <Badge>look by {idea.lookBy}</Badge>}
      </div>
    </Link>
  )
}
