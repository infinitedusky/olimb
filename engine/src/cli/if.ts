/**
 * `if`: the engine's CLI. A client like any other: it talks to the server over HTTP and watches /events.
 * Only `migrate` touches the database directly.
 */
import { readFile } from 'node:fs/promises'
import { Command } from 'commander'

const ENGINE_URL = process.env.ENGINE_URL ?? 'http://localhost:4000'

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(ENGINE_URL + path, {
    method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`)
  return JSON.parse(text) as T
}

const program = new Command('if').description('Idea Factory engine')

program.command('migrate').description('apply database migrations').action(async () => {
  await import('../db/migrate.js')
})

program.command('workspace').argument('<name>').description('create a workspace').action(async (name: string) => {
  console.log(JSON.stringify(await api('POST', '/workspaces', { name })))
})

program.command('app').argument('<name>').requiredOption('-w, --workspace <id>').option('-b, --branch <name>', 'default branch', 'main')
  .description('register an app (a stack of repos)').action(async (name: string, o: { workspace: string; branch: string }) => {
    console.log(JSON.stringify(await api('POST', '/apps', { workspaceId: o.workspace, name, defaultBranch: o.branch })))
  })

const plan = program.command('plan').description('plans are made of tasks')

plan.command('create').requiredOption('-a, --app <id>').requiredOption('-t, --title <title>').requiredOption('-f, --tasks <file>', 'JSON: [{key, title, brief?, dependsOn?, files?}]')
  .action(async (o: { app: string; title: string; tasks: string }) => {
    const tasks = JSON.parse(await readFile(o.tasks, 'utf8'))
    const out = await api<{ plan: { id: string }; tasks: { id: string; number: number; title: string }[] }>('POST', '/plans', { appId: o.app, title: o.title, tasks })
    console.log(`plan ${out.plan.id}`)
    for (const t of out.tasks) console.log(`  ${t.id}  #${t.number}  ${t.title}`)
  })

plan.command('graph').argument('<planId>').action(async (planId: string) => {
  const g = await api<{ plan: { title: string; integrationBranch: string }; tasks: any[] }>('GET', `/plans/${planId}/graph`)
  console.log(`${g.plan.title}  (${g.plan.integrationBranch})`)
  for (const t of g.tasks) {
    const deps = t.dependsOn.length ? `  ← ${t.dependsOn.join(', ')}` : ''
    const held = t.heldReason ? `  [held: ${t.heldReason}]` : ''
    console.log(`  ${t.status.padEnd(15)} ${t.id}  #${t.number} ${t.title}${deps}${held}`)
  }
})

plan.command('tick').argument('<planId>').option('-r, --room <n>', 'free session slots').description('one dispatch pass')
  .action(async (planId: string, o: { room?: string }) => {
    const q = o.room ? `?room=${o.room}` : ''
    console.log(JSON.stringify(await api('POST', `/plans/${planId}/tick${q}`), null, 2))
  })

program.command('task').command('status').argument('<taskId>').argument('<status>').description('manual transition (no executor yet)')
  .action(async (taskId: string, status: string) => {
    console.log(JSON.stringify(await api('POST', `/tasks/${taskId}/status`, { status })))
  })

program.command('watch').option('-s, --since <seq>', 'replay from this sequence number', '0').option('-p, --plan <id>').option('-w, --workspace <id>')
  .description('follow the event log').action(async (o: { since: string; plan?: string; workspace?: string }) => {
    const q = new URLSearchParams({ since: o.since })
    if (o.plan) q.set('plan', o.plan)
    if (o.workspace) q.set('workspace', o.workspace)
    const res = await fetch(`${ENGINE_URL}/events?${q}`)
    if (!res.ok || !res.body) throw new Error(`watch: ${res.status}`)
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
    let buf = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += value
      let i: number
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, i); buf = buf.slice(i + 2)
        const data = frame.split('\n').find((l) => l.startsWith('data:'))?.slice(5).trim()
        const type = frame.split('\n').find((l) => l.startsWith('event:'))?.slice(6).trim()
        if (type === 'ping' || !data) continue
        const e = JSON.parse(data)
        const who = e.taskId ?? e.planId ?? e.appId ?? ''
        console.log(`${String(e.seq).padStart(6)}  ${e.ts.slice(11, 19)}  ${e.type.padEnd(14)} ${who}  ${JSON.stringify(e.payload)}`)
      }
    }
  })

await program.parseAsync()
