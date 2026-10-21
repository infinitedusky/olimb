import type { Meta, StoryObj } from '@storybook/react-vite'
import { PlanGraphView } from './PlanGraphView'
import type { GraphTask } from '../engine'

// Sample tasks, made up: the hardening plan's shape, in the states worth seeing.
const t = (number: number, title: string, status: GraphTask['status'], extra: Partial<GraphTask> = {}): GraphTask => ({
  id: `task_sample${number}`, number, title, brief: null, status, attempt: status === 'queued' ? 0 : 1, maxAttempts: 3,
  branch: status === 'queued' ? null : `task/plan_sample/${number}`, heldReason: null, dependsOn: [], files: [], lastRun: null, ...extra,
})
const run = (status: string, cost: string) => ({ id: 'run_sample', attempt: 1, status, model: 'claude-opus-5-5', costUsd: cost, summary: null, error: null, startedAt: '', endedAt: null })

const midRun: GraphTask[] = [
  t(1, 'Validate numeric settings at startup', 'done', { lastRun: run('completed', '0.25') }),
  t(2, 'Cache pip in the CI workflow', 'running', { lastRun: run('working', '0.05') }),
  t(3, 'Index the tables the parent page reads', 'merging', { lastRun: run('completed', '0.22') }),
  t(4, 'README: settings are validated', 'queued', { dependsOn: ['task_sample1', 'task_sample2'], heldReason: 'waiting on task_sample2' }),
  t(5, 'Storybook stories for the parent page', 'queued', { heldReason: 'at the session cap' }),
]

const meta = { title: 'Components/PlanGraphView', component: PlanGraphView, parameters: { layout: 'padded' } } satisfies Meta<typeof PlanGraphView>
export default meta
type Story = StoryObj<typeof meta>

export const MidRun: Story = { args: { tasks: midRun } }
export const AllLanded: Story = { args: { tasks: midRun.map((x) => ({ ...x, status: 'done' as const, heldReason: null, lastRun: run('completed', '0.20') })) } }
export const WithAFailure: Story = { args: { tasks: [
  ...midRun.slice(0, 1), t(2, 'Cache pip in the CI workflow', 'failed', { attempt: 3, heldReason: 'landing failed at test: tests failed (exit 1)', lastRun: run('completed', '0.31') }),
  t(3, 'Index the tables the parent page reads', 'done', { lastRun: run('completed', '0.22') }),
  t(4, 'README: settings are validated', 'queued', { dependsOn: ['task_sample1', 'task_sample2'], heldReason: 'blocked: task_sample2 failed' }),
] } }
export const NotStarted: Story = { args: { tasks: midRun.map((x) => ({ ...x, status: 'queued' as const, attempt: 0, branch: null, heldReason: null, lastRun: null })) } }
export const SingleTask: Story = { args: { tasks: [t(1, 'Add a GET /health endpoint to the POC', 'done', { lastRun: run('completed', '0.40') })] } }
