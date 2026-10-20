import { parse } from 'yaml'

export type Lane = 'building' | 'testing' | 'parked'

export interface Idea {
  slug: string
  title: string
  app: string
  lane: Lane
  hypothesis: string
  measure: string
  baseline: string
  lookBy: string | null
  prs: string[]
  evidence: string[]
  notes: string
}

export const LANES: { id: Lane; label: string; hint: string }[] = [
  { id: 'building', label: 'Building', hint: 'Agents are producing PRs for these' },
  { id: 'testing', label: 'Testing', hint: 'Gathering evidence before building' },
  { id: 'parked', label: 'Parked', hint: 'Captured, waiting for evidence or a decision' },
]

/** Parse one idea file: YAML fields between --- lines, then free notes. */
export function parseIdea(slug: string, raw: string): Idea {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  const fields = (match ? parse(match[1]) : {}) ?? {}
  const lane: Lane = ['building', 'testing', 'parked'].includes(fields.lane) ? fields.lane : 'parked'
  return {
    slug,
    title: fields.title ?? slug,
    app: fields.app ?? '',
    lane,
    hypothesis: fields.hypothesis ?? '',
    measure: fields.measure ?? '',
    baseline: fields.baseline ?? '',
    lookBy: fields.look_by ? String(fields.look_by) : null,
    prs: fields.prs ?? [],
    evidence: fields.evidence ?? [],
    notes: (match ? match[2] : raw).trim(),
  }
}

// The idea files live at the repo root (../../ideas), one per idea; README.md is not an idea.
const files = import.meta.glob('../../ideas/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

export const ideas: Idea[] = Object.entries(files)
  .filter(([path]) => !path.endsWith('/README.md'))
  .map(([path, raw]) => parseIdea(path.split('/').pop()!.replace(/\.md$/, ''), raw))
  .sort((a, b) => a.title.localeCompare(b.title))

export const findIdea = (slug: string) => ideas.find((i) => i.slug === slug)
