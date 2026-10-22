/**
 * The graph: one node per phase, one edge per thing it waits on (an explicit dependency, or task order), laid out
 * left to right by dagre so prerequisites read left and dependents right. Every contested file gets a dashed area
 * around the phases that claim it, named after the file: they never run at once. Layout re-runs only when the
 * topology changes; status, held reasons, runs and steps are props on the nodes, so live updates never jump.
 */
import dagre from '@dagrejs/dagre'
import { Background, Handle, type Node, type NodeProps, Position, ReactFlow, ReactFlowProvider, type Edge, MarkerType, useReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useMemo } from 'react'
import type { GraphPhase, PhaseStatus } from '../engine'
import { Badge, type Tone } from './Badge'

export const STATUS_TONE: Record<PhaseStatus, Tone> = {
  queued: 'neutral', ready: 'accent', running: 'accent', awaiting_answer: 'warn', merging: 'accent', testing: 'accent',
  done: 'ok', failed: 'bad', cancelled: 'neutral',
}
const LIVE: PhaseStatus[] = ['running', 'merging', 'testing', 'awaiting_answer']

type PhaseNodeData = { phase: GraphPhase; label?: string }
type AreaNodeData = { label: string; labelRow: number } // labelRow: pushed down when another area's label sits on the same edge

