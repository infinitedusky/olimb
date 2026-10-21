/**
 * The graph: one node per phase, one edge per dependency, laid out left to right by dagre. Layout re-runs only when
 * the topology changes; status, held reasons, runs and steps are props on the nodes, so live updates never jump.
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

const nodeTypes = { phase: PhaseNode }
const W = 240, H = 132 // tall enough for a two-line title, a held reason and the run line

function layout(phases: GraphPhase[]): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 20, ranksep: 72, marginx: 16, marginy: 16 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const p of phases) g.setNode(p.id, { width: W, height: H })
  for (const p of phases) for (const d of p.dependsOn) if (phases.some((x) => x.id === d)) g.setEdge(d, p.id)
  dagre.layout(g)
  return new Map(phases.map((p) => { const n = g.node(p.id); return [p.id, { x: n.x - W / 2, y: n.y - H / 2 }] }))
}

export interface PlanGraphViewProps {
  phases: GraphPhase[]
  onSelect?: (p: GraphPhase) => void
  selectedId?: string
  labels?: Record<string, string> // e.g. the task (or plan · task) each phase belongs to
  links?: [string, string][] // pairs that share a file: dashed, no arrow
  tall?: boolean
}

export function PlanGraphView({ phases, onSelect, selectedId, labels, links = [], tall }: PlanGraphViewProps) {
  const topology = phases.map((p) => `${p.id}:${p.dependsOn.join(',')}`).join('|') + '#' + links.map((l) => l.join('~')).join('|')
  const positions = useMemo(() => layout(phases), [topology]) // eslint-disable-line react-hooks/exhaustive-deps
  const nodes: Node<PhaseNodeData>[] = phases.map((p) => ({
    id: p.id, type: 'phase', position: positions.get(p.id) ?? { x: 0, y: 0 }, data: { phase: p, label: labels?.[p.id] }, selected: p.id === selectedId, draggable: false,
  }))
  const edges: Edge[] = [
    ...phases.flatMap((p) => p.dependsOn.filter((d) => phases.some((x) => x.id === d)).map((d) => ({
      id: `${d}->${p.id}`, source: d, target: p.id, animated: LIVE.includes(p.status),
      markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: 'var(--ink-faint)' },
    }))),
    ...links.map(([a, b]) => ({ id: `${a}~${b}`, source: a, target: b, type: 'straight', style: { stroke: 'var(--warn)', strokeDasharray: '4 4' } })),
  ]
  return (
    <div className={`graph-canvas ${tall ? 'tall' : ''}`} data-component="PlanGraphView">
      <ReactFlowProvider>
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
          onNodeClick={(_, n) => onSelect?.((n.data as PhaseNodeData).phase)} nodesConnectable={false} proOptions={{ hideAttribution: true }}>
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
