/**
 * The gauntlet loop service (`ctx.gauntlet`): run one playtest round against a
 * quality bar, pass/fail it model-free, and append the durable `gauntlet/round`
 * session event. The builder/critic loop policy (`runLoop`) iterates candidate
 * input sequences until the bar passes; the agent-side builder/critic
 * iteration composes from goal, ralph, and workflow primitives. This package
 * owns the bar, the scoring, the attempt ordering, and the logged facts.
 * @module @deepseek-ai/dsh-game-gauntlet
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-game'
import type { GauntletLoopPlan, GauntletLoopResult, GauntletRound, GauntletScenario } from './types.ts'
import { GauntletError } from './types.ts'

export { GauntletError } from './types.ts'
export type { GauntletLoopPlan, GauntletLoopResult, GauntletRound, GauntletScenario } from './types.ts'
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

  /**
   * The attempt number the next round for this scenario in this session would
   * receive — one above the last accepted attempt, or 1 for a new scenario.
   * @param session - the session whose attempt history is consulted.
   * @param scenarioId - the scenario's stable id.
   * @returns the next strictly increasing attempt number.
   */
  nextAttempt(session: Session, scenarioId: string): number {
    const last = this.lastAttempts.get(`${session.id}:${scenarioId}`) ?? 0
    return last + 1
  }

  /**
   * Run the builder/critic loop policy: play each candidate input sequence as
   * one round, carrying the best score so far as the next round's baseline,
   * and stop at the first round that reaches the bar. Model-free and
   * deterministic; every round lands as a durable `gauntlet/round` event, so
   * resume and fork recover the loop position by folding the log.
   * @param session - the session whose log receives the round events.
   * @param plan - the scenario id, game, bar, and candidate sequences.
   * @returns the normalized loop outcome; `winningAttempt` names the passing
   *   round when one exists.
   */
  runLoop(session: Session, plan: GauntletLoopPlan): GauntletLoopResult {
    if (plan.scenarioId.trim().length === 0) {
      throw new GauntletError('gauntlet scenario id must be a non-empty string', 'GAUNTLET_INVALID_SCENARIO_ID')
    }
    if (!Number.isFinite(plan.bar)) {
      throw new GauntletError(`gauntlet scenario "${plan.scenarioId}" has a non-finite bar`, 'GAUNTLET_INVALID_BAR')
    }
    // Seed the loop's best score from the scenario's prior logged rounds, so a
    // resumed loop carries the session's best as its first baseline.
    let best: number | undefined
    for (const event of session.events) {
      if (event.type === 'gauntlet/round' && event.data.scenarioId === plan.scenarioId
        && (best === undefined || event.data.score > best)) {
        best = event.data.score
      }
    }
    let attempt = this.nextAttempt(session, plan.scenarioId)
    let rounds = 0
    for (const candidate of plan.candidates) {
      const round = this.run({
        id: plan.scenarioId,
        game: plan.game,
        inputs: candidate,
        bar: plan.bar,
        ...(best === undefined ? {} : { baseline: best }),
      }, session, attempt)
      rounds++
      attempt++
      if (best === undefined || round.score > best) best = round.score
      if (round.passed) {
        return { scenarioId: plan.scenarioId, attempts: rounds, best, passed: true, winningAttempt: round.attempt }
      }
    }
    return { scenarioId: plan.scenarioId, attempts: rounds, ...(best === undefined ? {} : { best }), passed: false }
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
