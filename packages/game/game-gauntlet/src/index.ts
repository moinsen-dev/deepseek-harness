/**
 * The gauntlet loop service (`ctx.gauntlet`): run one playtest round against a
 * quality bar, pass/fail it model-free, and append the durable `gauntlet/round`
 * session event. The builder/critic iteration that loops until the bar passes
 * is composed from existing goal, ralph, and workflow primitives; this package
 * owns the bar, the scoring, the attempt ordering, and the logged facts.
 * @module @deepseek-ai/dsh-game-gauntlet
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-game'
import type { GauntletRound, GauntletScenario } from './types.ts'
import { GauntletError } from './types.ts'

export { GauntletError } from './types.ts'
export type { GauntletRound, GauntletScenario } from './types.ts'
export { foldGauntletRounds } from './fold.ts'
export type { FoldedGauntlet } from './fold.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    gauntlet: GauntletRuntime
  }
}

/**
 * The gauntlet runtime. Registered as `ctx.gauntlet` (one instance per context).
 * Enforces strictly increasing attempt numbers per session and scenario before
 * playing, and writes one `gauntlet/round` session event per accepted round.
 */
export class GauntletRuntime extends Service {
  static inject = ['game', 'sessions']

  private readonly lastAttempts = new Map<string, number>()

  constructor(ctx: Context) {
    super(ctx, 'gauntlet')
  }

  /**
   * Run one gauntlet round: validate the scenario and attempt, play the game,
   * compare the score against the bar, and append the durable round event.
   * Synchronous like the seam's play — deterministic in-process simulation.
   * @param scenario - the objective, game, inputs, bar, and optional baseline.
   * @param session - the session whose log receives the `gauntlet/round` event.
   * @param attempt - positive round number; must exceed the previous attempt
   *   for this scenario in this session.
   * @returns the normalized round, including the appended event's seq.
   */
  run(scenario: GauntletScenario, session: Session, attempt: number): GauntletRound {
    assertScenario(scenario)
    if (!Number.isInteger(attempt) || attempt < 1) {
      throw new GauntletError(`gauntlet attempt must be a positive integer, got ${String(attempt)}`, 'GAUNTLET_INVALID_ATTEMPT')
    }
    const key = `${session.id}:${scenario.id}`
    const lastAttempt = this.lastAttempts.get(key) ?? 0
    if (attempt <= lastAttempt) {
      throw new GauntletError(
        `gauntlet attempt ${attempt} for scenario "${scenario.id}" does not advance the previous attempt ${lastAttempt}`,
        'GAUNTLET_STALE_ATTEMPT',
      )
    }
    const result = this.ctx.game.play({ game: scenario.game, inputs: scenario.inputs })
    const passed = result.score >= scenario.bar
    const data = {
      scenarioId: scenario.id,
      game: scenario.game,
      attempt,
      steps: result.steps,
      score: result.score,
      bar: scenario.bar,
      ...(scenario.baseline === undefined ? {} : { baseline: scenario.baseline }),
      passed,
    }
    const event = session.append('gauntlet/round', data)
    this.lastAttempts.set(key, attempt)
    return { ...data, eventSeq: event.seq }
  }
}

/**
 * A scenario must carry a non-blank id, a finite bar, and a finite baseline
 * when one is given.
 * @param scenario - the scenario to validate.
 */
function assertScenario(scenario: GauntletScenario): void {
  if (scenario.id.trim().length === 0) {
    throw new GauntletError('gauntlet scenario id must be a non-empty string', 'GAUNTLET_INVALID_SCENARIO_ID')
  }
  if (!Number.isFinite(scenario.bar)) {
    throw new GauntletError(`gauntlet scenario "${scenario.id}" has a non-finite bar`, 'GAUNTLET_INVALID_BAR')
  }
  if (scenario.baseline !== undefined && !Number.isFinite(scenario.baseline)) {
    throw new GauntletError(`gauntlet scenario "${scenario.id}" has a non-finite baseline`, 'GAUNTLET_INVALID_BASELINE')
  }
}

export default GauntletRuntime
