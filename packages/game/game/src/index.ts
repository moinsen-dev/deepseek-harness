/**
 * Service Definition for the game capability seam (`ctx.game`): a registry of
 * deterministic playable game modules plus bounded playtest execution.
 * Duplicate module ids are rejected. Play resolves the module by id, applies
 * inputs until `done()` or the request end, and validates every state snapshot
 * and the final score, so a module returning malformed output fails at the seam
 * instead of poisoning consumers.
 * @module @deepseek-ai/dsh-game
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { snapshotJsonValue } from '@deepseek-ai/dsh-session'
import type { JsonValue } from '@deepseek-ai/dsh-session'
import type { GameModule, PlaytestRequest, PlaytestResult } from './types.ts'
import { GameError } from './types.ts'

export { GameError } from './types.ts'
export type { GameInstance, GameModule, PlaytestRequest, PlaytestResult } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    game: GameRuntime
  }
}

/** Config for the game seam: the per-run input cap enforced during play. */
export interface GameRuntimeConfig {
  /** Maximum number of inputs one playtest run may apply. */
  readonly maxSteps?: number
}

/** Default per-run input cap when `maxSteps` is not configured. */
export const DEFAULT_MAX_STEPS = 1000

/**
 * The game capability service. Registered as `ctx.game` (one instance per context).
 *
 * Execution semantics: a run applies inputs in order, stops early when the
 * instance reports `done()`, and rejects with {@link GameError} when the request
 * exceeds the step cap, the game id is unknown, the run is aborted, a state
 * snapshot is not lossless JSON, or the final score is not finite.
 */
export class GameRuntime extends Service {
  static Config: z<GameRuntimeConfig> = z.object({
    maxSteps: z.number().default(DEFAULT_MAX_STEPS),
  })

  private readonly modules = new Map<string, GameModule>()
  private readonly maxSteps: number

  constructor(ctx: Context, config: GameRuntimeConfig = {}) {
    super(ctx, 'game')
    const maxSteps = config.maxSteps ?? DEFAULT_MAX_STEPS
    if (!Number.isInteger(maxSteps) || maxSteps < 1) {
      throw new Error('game: maxSteps must be a positive integer')
    }
    this.maxSteps = maxSteps
  }

  /**
   * Register a game module. Throws {@link GameError} `GAME_DUPLICATE_MODULE`
   * if its id is already registered. Returns a disposer; the registration is
   * also disposed with the calling fiber.
   * @param module - the module; its `id` is the registry key.
   * @returns the disposer that unregisters the module.
   */
  registerModule(module: GameModule): () => void {
    if (this.modules.has(module.id)) {
      throw new GameError(`a game module with id "${module.id}" is already registered`, 'GAME_DUPLICATE_MODULE')
    }
    const modules = this.modules
    const dispose = this.ctx.effect(function* () {
      modules.set(module.id, module)
      yield () => modules.delete(module.id)
    }, 'game.registerModule()')
    // ctx.effect's disposer returns Promise<void>; our disposer API is
    // synchronous fire-and-forget — discard the (always-resolved) promise.
    return () => void dispose()
  }

  /**
   * All registered modules, in registration order.
   * @returns a fresh array of the registered modules.
   */
  list(): readonly GameModule[] {
    return [...this.modules.values()]
  }

  /**
   * Play one request through the registered module. Cancellation is cooperative:
   * the signal is checked before each applied input, so an abort mid-run stops
   * before the next input and never after the final one. Synchronous by
   * contract — modules are deterministic in-process simulations; engine-backed
   * providers require the deferred asynchronous contract.
   * @param request - the game id plus the scripted input sequence.
   * @param signal - optional cancellation signal checked between inputs.
   * @returns the normalized playtest outcome.
   */
  play(request: PlaytestRequest, signal?: AbortSignal): PlaytestResult {
    if (request.inputs.length > this.maxSteps) {
      throw new GameError(`playtest request exceeds the maximum of ${this.maxSteps} inputs`, 'GAME_STEP_LIMIT_EXCEEDED')
    }
    const module = this.modules.get(request.game)
    if (module === undefined) {
      throw new GameError(`game module "${request.game}" is not registered`, 'GAME_UNKNOWN_GAME')
    }
    const run = module.create()
    let steps = 0
    for (const input of request.inputs) {
      if (signal?.aborted) {
        throw new GameError('game playtest aborted', 'GAME_ABORTED')
      }
      if (run.done()) break
      run.step(input)
      steps++
      snapshotState(run.state(), steps)
    }
    const state = snapshotState(run.state(), steps)
    const score = run.score()
    if (!Number.isFinite(score)) {
      throw new GameError(`game module "${request.game}" returned a non-finite score`, 'GAME_INVALID_SCORE')
    }
    return {
      game: request.game,
      steps,
      state,
      score,
      done: run.done(),
    }
  }
}

/**
 * A state snapshot must be lossless JSON. Snapshotting after every applied
 * input validates and detaches in one walk, so a malformed mid-run state fails
 * at the seam instead of reaching consumers.
 * @param state - the instance's snapshot after the last applied input.
 * @param steps - the number of inputs applied so far.
 * @returns the detached lossless-JSON snapshot.
 */
function snapshotState(state: JsonValue, steps: number): JsonValue {
  const snapshot = snapshotJsonValue(state)
  if (snapshot === undefined) {
    throw new GameError(`game state after input ${steps} is not lossless JSON`, 'GAME_INVALID_STATE')
  }
  return snapshot
}

export default GameRuntime
