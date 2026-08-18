/**
 * Vocabulary for the game capability seam (`ctx.game`): the module/instance
 * contract, the playtest request and result types, and the GameError taxonomy.
 * Games are pure deterministic simulations in this PoC; the seam owns the
 * registry, step-cap enforcement, and output validation.
 * @module @deepseek-ai/dsh-game/types
 */

import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { JsonValue } from '@deepseek-ai/dsh-session'

/**
 * A registered game: a factory with a stable identity. The seam creates one
 * instance per playtest run, so a scenario never observes a previous run's state.
 */
export interface GameModule {
  /** Stable unique id — the `game` field of playtest requests and gauntlet scenarios. */
  readonly id: string
  /** Create one fresh playable run. */
  create(): GameInstance
}

/**
 * One live playable run. Implementations must be deterministic: the same input
 * sequence yields the same state, score, and terminal transition.
 */
export interface GameInstance {
  /** Current observable state as lossless JSON. */
  state(): JsonValue
  /** Apply one scripted input and advance the simulation. */
  step(input: JsonValue): void
  /** True once the terminal condition holds; the seam stops stepping then. */
  done(): boolean
  /** Objective score so far; higher is better. Must be a finite number. */
  score(): number
}

/**
 * One playtest request: a registered game plus the scripted input sequence.
 * The seam rejects a sequence longer than its configured `maxSteps` before
 * applying anything.
 */
export interface PlaytestRequest {
  /** Registered game id to play. */
  readonly game: string
  /** Scripted inputs applied in order until `done()` or the list ends. */
  readonly inputs: readonly JsonValue[]
}

/** Normalized playtest outcome produced by the seam. */
export interface PlaytestResult {
  /** The game id that was played. */
  readonly game: string
  /** Number of inputs actually applied — stops at `done()` or the request end. */
  readonly steps: number
  /** Final observable state, snapshotted as detached lossless JSON. */
  readonly state: JsonValue
  /** Final objective score. */
  readonly score: number
  /** Whether the run reached its terminal condition. */
  readonly done: boolean
}

/**
 * Typed game error with a machine-routable, open-string `code` and chained
 * `cause`. Codes the seam owns: `GAME_DUPLICATE_MODULE`, `GAME_UNKNOWN_GAME`,
 * `GAME_STEP_LIMIT_EXCEEDED`, `GAME_ABORTED`, `GAME_INVALID_STATE`, and
 * `GAME_INVALID_SCORE`. Consumers must tolerate module-specific codes.
 */
export class GameError extends HarnessError {}
