import type { Idea } from '../ideas'
import { LANES } from '../ideas'
import { LaneColumn } from '../components/LaneColumn'

export function Board({ ideas }: { ideas: Idea[] }) {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ideas</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>Every idea carries its evidence. Telemetry decides; agents build.</p>
        </div>
        <span className="mono faint">{ideas.length} ideas</span>
      </div>
      <div className="lanes">
        {LANES.map((l) => <LaneColumn key={l.id} label={l.label} hint={l.hint} ideas={ideas.filter((i) => i.lane === l.id)} />)}
      </div>
    </>
  )
}
