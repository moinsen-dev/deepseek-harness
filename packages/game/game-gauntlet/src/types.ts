/**
 * Vocabulary of the gauntlet loop: the scenario (objective plus quality bar),
 * the normalized round outcome, the durable `gauntlet/round` session event, and
 * the GauntletError taxonomy. The event is declaration-merged into
 * `SessionEventMap` — it is a log-only session event (no `surfaceOp`), so it
 * never joins derived model history; scores stay replayable facts.
 * @module @deepseek-ai/dsh-game-gauntlet/types
 */

import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { JsonValue } from '@deepseek-ai/dsh-session'

/**
 * One gauntlet scenario: a playtest objective plus the pass/fail quality bar.
 * The scenario id is the stable business id across rounds, so consumers can
 * group every `gauntlet/round` event without guessing from adjacency.
 */
export interface GauntletScenario {
  /** Stable scenario id shared by every round of this objective. */
  readonly id: string
  /** Registered game id the scenario plays. */
  readonly game: string
  /** Scripted input sequence applied by every round of this scenario. */
  readonly inputs: readonly JsonValue[]
  /** Quality bar: a round passes when its score reaches this number. */
  readonly bar: number
  /** Prior best score the round is compared against, when one is known. */
  readonly baseline?: number
}

/** Normalized outcome of one gauntlet round, returned by the runtime. */
export interface GauntletRound {
  /** The scenario's stable id. */
  readonly scenarioId: string
  /** The game id that was played. */
  readonly game: string
  /** Positive round number; strictly increasing per scenario and session. */
  readonly attempt: number
  /** Number of inputs actually applied. */
  readonly steps: number
  /** Final objective score. */
  readonly score: number
  /** The quality bar the score was compared against. */
  readonly bar: number
  /** Prior best score, when the scenario carried one. */
  readonly baseline?: number
  /** Whether the round reached the bar (`score >= bar`). */
  readonly passed: boolean
  /** Seq of the appended `gauntlet/round` session event. */
  readonly eventSeq: number
}

/**
 * One builder/critic loop plan: a fixed game and quality bar plus the
 * candidate input sequences the builder produced. The loop plays each
 * candidate as one round, carries the best score so far as the next round's
 * baseline, and stops at the first round that reaches the bar.
 */
export interface GauntletLoopPlan {
  /** Stable scenario id shared by every round of this loop. */
  readonly scenarioId: string
  /** Registered game id the loop plays. */
  readonly game: string
  /** Quality bar: the loop stops once a round reaches this number. */
  readonly bar: number
  /** Candidate scripted input sequences, played in order until the bar passes. */
  readonly candidates: readonly (readonly JsonValue[])[]
}

/** Normalized outcome of one completed loop run. */
export interface GauntletLoopResult {
  /** The scenario's stable id. */
  readonly scenarioId: string
  /** Number of rounds the loop started. */
  readonly attempts: number
  /** Best score across the started rounds, when any round ran. */
  readonly best?: number
  /** Whether a round reached the bar. */
  readonly passed: boolean
  /** The attempt that reached the bar, when one exists. */
  readonly winningAttempt?: number
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * One completed gauntlet round — log-only, no surfaceOp. `passed` is the
     * model-free bar comparison `score >= bar`; every field is a durable fact
     * a resume, fork, or replay can fold without re-running the game.
     */
    'gauntlet/round': {
      /** The scenario's stable id, shared by all rounds of one objective. */
      scenarioId: string
      /** The game id that was played. */
      game: string
      /** Positive round number, strictly increasing per scenario and session. */
      attempt: number
      /** Number of inputs actually applied. */
      steps: number
      /** Final objective score. */
      score: number
      /** The quality bar the score was compared against. */
      bar: number
      /** Prior best score, when the scenario carried one. */
      baseline?: number
      /** Whether the round reached the bar. */
      passed: boolean
    }
  }
}

/**
 * Typed gauntlet error with a machine-routable, open-string `code` and chained
 * `cause`. Codes the runtime owns: `GAUNTLET_INVALID_SCENARIO_ID`,
 * `GAUNTLET_INVALID_BAR`, `GAUNTLET_INVALID_BASELINE`,
 * `GAUNTLET_INVALID_ATTEMPT`, and `GAUNTLET_STALE_ATTEMPT`.
 */
export class GauntletError extends HarnessError {}
