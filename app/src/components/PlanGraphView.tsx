/**
 * The graph: one node per phase, one edge per thing it waits on (an explicit dependency, or task order), laid out
 * left to right by dagre so prerequisites read left and dependents right. A file more than one open phase claims
 * is a node of its own between them (the action-graph shape: phases and files, like Bazel's actions and
 * artifacts): the phase that has it points at the file, the file points at the ones waiting; with nobody holding
 * it yet, the claimants hang off it undecided. Layout re-runs only when the topology changes; status, held
 * reasons, runs and steps are props on the nodes, so live updates never jump.
 */
import dagre from '@dagrejs/dagre'
import { Background, Handle, type Node, type NodeChange, type NodeProps, Panel, Position, ReactFlow, ReactFlowProvider, type Edge, MarkerType, useReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useMemo, useState } from 'react'
import type { GraphFile, GraphPhase, PhaseStatus } from '../engine'
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

type FileNodeData = { file: GraphFile; holder?: GraphPhase }

/** A shared file: its name, and who has it. Dashed while nobody does. */
function FileNode({ data }: NodeProps<Node<FileNodeData>>) {
  const { file, holder } = data
  return (
    <div className={`file-node ${holder ? 'held' : ''}`} title={file.path} data-component="FileNode">
      <Handle type="target" position={Position.Left} />
      <span className="mono">{file.path.split('/').pop()}</span>
      <span className="file-node-who faint">{holder ? `#${holder.number} has it` : `${file.phases.length} want it`}</span>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

const nodeTypes = { phase: PhaseNode, file: FileNode }
const W = 240, H = 132 // tall enough for a two-line title, a held reason and the run line
const FW = 170, FH = 40
const fileId = (f: GraphFile) => `file:${f.path}`

/** Everything a phase waits on: its explicit dependencies and task order. Both are edges, so it sits to their right. */
const waitsOn = (p: GraphPhase) => [...p.dependsOn, ...(p.orderedAfter ?? []).filter((d) => !p.dependsOn.includes(d))]

function layout(phases: GraphPhase[], files: GraphFile[]): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph()
  // A phase sits as far left as its prerequisites allow: column = longest chain of things it waits on. Dagre's
  // longest-path ranker counts from the sinks, so feed it the edges reversed and lay out right-to-left; the
  // positions come out with prerequisites left, dependents right, and anything free to start in the first column.
  g.setGraph({ rankdir: 'RL', ranker: 'longest-path', nodesep: 24, ranksep: 80, marginx: 16, marginy: 16 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const p of phases) g.setNode(p.id, { width: W, height: H })
  for (const p of phases) for (const d of waitsOn(p)) if (phases.some((x) => x.id === d)) g.setEdge(p.id, d)
  // A held file sits between its holder and the ones waiting; an unheld one sits after all its claimants.
  for (const f of files) {
    g.setNode(fileId(f), { width: FW, height: FH })
    for (const id of f.phases) if (phases.some((x) => x.id === id)) {
      if (!f.heldBy || id === f.heldBy) g.setEdge(fileId(f), id) // the file sits after its holder (or after every claimant, undecided)
      else g.setEdge(id, fileId(f)) // and before the ones waiting on it
    }
  }
  dagre.layout(g)
  const at = (id: string, w: number, h: number) => { const n = g.node(id); return { x: n.x - w / 2, y: n.y - h / 2 } }
  return new Map([...phases.map((p) => [p.id, at(p.id, W, H)] as const), ...files.map((f) => [fileId(f), at(fileId(f), FW, FH)] as const)])
}

type Pos = { x: number; y: number }
/** Where the viewer dragged nodes to, remembered in this browser only (a convenience, never state). */
const loadMoved = (key?: string): Record<string, Pos> => { try { return key ? JSON.parse(localStorage.getItem(`graph.moved.${key}`) ?? '{}') : {} } catch { return {} } }
const saveMoved = (key: string | undefined, moved: Record<string, Pos>) => { try { if (key) localStorage.setItem(`graph.moved.${key}`, JSON.stringify(moved)) } catch { /* private window: it just doesn't stick */ } }

export interface PlanGraphViewProps {
  phases: GraphPhase[]
  files?: GraphFile[] // shared files, drawn as nodes between the phases that claim them
  storageKey?: string // the plan or app: dragged positions are remembered per key, in this browser
  onSelect?: (p: GraphPhase) => void
  selectedId?: string
  labels?: Record<string, string> // e.g. the task (or plan · task) each phase belongs to
  tall?: boolean
}

export function PlanGraphView({ phases, files = [], onSelect, selectedId, labels, tall, storageKey }: PlanGraphViewProps) {
  const shared = files.filter((f) => f.phases.filter((id) => phases.some((x) => x.id === id)).length > 1)
  const topology = [...phases.map((p) => `${p.id}:${waitsOn(p).join(',')}`), ...shared.map((f) => `${f.path}:${f.heldBy ?? ''}:${f.phases.join(',')}`)].join('|')
  const positions = useMemo(() => layout(phases, shared), [topology]) // eslint-disable-line react-hooks/exhaustive-deps
  // Nodes can be dragged; a dragged node keeps its place through live updates and re-layouts until "Tidy up".
  const [moved, setMoved] = useState<Record<string, Pos>>(() => loadMoved(storageKey))
  const onNodesChange = (changes: NodeChange[]) => {
    const next = { ...moved }
    let changed = false
    for (const c of changes) if (c.type === 'position' && c.position) { next[c.id] = c.position; changed = true }
    if (changed) { setMoved(next); saveMoved(storageKey, next) }
  }
  const tidy = () => { setMoved({}); saveMoved(storageKey, {}) }
  const at = (id: string) => moved[id] ?? positions.get(id) ?? { x: 0, y: 0 }
  const nodes: Node<PhaseNodeData | FileNodeData>[] = [
    ...phases.map((p): Node<PhaseNodeData> => ({
      id: p.id, type: 'phase', position: at(p.id), data: { phase: p, label: labels?.[p.id] }, selected: p.id === selectedId,
    })),
    ...shared.map((f): Node<FileNodeData> => ({
      id: fileId(f), type: 'file', position: at(fileId(f)), data: { file: f, holder: phases.find((x) => x.id === f.heldBy) }, selectable: false,
    })),
  ]
  const edges: Edge[] = [
    ...phases.flatMap((p) => waitsOn(p).filter((d) => phases.some((x) => x.id === d)).map((d): Edge => ({
      id: `${d}->${p.id}`, source: d, target: p.id, animated: LIVE.includes(p.status),
      markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: 'var(--ink-faint)' },
    }))),
    // The holder points at the file; the file points at everyone waiting on it. Nobody holding it: claimants hang off it, undecided.
    ...shared.flatMap((f) => f.phases.filter((id) => phases.some((x) => x.id === id)).map((id): Edge => id === f.heldBy
      ? { id: `${id}->${fileId(f)}`, source: id, target: fileId(f), animated: true, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: 'var(--accent)' } }
      : f.heldBy
        ? { id: `${fileId(f)}->${id}`, source: fileId(f), target: id, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: 'var(--accent)', strokeDasharray: '4 3' } }
        : { id: `${id}->${fileId(f)}`, source: id, target: fileId(f), style: { stroke: 'var(--ink-faint)', strokeDasharray: '4 3' } })),
  ]
  return (
    <div className={`graph-canvas ${tall ? 'tall' : ''}`} data-component="PlanGraphView">
      <ReactFlowProvider>
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.2, maxZoom: 1 }} onNodesChange={onNodesChange}
          onNodeClick={(_, n) => { if (n.type === 'phase') onSelect?.((n.data as PhaseNodeData).phase) }} nodesConnectable={false} proOptions={{ hideAttribution: true }}>
          <Background gap={20} color="var(--line)" />
          {Object.keys(moved).length > 0 && <Panel position="top-right"><button type="button" className="graph-tidy" onClick={tidy}>Tidy up</button></Panel>}
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
