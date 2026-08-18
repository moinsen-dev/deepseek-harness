import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { JsonValue } from '@deepseek-ai/dsh-session'
import GameRuntime, { GameError, type GameInstance, type GameModule } from '@deepseek-ai/dsh-game'

/** A scripted module for contract tests: state echoes the applied inputs. */
function makeModule(id: string, options: {
  doneAt?: (steps: number) => boolean
  score?: () => number
  state?: () => JsonValue
  onStep?: (input: JsonValue) => void
} = {}): GameModule {
  return {
    id,
    create: () => {
      const applied: JsonValue[] = []
      const instance: GameInstance = {
        state: () => (options.state ? options.state() : { applied: [...applied] }),
        step: (input) => {
          applied.push(input)
          options.onStep?.(input)
        },
        done: () => (options.doneAt ? options.doneAt(applied.length) : false),
        score: () => (options.score ? options.score() : applied.length),
      }
      return instance
    },
  }
}

/** Mount a GameRuntime on a fresh root context with the given config. */
async function mountGame(config: ConstructorParameters<typeof GameRuntime>[1] = {}): Promise<{ ctx: Context; game: GameRuntime }> {
  const ctx = new Context()
  await ctx.plugin(GameRuntime, config)
  return { ctx, game: ctx.game }
}

describe('GameRuntime registration', () => {
  it('registers a module, lists it, and unregisters it via the returned disposer', async () => {
    const { game } = await mountGame()
    const module = makeModule('coin-chase')

    const dispose = game.registerModule(module)
    expect(game.list()).toEqual([module])
    expect(game.play({ game: 'coin-chase', inputs: ['up'] })).toMatchObject({ steps: 1 })

    dispose()
    expect(game.list()).toEqual([])
    expect(() => game.play({ game: 'coin-chase', inputs: [] })).toThrow(expect.objectContaining({ code: 'GAME_UNKNOWN_GAME' }))
  })

  it('throws GAME_DUPLICATE_MODULE on a duplicate id', async () => {
    const { game } = await mountGame()
    game.registerModule(makeModule('coin-chase'))
    expect(() => game.registerModule(makeModule('coin-chase')))
      .toThrow(expect.objectContaining({ code: 'GAME_DUPLICATE_MODULE' }))
  })

  it('disposes the module registration when the contributing fiber is disposed (HMR safety)', async () => {
    const { ctx, game } = await mountGame()
    const fiber = await ctx.plugin(Object.assign((inner: Context) => {
      inner.game.registerModule(makeModule('coin-chase'))
    }, { inject: ['game'] }))
    expect(game.list()).toHaveLength(1)
    await fiber.dispose()
    expect(game.list()).toHaveLength(0)
  })

  it('rejects a non-positive or non-integer maxSteps at load', async () => {
    for (const maxSteps of [0, -1, 1.5]) {
      const ctx = new Context()
      await expect(ctx.plugin(GameRuntime, { maxSteps })).rejects.toThrow('game: maxSteps must be a positive integer')
      await ctx.fiber.dispose()
    }
  })

  it('defaults maxSteps when constructed directly without a config', async () => {
    const ctx = new Context()
    const game = new GameRuntime(ctx)
    expect(game.list()).toEqual([])
    await ctx.fiber.dispose()
  })
})