function PhaseNode({ data }: NodeProps<Node<PhaseNodeData>>) {
  const { phase } = data
  const live = LIVE.includes(phase.status)
  const steps = phase.steps ?? []
  const doneSteps = steps.filter((s) => s.status === 'completed').length
  const current = steps.find((s) => s.status === 'in_progress')
  return (
    <div className={`task-node ${live ? 'live' : ''} ${phase.status}`} data-component="PhaseNode">
      <Handle type="target" position={Position.Left} />
      <div className="task-node-head">
        <span className="mono faint">#{phase.number}{data.label ? <span className="task-node-plan"> · {data.label}</span> : null}</span>
        <Badge tone={STATUS_TONE[phase.status]} dot={live}>{phase.status.replace('_', ' ')}</Badge>
      </div>
      <div className="task-node-title">{phase.title}</div>
      {phase.heldReason && phase.status !== 'done' && <div className="task-node-note">{phase.heldReason}</div>}
      {live && current && <div className="task-node-note">→ {current.text}</div>}
      {(phase.lastRun || steps.length > 0) && (
        <div className="task-node-run mono">
          {phase.lastRun ? `attempt ${phase.lastRun.attempt}${phase.lastRun.model ? ` · ${phase.lastRun.model.replace('claude-', '')}` : ''}${phase.lastRun.costUsd ? ` · $${Number(phase.lastRun.costUsd).toFixed(2)}` : ''}` : ''}
          {steps.length > 0 ? `${phase.lastRun ? ' · ' : ''}steps ${doneSteps}/${steps.length}` : ''}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

/** The dashed area around the phases that claim one file, named after it at the top. Behind the phases; not clickable. */
function AreaNode({ data }: NodeProps<Node<AreaNodeData>>) {
  return (
    <div className="file-group" data-component="FileArea">
      <span className="file-group-label mono" style={{ top: -9 + data.labelRow * 16 }}>{data.label}</span>
    </div>
  )
}

const nodeTypes = { phase: PhaseNode, area: AreaNode }
const W = 240, H = 132 // tall enough for a two-line title, a held reason and the run line
const PAD = 14 // an area's margin around its phases; nested areas step out by another PAD each

/** Everything a phase waits on: its explicit dependencies and task order. Both are edges, so it sits to their right. */
const waitsOn = (p: GraphPhase) => [...p.dependsOn, ...(p.orderedAfter ?? []).filter((d) => !p.dependsOn.includes(d))]

interface Area { id: string; members: string[]; label: string }

const overlap = (a: string, b: string) => a === b || a.startsWith(b.replace(/\/$/, '') + '/') || b.startsWith(a.replace(/\/$/, '') + '/')

/** One area per contested path (the most specific side of each overlap); paths contested by exactly the same phases share an area. */
function fileAreas(phases: GraphPhase[], conflicts: [string, string][]): Area[] {
  const byId = new Map(phases.map((p) => [p.id, p]))
  const byPath = new Map<string, Set<string>>()
  for (const [a, b] of conflicts) {
    for (const f of byId.get(a)?.files ?? []) for (const g of byId.get(b)?.files ?? []) {
      if (!overlap(f, g)) continue
      const path = f.length >= g.length ? f : g
      const s = byPath.get(path) ?? new Set<string>()
      s.add(a); s.add(b); byPath.set(path, s)
    }
  }
  const byMembers = new Map<string, { members: string[]; paths: string[] }>()
  for (const [path, set] of byPath) {
    const members = [...set].sort(), key = members.join('~')
    const e = byMembers.get(key) ?? { members, paths: [] }
    e.paths.push(path); byMembers.set(key, e)
  }
  return [...byMembers.values()].map((e) => ({ id: `area:${e.members.join('~')}`, members: e.members, label: e.paths.sort().join(', ') }))
    .sort((a, b) => b.members.length - a.members.length || a.id.localeCompare(b.id)) // bigger first: drawn underneath
}

/** Phases linked by any shared file, so the layout keeps each set adjacent and the areas stay tight. */
function clusters(conflicts: [string, string][]): string[][] {
  const parent = new Map<string, string>()
  const find = (x: string): string => { const p = parent.get(x) ?? x; if (p === x) return x; const r = find(p); parent.set(x, r); return r }
  for (const [a, b] of conflicts) parent.set(find(a), find(b))
  const out = new Map<string, string[]>()
  for (const [a, b] of conflicts) for (const x of [a, b]) { const r = find(x); const m = out.get(r) ?? []; if (!m.includes(x)) m.push(x); out.set(r, m) }
  return [...out.values()]
}

function layout(phases: GraphPhase[], groups: string[][]): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph({ compound: true })
  // A phase sits as far left as its prerequisites allow: column = longest chain of things it waits on. Dagre's
  // longest-path ranker counts from the sinks, so feed it the edges reversed and lay out right-to-left; the
  // positions come out with prerequisites left, dependents right, and anything free to start in the first column.
  g.setGraph({ rankdir: 'RL', ranker: 'longest-path', nodesep: 24, ranksep: 80, marginx: 16 + 2 * PAD, marginy: 16 + 2 * PAD })
  g.setDefaultEdgeLabel(() => ({}))
  groups.forEach((_, n) => g.setNode(`cluster${n}`, {}))
  for (const p of phases) g.setNode(p.id, { width: W + 2 * PAD, height: H + 2 * PAD }) // room for the first area around it
  groups.forEach((members, n) => { for (const m of members) if (phases.some((x) => x.id === m)) g.setParent(m, `cluster${n}`) })
  for (const p of phases) for (const d of waitsOn(p)) if (phases.some((x) => x.id === d)) g.setEdge(p.id, d)
  dagre.layout(g)
  return new Map(phases.map((p) => { const n = g.node(p.id); return [p.id, { x: n.x - W / 2, y: n.y - H / 2 }] }))
}

/** An area's box: the bounding box of its phases, stepped out by PAD for each smaller area it contains. */
function areaBox(a: Area, areas: Area[], positions: Map<string, { x: number; y: number }>) {
  const inside = areas.filter((o) => o !== a && o.members.length < a.members.length && o.members.every((m) => a.members.includes(m))).length
  const pad = PAD * (1 + inside)
  const pts = a.members.map((m) => positions.get(m)).filter((p): p is { x: number; y: number } => !!p)
  const minX = Math.min(...pts.map((p) => p.x)), minY = Math.min(...pts.map((p) => p.y))
  const maxX = Math.max(...pts.map((p) => p.x + W)), maxY = Math.max(...pts.map((p) => p.y + H))
  return { x: minX - pad, y: minY - pad, width: maxX - minX + 2 * pad, height: maxY - minY + 2 * pad }
}

export interface PlanGraphViewProps {
  phases: GraphPhase[]
  onSelect?: (p: GraphPhase) => void
  selectedId?: string
  labels?: Record<string, string> // e.g. the task (or plan · task) each phase belongs to
  conflicts?: [string, string][] // pairs that claim the same path: drawn as one dashed area per contested file
  tall?: boolean
}

export function PlanGraphView({ phases, onSelect, selectedId, labels, conflicts = [], tall }: PlanGraphViewProps) {
  const areas = useMemo(() => fileAreas(phases, conflicts), [phases, conflicts])
  const topology = phases.map((p) => `${p.id}:${waitsOn(p).join(',')}`).join('|') + '#' + conflicts.map((c) => c.join('~')).join('|')
  const positions = useMemo(() => layout(phases, clusters(conflicts)), [topology]) // eslint-disable-line react-hooks/exhaustive-deps
  const boxes = areas.map((a) => areaBox(a, areas, positions))
  const nodes: Node[] = [
    ...areas.map((a, n): Node<AreaNodeData> => {
      const box = boxes[n]
      // Two areas starting at about the same corner would print their names on top of each other: stack them.
      const labelRow = boxes.slice(0, n).filter((o) => Math.abs(o.y - box.y) <= 2 * PAD && Math.abs(o.x - box.x) < 320).length
      return { id: a.id, type: 'area', position: { x: box.x, y: box.y }, data: { label: a.label, labelRow }, style: { width: box.width, height: box.height }, selectable: false, draggable: false, focusable: false, zIndex: -1000 + n }
    }),
    ...phases.map((p): Node<PhaseNodeData> => ({
      id: p.id, type: 'phase', position: positions.get(p.id) ?? { x: 0, y: 0 }, data: { phase: p, label: labels?.[p.id] }, selected: p.id === selectedId, draggable: false,
    })),
  ]
  const edges: Edge[] = phases.flatMap((p) => waitsOn(p).filter((d) => phases.some((x) => x.id === d)).map((d) => ({
    id: `${d}->${p.id}`, source: d, target: p.id, animated: LIVE.includes(p.status),
    markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: 'var(--ink-faint)' },
  })))
  return (
    <div className={`graph-canvas ${tall ? 'tall' : ''}`} data-component="PlanGraphView">
      <ReactFlowProvider>
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
          onNodeClick={(_, n) => { if (n.type === 'phase') onSelect?.((n.data as PhaseNodeData).phase) }} nodesConnectable={false} proOptions={{ hideAttribution: true }}>
          <Background gap={20} color="var(--line)" />
          <FitOnChange topology={topology} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  )
}

/** Re-fit the view when the set of nodes or edges changes (and once after the first measurement). */
function FitOnChange({ topology }: { topology: string }) {
  const { fitView } = useReactFlow()
  useEffect(() => {
    const id = window.setTimeout(() => void fitView({ padding: 0.2, maxZoom: 1, duration: 200 }), 50)
    return () => window.clearTimeout(id)
  }, [topology, fitView])
  return null
}
