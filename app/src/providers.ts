// Modules and providers (SHAPE.md): what the factory can do, and who fills each role.
// Static for now; "connected" comes from each app's own settings until the factory has a server.
export type Status = 'connected' | 'pending' | 'not connected'

export interface Provider { name: string; does: string; status: Status; note?: string }
export interface Module { role: string; why: string; providers: Provider[] }

export const modules: Module[] = [
  {
    role: 'Telemetry',
    why: 'Feeds the factory. Every idea is checked against it; every PR is judged by it.',
    providers: [
      { name: 'PostHog', does: 'What users do: events, flags, experiments, LLM calls; traces over OTLP', status: 'connected',
        note: 'Homework Gate sends events (project 677236). Keys live in each app\'s .env and the engine\'s .env, never here.' },
      { name: 'Datadog', does: 'What services do: traces, logs, errors', status: 'not connected' },
    ],
  },
  {
    role: 'Build',
    why: 'Agents produce the PRs, and the support for them.',
    providers: [
      { name: 'Claude Code', does: 'Headless agent on a branch; development on the subscription, product on an API key',
        status: 'connected' },
    ],
  },
  {
    role: 'Design system',
    why: 'Stories are the demonstration of every PR.',
    providers: [{ name: 'Storybook', does: 'Design system, page states, mockups', status: 'connected',
      note: 'Homework Gate: storybook/' }],
  },
  {
    role: 'Code host',
    why: 'Where PRs live. Work is PRs only; main is production.',
    providers: [{ name: 'GitHub', does: 'infinitedusky/homework-gate, infinitedusky/idea-factory', status: 'connected' }],
  },
]
