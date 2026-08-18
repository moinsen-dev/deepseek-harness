/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-game-gauntlet`:
 * every appended `gauntlet/round` session event must satisfy the bar relation
 * (`passed === score >= bar`) and carry a finite score/bar plus a positive
 * integer attempt. The runtime enforces these before appending; the check
 * intercepts the dispatch so a producer appending a malformed round directly
 * fails at the append site instead of polluting the durable stream.
 * @module @deepseek-ai/dsh-game-gauntlet/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { SessionEventMap } from '@deepseek-ai/dsh-session/types'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-game-gauntlet'

/** Cordis companion plugin name. */
export const name = 'game-gauntlet-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * Validate one `gauntlet/round` payload against the bar relation.
 * @param data - the appended round data.
 * @returns the violation message, or undefined when the payload is consistent.
 */
export function checkGauntletRound(data: SessionEventMap['gauntlet/round']): string | undefined {
  if (!Number.isFinite(data.score)) {
    return `gauntlet/round for scenario "${data.scenarioId}" logs a non-finite score`
  }
  if (!Number.isFinite(data.bar)) {
    return `gauntlet/round for scenario "${data.scenarioId}" logs a non-finite bar`
  }
  if (!Number.isInteger(data.attempt) || data.attempt < 1) {
    return `gauntlet/round for scenario "${data.scenarioId}" logs a non-positive attempt`
  }
  if (data.passed !== (data.score >= data.bar)) {
    return `gauntlet/round for scenario "${data.scenarioId}" logs passed=${String(data.passed)} `
      + `but score ${String(data.score)} against bar ${String(data.bar)}`
  }
  return undefined
}

/** Install the per-round check on the session event dispatch. */
const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [, event] = args as [Session, SessionEvent]
    if (event.type !== 'gauntlet/round') return
    const violation = checkGauntletRound(event.data)
    if (violation !== undefined) fail(violation)
  }, { global: true })
}, { inject: ['sessions'] })

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
