/**
 * Outages: a run that died for a reason outside the work — the model or the account behind it is unavailable —
 * is not the phase's failure. It doesn't use up an attempt; the engine holds and tries again later.
 */
const OUTAGE = [
  /rate.?limit/i, /\b429\b/, /overloaded/i, /\b529\b/, /\b50[0234]\b/, /service unavailable/i, /internal server error/i,
  /usage limit/i, /credit balance/i, /quota/i, /billing/i,
  /authenticat/i, /unauthori[sz]ed/i, /\b401\b/, /\b403\b/, /not logged in/i, /invalid api key/i, /please run \/login/i, /oauth/i,
  /ECONNRESET/, /ECONNREFUSED/, /ETIMEDOUT/, /ENOTFOUND/, /EAI_AGAIN/, /socket hang up/i, /network/i, /fetch failed/i,
  /api_error/i, /model_error/i, /blocking_limit/i, /rapid_refill/i,
]

export function isOutage(error: string | null | undefined): boolean {
  if (!error) return false
  return OUTAGE.some((re) => re.test(error))
}

/** How long to hold before the next try, by how many outages in a row: 1, 2, 5, 10, then 15 minutes. */
export const holdMinutes = (level: number) => [1, 2, 5, 10, 15][Math.min(level, 4)]