describe('GameRuntime execution', () => {
  it('plays a full input sequence and reports the final state, score, and done flag', async () => {
    const { game } = await mountGame()
    game.registerModule(makeModule('echo'))

    expect(game.play({ game: 'echo', inputs: ['up', 'down'] }))
      .toEqual({ game: 'echo', steps: 2, state: { applied: ['up', 'down'] }, score: 2, done: false })
  })

  it('stops early once the instance reports done, leaving later inputs unapplied', async () => {
    const { game } = await mountGame()
    game.registerModule(makeModule('echo', { doneAt: steps => steps >= 1 }))

    const result = game.play({ game: 'echo', inputs: ['up', 'down', 'left'] })
    expect(result.steps).toBe(1)
    expect(result.done).toBe(true)
    expect(result.state).toEqual({ applied: ['up'] })
  })

  it('throws GAME_UNKNOWN_GAME for an unregistered game id', async () => {
    const { game } = await mountGame()
    expect(() => game.play({ game: 'missing', inputs: [] })).toThrow(expect.objectContaining({ code: 'GAME_UNKNOWN_GAME' }))
  })

  it('throws GAME_STEP_LIMIT_EXCEEDED when the request exceeds the configured cap', async () => {
    const { game } = await mountGame({ maxSteps: 2 })
    game.registerModule(makeModule('echo'))
    expect(() => game.play({ game: 'echo', inputs: ['a', 'b', 'c'] }))
      .toThrow(expect.objectContaining({ code: 'GAME_STEP_LIMIT_EXCEEDED' }))
  })

  it('applies exactly maxSteps inputs when the request length equals the cap', async () => {
    const { game } = await mountGame({ maxSteps: 2 })
    game.registerModule(makeModule('echo'))
    expect(game.play({ game: 'echo', inputs: ['a', 'b'] })).toMatchObject({ steps: 2 })
  })

  it('throws GAME_ABORTED when the signal is already aborted', async () => {
    const { game } = await mountGame()
    game.registerModule(makeModule('echo'))
    const controller = new AbortController()
    controller.abort()
    expect(() => game.play({ game: 'echo', inputs: ['up'] }, controller.signal))
      .toThrow(expect.objectContaining({ code: 'GAME_ABORTED' }))
  })

  it('throws GAME_ABORTED when the signal aborts between inputs', async () => {
    const { game } = await mountGame()
    let firstInputSeen = false
    const controller = new AbortController()
    game.registerModule(makeModule('echo', {
      onStep: () => {
        if (!firstInputSeen) {
          firstInputSeen = true
          controller.abort()
        }
      },
    }))
    expect(() => game.play({ game: 'echo', inputs: ['up', 'down'] }, controller.signal))
      .toThrow(expect.objectContaining({ code: 'GAME_ABORTED' }))
  })

  it('throws GAME_INVALID_STATE when a state snapshot is not lossless JSON', async () => {
    const { game } = await mountGame()
    game.registerModule(makeModule('echo', { state: () => ({ bad: () => {} }) as unknown as JsonValue }))
    expect(() => game.play({ game: 'echo', inputs: ['up'] }))
      .toThrow(expect.objectContaining({ code: 'GAME_INVALID_STATE' }))
  })

  it('throws GAME_INVALID_SCORE when the final score is not finite', async () => {
    const { game } = await mountGame()
    game.registerModule(makeModule('echo', { score: () => Number.NaN }))
    expect(() => game.play({ game: 'echo', inputs: [] }))
      .toThrow(expect.objectContaining({ code: 'GAME_INVALID_SCORE' }))
  })

  it('validates state and score even for an already-done run with no inputs applied', async () => {
    const { game } = await mountGame()
    game.registerModule(makeModule('echo', { doneAt: () => true, score: () => 7 }))
    expect(game.play({ game: 'echo', inputs: ['up'] })).toMatchObject({ steps: 0, score: 7, done: true })
  })

  it('returns a detached state snapshot that later mutation cannot leak back into the run', async () => {
    const { game } = await mountGame()
    const state: { applied: JsonValue[] } = { applied: [] }
    game.registerModule(makeModule('echo', {
      onStep: () => { state.applied.push('up') },
      state: () => state,
    }))

    const result = game.play({ game: 'echo', inputs: ['up'] })
    const detached = result.state as { applied: JsonValue[] }
    detached.applied.push('left')
    expect(state.applied).toEqual(['up'])

    expect(game.play({ game: 'echo', inputs: [] }).state).toEqual({ applied: ['up'] })
  })
})

describe('GameError', () => {
  it('carries the code and message through HarnessError', () => {
    const error = new GameError('boom', 'GAME_UNKNOWN_GAME')
    expect(error).toBeInstanceOf(GameError)
    expect(error.code).toBe('GAME_UNKNOWN_GAME')
    expect(error.message).toBe('boom')
  })
})
