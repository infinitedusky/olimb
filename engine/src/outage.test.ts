import { describe, expect, it } from 'vitest'
import { holdMinutes, isOutage } from './outage.js'

describe('isOutage', () => {
  it('recognises the model or account being unavailable', () => {
    for (const e of ['error_during_execution: API Error: 429 rate_limit_error', 'Overloaded', 'Claude AI usage limit reached', 'Invalid API key · Please run /login',
      'request failed: ECONNRESET', 'fetch failed', 'API Error: 529 {"type":"overloaded_error"}', 'terminal: blocking_limit']) expect(isOutage(e)).toBe(true)
  })
  it('does not excuse the work failing', () => {
    for (const e of ['error_max_turns', 'landing failed at test: tests failed (exit 1)', 'error_max_budget_usd', 'conflicts with the integration branch in: a.ts', null]) expect(isOutage(e)).toBe(false)
  })
  it('backs off 1, 2, 5, 10, 15 minutes', () => { expect([0, 1, 2, 3, 4, 9].map(holdMinutes)).toEqual([1, 2, 5, 10, 15, 15]) })
})
