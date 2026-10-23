/** The planner's guard: it reads, it may hand in its answer, it changes nothing. */
import { describe, expect, it } from 'vitest'
import { readerGuard } from './guard.js'

describe('readerGuard', () => {
  const g = readerGuard(['Read', 'Glob', 'Grep', 'LS'])
  it('lets the planner read and hand in its structured answer', () => {
    expect(g('Read', { file_path: 'a.ts' })).toEqual({ allow: true })
    expect(g('StructuredOutput', { phases: [] })).toEqual({ allow: true })
    expect(g('Bash', { command: 'git log --oneline -5' })).toEqual({ allow: true })
  })
  it('refuses anything that changes something', () => {
    expect(g('Edit', { file_path: 'a.ts' }).allow).toBe(false)
    expect(g('Bash', { command: 'rm -rf x' }).allow).toBe(false)
  })
})
