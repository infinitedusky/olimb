/**
 * The engine's schema. Git holds code; this holds all state; the engine is the single writer.
 * From research/parallel-engine.md §5: [LS] Lightsprint-derived, [ID] InDusk run-the-graph, [IF] ours.
 * IDs are prefixed short strings (ids.ts). State tables are the truth; `event` is the append-only log and live feed.
 */
import { sql } from 'drizzle-orm'
import {
  bigserial, boolean, check, date, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

const id = () => text('id').primaryKey()
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
// Literal values, not parameters: this text ends up in DDL.
const inList = (name: string, col: any, values: readonly string[]) =>
  check(name, sql`${col} in (${sql.raw(values.map((v) => `'${v}'`).join(', '))})`)

export const IDEA_LANES = ['inbox', 'measuring', 'build', 'testing', 'shipped', 'parked', 'killed'] as const
export const TASK_STATUSES = ['queued', 'ready', 'running', 'awaiting_answer', 'merging', 'testing', 'done', 'failed', 'cancelled'] as const
export const RUN_STATUSES = ['starting', 'working', 'ready', 'completed', 'failed', 'stopped', 'interrupted'] as const
export const RUN_KINDS = ['build', 'follow_up', 'verify', 'merge', 'setup', 'measure'] as const
export const PR_STATUSES = ['draft', 'open', 'queued', 'merged', 'closed'] as const
export const PROVIDER_ROLES = ['telemetry', 'code_host', 'design_system', 'model', 'sandbox', 'traces'] as const

export type IdeaLane = (typeof IDEA_LANES)[number]
export type TaskStatus = (typeof TASK_STATUSES)[number]
export type RunStatus = (typeof RUN_STATUSES)[number]

// Tenancy from day one: everything belongs to a workspace.
export const workspace = pgTable('workspace', {
  id: id(), name: text('name').notNull(), createdAt: createdAt(),
})

export const user = pgTable('user', { // [LS]
  id: id(), workspaceId: text('workspace_id').notNull().references(() => workspace.id),
  name: text('name'), email: text('email'), githubLogin: text('github_login'),
  role: text('role').notNull().default('owner'), createdAt: createdAt(),
}, (t) => [inList('user_role', t.role, ['owner', 'member', 'member_no_merge'])])

export const app = pgTable('app', { // [LS] "stack"
  id: id(), workspaceId: text('workspace_id').notNull().references(() => workspace.id),
  name: text('name').notNull(), defaultBranch: text('default_branch').notNull().default('main'),
  setup: jsonb('setup').notNull().default({}), // setup_cmd, test_cmd, services[], env_ref, sandbox_size
  createdAt: createdAt(),
})

export const repo = pgTable('repo', { // [LS] member repos
  id: id(), appId: text('app_id').notNull().references(() => app.id), fullName: text('full_name').notNull(),
  localPath: text('local_path'), writable: boolean('writable').notNull().default(true), baseBranch: text('base_branch'),
})

export const providerConnection = pgTable('provider_connection', { // [IF] modules and providers
  id: id(), appId: text('app_id').notNull().references(() => app.id),
  role: text('role').notNull(), provider: text('provider').notNull(),
  config: jsonb('config').notNull().default({}), secretRef: text('secret_ref'),
  status: text('status'), checkedAt: timestamp('checked_at', { withTimezone: true }),
}, (t) => [uniqueIndex('provider_connection_role_provider').on(t.appId, t.role, t.provider),
  inList('provider_role', t.role, PROVIDER_ROLES)])

export const idea = pgTable('idea', { // [IF] the unit of work that outlives the merge
  id: id(), appId: text('app_id').notNull().references(() => app.id), number: integer('number').notNull(),
  title: text('title').notNull(), body: text('body'),
  source: text('source').notNull(), sourceRef: jsonb('source_ref'),
  lane: text('lane').notNull().default('inbox'),
  hypothesis: text('hypothesis'), baseline: jsonb('baseline'), // {metric, value, window, captured_at, insight_id}
  measures: jsonb('measures').notNull().default([]), // [{kind: insight|flag|experiment, provider_ref, target}]
  testability: jsonb('testability'), lookBy: date('look_by'),
  decision: text('decision'), decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdBy: text('created_by').references(() => user.id), createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
}, (t) => [uniqueIndex('idea_app_number').on(t.appId, t.number),
  inList('idea_source', t.source, ['person', 'agent', 'telemetry']), inList('idea_lane', t.lane, IDEA_LANES),
  check('idea_decision', sql`${t.decision} is null or ${t.decision} in ('yes', 'no', 'not_yet')`)])

export const evidence = pgTable('evidence', { // [IF] append-only telemetry results
  id: bigserial('id', { mode: 'number' }).primaryKey(), ideaId: text('idea_id').references(() => idea.id), prId: text('pr_id'),
  kind: text('kind').notNull(), metric: text('metric'), value: numeric('value'), baselineValue: numeric('baseline_value'),
  windowStart: timestamp('window_start', { withTimezone: true }), windowEnd: timestamp('window_end', { withTimezone: true }),
  provider: text('provider'), summary: text('summary'), raw: jsonb('raw'),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [inList('evidence_kind', t.kind, ['baseline', 'finding', 'verdict', 'guard', 'post_ship'])])

export const plan = pgTable('plan', { // [LS] a plan under an idea; made of tasks
  id: id(), appId: text('app_id').notNull().references(() => app.id), ideaId: text('idea_id').references(() => idea.id),
  title: text('title').notNull(), status: text('status').notNull().default('drafting'),
  integrationBranch: text('integration_branch'), // [ID] the plan's branch; tasks land here, only it reaches trunk
  spec: text('spec'), createdAt: createdAt(),
}, (t) => [inList('plan_status', t.status, ['drafting', 'proposed', 'approved', 'running', 'landed', 'superseded'])])

export const decision = pgTable('decision', { // [LS] decision card; [IF] provisional flag
  id: id(), ideaId: text('idea_id').references(() => idea.id), planId: text('plan_id').references(() => plan.id),
  question: text('question').notNull(), options: jsonb('options').notNull(), // [{key:'A', text, tradeoff, recommended, story}]
  chosen: text('chosen'), provisional: boolean('provisional').notNull().default(false),
  decidedBy: text('decided_by').references(() => user.id), decidedAt: timestamp('decided_at', { withTimezone: true }),
  rationale: text('rationale'),
})

export const task = pgTable('task', { // [LS] fields; [ID] graph semantics
  id: id(), appId: text('app_id').notNull().references(() => app.id), planId: text('plan_id').references(() => plan.id),
  ideaId: text('idea_id').references(() => idea.id), number: integer('number').notNull(),
  title: text('title').notNull(), brief: text('brief'),
  status: text('status').notNull().default('queued'),
  attempt: integer('attempt').notNull().default(0), maxAttempts: integer('max_attempts').notNull().default(3), // [ID]
  branch: text('branch'), worktreePath: text('worktree_path'), baseSha: text('base_sha'), // [ID]
  size: text('size'), priority: integer('priority').notNull().default(0), position: integer('position').notNull().default(0),
  requiresSchemaChange: boolean('requires_schema_change').notNull().default(false), autoMerge: boolean('auto_merge'), // [LS]
  heldReason: text('held_reason'), // [ID] why the scheduler is holding it, for the graph view
  assignee: text('assignee').references(() => user.id), createdBy: text('created_by'), prId: text('pr_id'),
  createdAt: createdAt(), updatedAt: timestamp('updated_at', { withTimezone: true }),
}, (t) => [uniqueIndex('task_app_number').on(t.appId, t.number), index('task_plan').on(t.planId),
  inList('task_status', t.status, TASK_STATUSES),
  check('task_size', sql`${t.size} is null or ${t.size} in ('S', 'M', 'L', 'XL')`)])

export const taskDependency = pgTable('task_dependency', { // [ID]/[LS] the edges
  taskId: text('task_id').notNull().references(() => task.id),
  dependsOnTaskId: text('depends_on_task_id').notNull().references(() => task.id),
}, (t) => [primaryKey({ columns: [t.taskId, t.dependsOnTaskId] })])

export const taskFileClaim = pgTable('task_file_claim', { // [ID] two tasks sharing a file never run together
  taskId: text('task_id').notNull().references(() => task.id), path: text('path').notNull(),
}, (t) => [primaryKey({ columns: [t.taskId, t.path] })])

export const session = pgTable('session', { // [LS] one shared conversation per task
  id: id(), taskId: text('task_id').notNull().references(() => task.id),
  status: text('status').notNull().default('open'), createdBy: text('created_by'), createdAt: createdAt(),
}, (t) => [inList('session_status', t.status, ['open', 'ended'])])

export const sessionMessage = pgTable('session_message', { // [LS] shared queue; "send now" = interrupt
  id: bigserial('id', { mode: 'number' }).primaryKey(), sessionId: text('session_id').notNull().references(() => session.id),
  author: text('author').notNull(), body: text('body').notNull(), attachments: jsonb('attachments'),
  status: text('status').notNull().default('queued'),
  queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(), sentAt: timestamp('sent_at', { withTimezone: true }),
}, (t) => [inList('session_message_status', t.status, ['queued', 'sent', 'interrupted', 'dropped'])])

export const run = pgTable('run', { // [LS] agent run; [ID] attempt
  id: id(), taskId: text('task_id').notNull().references(() => task.id), sessionId: text('session_id').references(() => session.id),
  attempt: integer('attempt').notNull(), kind: text('kind').notNull(),
  agent: text('agent').notNull(), model: text('model'), status: text('status').notNull().default('starting'),
  agentSessionId: text('agent_session_id'), pid: integer('pid'), // for --resume and liveness
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(), endedAt: timestamp('ended_at', { withTimezone: true }),
  costUsd: numeric('cost_usd'), budgetCapUsd: numeric('budget_cap_usd'), tokens: jsonb('tokens'), summary: text('summary'), error: text('error'),
}, (t) => [index('run_task').on(t.taskId), inList('run_kind', t.kind, RUN_KINDS), inList('run_status', t.status, RUN_STATUSES)])

export const question = pgTable('question', { // [ID] questions with a cost
  id: id(), ideaId: text('idea_id'), taskId: text('task_id'), runId: text('run_id'),
  text: text('text').notNull(), options: jsonb('options'), cost: text('cost'),
  status: text('status').notNull().default('open'), answer: text('answer'), answeredBy: text('answered_by'),
  answeredAt: timestamp('answered_at', { withTimezone: true }), askedAt: timestamp('asked_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [inList('question_status', t.status, ['open', 'answered', 'skipped', 'expired'])])

export const event = pgTable('event', { // [IF] append-only live stream; the graph view's feed
  seq: bigserial('seq', { mode: 'number' }).primaryKey(), ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
  workspaceId: text('workspace_id').notNull(), appId: text('app_id'), ideaId: text('idea_id'), planId: text('plan_id'),
  taskId: text('task_id'), runId: text('run_id'), sessionId: text('session_id'),
  actor: text('actor').notNull(), // engine | agent:<run_id> | user:<id> | github | posthog
  type: text('type').notNull(), // task.status, run.tool_call, run.message, pr.check, verification.captured, question.asked, evidence.captured
  payload: jsonb('payload').notNull().default({}),
}, (t) => [index('event_workspace_seq').on(t.workspaceId, t.seq), index('event_task_seq').on(t.taskId, t.seq),
  index('event_plan_seq').on(t.planId, t.seq)])

export const pr = pgTable('pr', { // [LS] githubPullRequests + review hub; [IF] pitch
  id: id(), taskId: text('task_id').notNull().references(() => task.id), repoId: text('repo_id').references(() => repo.id),
  number: integer('number'), url: text('url'), headBranch: text('head_branch'), baseBranch: text('base_branch'),
  headSha: text('head_sha'), mergeSha: text('merge_sha'), status: text('status').notNull(),
  additions: integer('additions'), deletions: integer('deletions'), changedFiles: integer('changed_files'),
  readiness: jsonb('readiness'), signals: jsonb('signals'),
  pitch: jsonb('pitch'), // [IF] {off_switch_flag, guard_metric, schema_impact, revertable_alone, fake_data}
  openedAt: timestamp('opened_at', { withTimezone: true }), mergedAt: timestamp('merged_at', { withTimezone: true }),
}, (t) => [uniqueIndex('pr_repo_number').on(t.repoId, t.number), inList('pr_status', t.status, PR_STATUSES)])

export const verification = pgTable('verification', { // [LS] Feature/Entry shots; [IF] demo kinds + fake-data notes
  id: id(), taskId: text('task_id').notNull().references(() => task.id), prId: text('pr_id').references(() => pr.id),
  runId: text('run_id').references(() => run.id), kind: text('kind').notNull(), label: text('label'),
  name: text('name').notNull(), route: text('route'), blobUrl: text('blob_url'), notes: jsonb('notes'), // notes.fake_data
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('verification_task_name').on(t.taskId, t.name), // [LS] same name replaces
  inList('verification_kind', t.kind, ['screenshot', 'video', 'flow_diff', 'expectation', 'story', 'numbers']),
  check('verification_label', sql`${t.label} is null or ${t.label} in ('feature', 'entry_point', 'before', 'after', 'failing_now_passing', 'data_effect')`)])
