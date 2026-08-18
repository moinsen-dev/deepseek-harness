/**
 * Pure replay fold of durable gauntlet facts: attempts, the last round's
 * verdict, and the best score seen across the log. Consumers project this from
 * `session.events` instead of retaining round state, so resume and fork
 * recover the loop position from the log alone.
 * @module @deepseek-ai/dsh-game-gauntlet/fold
 */

import type { SessionEvent } from '@deepseek-ai/dsh-session'

/** Folded gauntlet facts over one session log. */
export interface FoldedGauntlet {
  /** Number of `gauntlet/round` events in the log. */
  readonly attempts: number
  /** Verdict of the last logged round; false before the first round. */
  readonly lastPassed: boolean
  /** Best score seen so far with the attempt that achieved it, when any. */
  readonly best?: { readonly score: number; readonly attempt: number }
}

/**
 * Fold the durable gauntlet rounds out of a session log.
 * @param events - the append-only session events, in log order.
 * @returns the folded facts; an empty log folds to zero attempts.
 */
export function foldGauntletRounds(events: readonly SessionEvent[]): FoldedGauntlet {
  let attempts = 0
  let lastPassed = false
  let best: { readonly score: number; readonly attempt: number } | undefined
  for (const event of events) {
    if (event.type !== 'gauntlet/round') continue
    attempts++
    lastPassed = event.data.passed
    if (best === undefined || event.data.score > best.score) {
      best = { score: event.data.score, attempt: event.data.attempt }
    }
  }
  return { attempts, lastPassed, ...(best === undefined ? {} : { best }) }
}
