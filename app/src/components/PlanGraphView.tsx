/**
 * The graph: one node per task, one edge per dependency, laid out left to right by dagre. Layout re-runs only when
 * the topology changes; status, held reasons and runs are props on the nodes, so live updates never jump.
 */
import dagre from '@dagrejs/dagre'
import { Background, Handle, type Node, type NodeProps, Position, ReactFlow, type Edge, MarkerType } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useMemo } from 'react'
import type { GraphTask, TaskStatus } from '../engine'
import { Badge, type Tone } from './Badge'

export const STATUS_TONE: Record<TaskStatus, Tone> = {
  queued: 'neutral', ready: 'accent', running: 'accent', awaiting_answer: 'warn', merging: 'accent', testing: 'accent',
  done: 'ok', failed: 'bad', cancelled: 'neutral',
}
const LIVE: TaskStatus[] = ['running', 'merging', 'testing', 'awaiting_answer']

type TaskNodeData = { task: GraphTask; selected?: boolean }

function TaskNode({ data }: NodeProps<Node<TaskNodeData>>) {
  const { task } = data
  const live = LIVE.includes(task.status)
  return (
    <div className={`task-node ${live ? 'live' : ''} ${task.status}`} data-component="TaskNode">
      <Handle type="target" position={Position.Left} />
      <div className="task-node-head">
        <span className="mono faint">#{task.number}</span>
        <Badge tone={STATUS_TONE[task.status]} dot={live}>{task.status.replace('_', ' ')}</Badge>
      </div>
      <div className="task-node-title">{task.title}</div>
      {task.heldReason && task.status !== 'done' && <div className="task-node-note">{task.heldReason}</div>}
      {task.lastRun && (
        <div className="task-node-run mono">
          attempt {task.lastRun.attempt}{task.lastRun.model ? ` · ${task.lastRun.model.replace('claude-', '')}` : ''}
          {task.lastRun.costUsd ? ` · $${Number(task.lastRun.costUsd).toFixed(2)}` : ''}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

const nodeTypes = { task: TaskNode }
const W = 240, H = 104

function layout(tasks: GraphTask[]): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 24, ranksep: 64, marginx: 16, marginy: 16 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const t of tasks) g.setNode(t.id, { width: W, height: H })
  for (const t of tasks) for (const d of t.dependsOn) if (tasks.some((x) => x.id === d)) g.setEdge(d, t.id)
  dagre.layout(g)
  return new Map(tasks.map((t) => { const n = g.node(t.id); return [t.id, { x: n.x - W / 2, y: n.y - H / 2 }] }))
}

export function PlanGraphView({ tasks, onSelect, selectedId }: { tasks: GraphTask[]; onSelect?: (t: GraphTask) => void; selectedId?: string }) {
  const topology = tasks.map((t) => `${t.id}:${t.dependsOn.join(',')}`).join('|')
  const positions = useMemo(() => layout(tasks), [topology]) // eslint-disable-line react-hooks/exhaustive-deps
  const nodes: Node<TaskNodeData>[] = tasks.map((t) => ({
    id: t.id, type: 'task', position: positions.get(t.id) ?? { x: 0, y: 0 }, data: { task: t }, selected: t.id === selectedId, draggable: false,
  }))
  const edges: Edge[] = tasks.flatMap((t) => t.dependsOn.map((d) => ({
    id: `${d}->${t.id}`, source: d, target: t.id, animated: LIVE.includes(t.status),
    markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: 'var(--ink-faint)' },
  })))
  return (
    <div className="graph-canvas" data-component="PlanGraphView">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        onNodeClick={(_, n) => onSelect?.((n.data as TaskNodeData).task)} nodesConnectable={false} proOptions={{ hideAttribution: true }}>
        <Background gap={20} color="var(--line)" />
      </ReactFlow>
    </div>
  )
}
