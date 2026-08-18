import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import GameRuntime from '@deepseek-ai/dsh-game'
import { CoinChase, CoinChaseModule, COIN_CHASE_ID, COIN_SCORE } from '@deepseek-ai/dsh-game-sim'
import * as GameSim from '@deepseek-ai/dsh-game-sim'

/** Mount the game seam plus the game-sim provider. */
async function mountGameSim(): Promise<{ ctx: Context; game: GameRuntime }> {
  const ctx = new Context()
  await ctx.plugin(GameRuntime)
  await ctx.plugin(mountGameSimPlugin())
  return { ctx, game: ctx.game }
}

/** A fresh plugin object for the game-sim provider (module exports are read-only). */
function mountGameSimPlugin(): { name: string; inject: string[]; apply: (ctx: Context) => void } {
  return { name: GameSim.name, inject: [...GameSim.inject], apply: (ctx) => { GameSim.apply(ctx) } }
}

const WINNING_MOVES = ['down', 'right', 'down', 'left', 'up', 'up', 'right', 'right']

describe('CoinChase module', () => {
  it('registers under the stable coin-chase id', () => {
    expect(new CoinChaseModule().id).toBe(COIN_CHASE_ID)
    expect(new CoinChaseModule().create()).toBeInstanceOf(CoinChase)
  })

  it('starts at the top-left cell with all three coins, no score, and no moves', () => {
    const run = new CoinChase()
    expect(run.state()).toEqual({
      player: [0, 0],
      coins: [[0, 2], [1, 1], [2, 0]],
      score: 0,
      moves: 0,
    })
    expect(run.done()).toBe(false)
    expect(run.score()).toBe(0)
  })

  it('collects all three coins in a fixed sequence and reports done with score 30', async () => {
    const { game } = await mountGameSim()
    const result = game.play({ game: COIN_CHASE_ID, inputs: WINNING_MOVES })
    expect(result.steps).toBe(8)
    expect(result.score).toBe(30)
    expect(result.done).toBe(true)
    expect(result.state).toEqual({ player: [0, 2], coins: [], score: 30, moves: 8 })
  })

  it('clamps out-of-bounds moves to the grid edge', () => {
    const run = new CoinChase()
    run.step('up')
    expect(run.state().player).toEqual([0, 0])
    run.step('left')
    expect(run.state().player).toEqual([0, 0])
  })

  it('treats an unknown string and a non-string input as counted no-op steps', () => {
    const run = new CoinChase()
    run.step('jump')
    run.step(42)
    const state = run.state()
    expect(state.player).toEqual([0, 0])
    expect(state.moves).toBe(2)
    expect(state.score).toBe(0)
  })

  it('stops at a coin without collecting it twice', () => {
    const run = new CoinChase()
    run.step('down')
    run.step('right') // collects the coin at (1,1)
    expect(run.score()).toBe(COIN_SCORE)
    run.step('up')
    run.step('right') // (0,1): no coin
    run.step('right') // (0,2): collects the second coin
    expect(run.state().coins).toEqual([[2, 0]])
    expect(run.score()).toBe(2 * COIN_SCORE)
  })

  it('returns a detached state snapshot that later moves cannot mutate', () => {
    const run = new CoinChase()
    const snapshot = run.state()
    run.step('down')
    expect(snapshot.player).toEqual([0, 0])
    expect(run.state().player).toEqual([1, 0])
  })
})

describe('game-sim plugin', () => {
  it('registers coin-chase into ctx.game and unloads it with the fiber (HMR safety)', async () => {
    const ctx = new Context()
    await ctx.plugin(GameRuntime)
    const fiber = await ctx.plugin(mountGameSimPlugin())
    expect(ctx.game.list().map(module => module.id)).toEqual([COIN_CHASE_ID])
    await fiber.dispose()
    expect(ctx.game.list()).toHaveLength(0)
    await ctx.fiber.dispose()
  })

  it('fails loud on a second registration through the seam', async () => {
    const ctx = new Context()
    await ctx.plugin(GameRuntime)
    await ctx.plugin(mountGameSimPlugin())
    await expect(ctx.plugin(mountGameSimPlugin())).rejects.toThrow(expect.objectContaining({ code: 'GAME_DUPLICATE_MODULE' }))
    await ctx.fiber.dispose()
  })
})
