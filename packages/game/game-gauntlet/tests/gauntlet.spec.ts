import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import SessionStore from '@deepseek-ai/dsh-session'
import GameRuntime from '@deepseek-ai/dsh-game'
import * as GameSim from '@deepseek-ai/dsh-game-sim'
import GauntletRuntime, { GauntletError, foldGauntletRounds } from '@deepseek-ai/dsh-game-gauntlet'
import type { GauntletScenario } from '@deepseek-ai/dsh-game-gauntlet'

/** A fresh plugin object for the game-sim provider (module exports are read-only). */
function mountGameSimPlugin(): { name: string; inject: string[]; apply: (ctx: Context) => void } {
  return { name: GameSim.name, inject: [...GameSim.inject], apply: (ctx) => { GameSim.apply(ctx) } }
}

/** Mount the game seam, the sim provider, the session store, and the gauntlet runtime. */
async function mountGauntlet(): Promise<{ ctx: Context }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(GameRuntime)
  await ctx.plugin(mountGameSimPlugin())
  await ctx.plugin(GauntletRuntime)
  return { ctx }
}

const WINNING_MOVES = ['down', 'right', 'down', 'left', 'up', 'up', 'right', 'right']

const WINNING_SCENARIO: GauntletScenario = {
  id: 'collect-all',
  game: 'coin-chase',
  inputs: WINNING_MOVES,
  bar: 30,
}

describe('GauntletRuntime.run', () => {
  it('appends a passing gauntlet/round event when the score reaches the bar', async () => {
    const { ctx } = await mountGauntlet()
    const session = ctx.sessions.create(SessionId('passing-session'))

    const round = ctx.gauntlet.run(WINNING_SCENARIO, session, 1)
    expect(round).toMatchObject({ scenarioId: 'collect-all', score: 30, bar: 30, passed: true, steps: 8 })
    const event = session.events.findLast(event => event.type === 'gauntlet/round')
    expect(event?.data).toEqual({
      scenarioId: 'collect-all',
      game: 'coin-chase',
      attempt: 1,
      steps: 8,
      score: 30,
      bar: 30,
      passed: true,
    })
    expect(round.eventSeq).toBe(event?.seq)
  })

  it('logs a failing round with the baseline when the score misses the bar', async () => {
    const { ctx } = await mountGauntlet()
    const session = ctx.sessions.create(SessionId('failing-session'))
    const scenario: GauntletScenario = { id: 'reach-10', game: 'coin-chase', inputs: ['up'], bar: 10, baseline: 30 }

    const round = ctx.gauntlet.run(scenario, session, 1)
    expect(round).toMatchObject({ passed: false, score: 0, bar: 10, baseline: 30 })
    expect(session.events.findLast(event => event.type === 'gauntlet/round')?.data).toMatchObject({ baseline: 30, passed: false })
  })

  it('accepts strictly increasing attempts per scenario and rejects a stale or equal one', async () => {
    const { ctx } = await mountGauntlet()
    const session = ctx.sessions.create(SessionId('attempt-session'))

    ctx.gauntlet.run(WINNING_SCENARIO, session, 1)
    ctx.gauntlet.run(WINNING_SCENARIO, session, 2)
    expect(() => ctx.gauntlet.run(WINNING_SCENARIO, session, 2)).toThrow(expect.objectContaining({ code: 'GAUNTLET_STALE_ATTEMPT' }))
    expect(() => ctx.gauntlet.run(WINNING_SCENARIO, session, 1)).toThrow(expect.objectContaining({ code: 'GAUNTLET_STALE_ATTEMPT' }))
  })

  it('tracks attempts per scenario and per session independently', async () => {
    const { ctx } = await mountGauntlet()
    const session = ctx.sessions.create(SessionId('multi-session'))
    const other = ctx.sessions.create(SessionId('other-session'))
    const otherScenario: GauntletScenario = { id: 'other', game: 'coin-chase', inputs: [], bar: 0 }

    ctx.gauntlet.run(WINNING_SCENARIO, session, 1)
    expect(ctx.gauntlet.run(otherScenario, session, 1)).toMatchObject({ scenarioId: 'other' })
    expect(ctx.gauntlet.run(WINNING_SCENARIO, other, 1)).toMatchObject({ attempt: 1 })
  })

  it('rejects invalid scenarios and attempts before playing', async () => {
    const { ctx } = await mountGauntlet()
    const session = ctx.sessions.create(SessionId('invalid-session'))

    expect(() => ctx.gauntlet.run({ ...WINNING_SCENARIO, id: '  ' }, session, 1)).toThrow(expect.objectContaining({ code: 'GAUNTLET_INVALID_SCENARIO_ID' }))
    expect(() => ctx.gauntlet.run({ ...WINNING_SCENARIO, bar: Number.NaN }, session, 1)).toThrow(expect.objectContaining({ code: 'GAUNTLET_INVALID_BAR' }))
    expect(() => ctx.gauntlet.run({ ...WINNING_SCENARIO, baseline: Number.POSITIVE_INFINITY }, session, 1)).toThrow(expect.objectContaining({ code: 'GAUNTLET_INVALID_BASELINE' }))
    expect(() => ctx.gauntlet.run(WINNING_SCENARIO, session, 0)).toThrow(expect.objectContaining({ code: 'GAUNTLET_INVALID_ATTEMPT' }))
    expect(() => ctx.gauntlet.run(WINNING_SCENARIO, session, 1.5)).toThrow(expect.objectContaining({ code: 'GAUNTLET_INVALID_ATTEMPT' }))
    expect(session.events.filter(event => event.type === 'gauntlet/round')).toHaveLength(0)
  })
})

describe('GauntletRuntime.nextAttempt and runLoop', () => {
  it('nextAttempt starts at 1 and advances with accepted rounds', async () => {
    const { ctx } = await mountGauntlet()
    const session = ctx.sessions.create(SessionId('attempt-count-session'))
    expect(ctx.gauntlet.nextAttempt(session, 'collect-all')).toBe(1)
    ctx.gauntlet.run(WINNING_SCENARIO, session, 1)
    expect(ctx.gauntlet.nextAttempt(session, 'collect-all')).toBe(2)
    expect(ctx.gauntlet.nextAttempt(session, 'other')).toBe(1)
  })

  it('runLoop plays candidates until the bar passes, carrying the best score as baseline', async () => {
    const { ctx } = await mountGauntlet()
    const session = ctx.sessions.create(SessionId('loop-session'))

    const result = ctx.gauntlet.runLoop(session, {
      scenarioId: 'collect-all',
      game: 'coin-chase',
      bar: 30,
      candidates: [['up'], ['down', 'right'], WINNING_MOVES],
    })
    expect(result).toEqual({ scenarioId: 'collect-all', attempts: 3, best: 30, passed: true, winningAttempt: 3 })
    const rounds = session.events.filter(event => event.type === 'gauntlet/round').map(event => event.data)
    expect(rounds).toHaveLength(3)
    expect(rounds[1]).toMatchObject({ attempt: 2, score: 10, baseline: 0, passed: false })
    expect(rounds[2]).toMatchObject({ attempt: 3, score: 30, baseline: 10, passed: true })
  })

  it('runLoop seeds its baseline from the scenario\'s prior logged best', async () => {
    const { ctx } = await mountGauntlet()
    const session = ctx.sessions.create(SessionId('loop-resume-session'))
    ctx.gauntlet.run(WINNING_SCENARIO, session, 1)
    ctx.gauntlet.run({ ...WINNING_SCENARIO, inputs: ['up'] }, session, 2)

    const result = ctx.gauntlet.runLoop(session, {
      scenarioId: 'collect-all',
      game: 'coin-chase',
      bar: 30,
      candidates: [['up']],
    })
    expect(result).toEqual({ scenarioId: 'collect-all', attempts: 1, best: 30, passed: false })
    expect(session.events.findLast(event => event.type === 'gauntlet/round')?.data).toMatchObject({ attempt: 3, baseline: 30 })
  })

  it('runLoop stops at the first passing round', async () => {
    const { ctx } = await mountGauntlet()
    const session = ctx.sessions.create(SessionId('loop-early-session'))

    const result = ctx.gauntlet.runLoop(session, {
      scenarioId: 'collect-all',
      game: 'coin-chase',
      bar: 30,
      candidates: [WINNING_MOVES, ['up']],
    })
    expect(result).toEqual({ scenarioId: 'collect-all', attempts: 1, best: 30, passed: true, winningAttempt: 1 })
    expect(session.events.filter(event => event.type === 'gauntlet/round')).toHaveLength(1)
  })

  it('runLoop with no candidates starts no rounds', async () => {
    const { ctx } = await mountGauntlet()
    const session = ctx.sessions.create(SessionId('loop-empty-session'))

    expect(ctx.gauntlet.runLoop(session, { scenarioId: 'collect-all', game: 'coin-chase', bar: 30, candidates: [] }))
      .toEqual({ scenarioId: 'collect-all', attempts: 0, passed: false })
    expect(session.events.some(event => event.type === 'gauntlet/round')).toBe(false)
  })

  it('runLoop rejects a blank scenario id and a non-finite bar', async () => {
    const { ctx } = await mountGauntlet()
    const session = ctx.sessions.create(SessionId('loop-invalid-session'))

    expect(() => ctx.gauntlet.runLoop(session, { scenarioId: '  ', game: 'coin-chase', bar: 30, candidates: [] }))
      .toThrow(expect.objectContaining({ code: 'GAUNTLET_INVALID_SCENARIO_ID' }))
    expect(() => ctx.gauntlet.runLoop(session, { scenarioId: 'collect-all', game: 'coin-chase', bar: Number.NaN, candidates: [] }))
      .toThrow(expect.objectContaining({ code: 'GAUNTLET_INVALID_BAR' }))
  })
})

describe('foldGauntletRounds', () => {
  it('folds an empty log to zero attempts with no best', () => {
    expect(foldGauntletRounds([])).toEqual({ attempts: 0, lastPassed: false, best: undefined })
  })

  it('skips non-round events and folds attempts, last verdict, and best score', async () => {
    const { ctx } = await mountGauntlet()
    const session = ctx.sessions.create(SessionId('fold-session'))
    session.append('turn/start', { turn: 1 })
    ctx.gauntlet.run({ id: 'fold', game: 'coin-chase', inputs: ['up'], bar: 10 }, session, 1)
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    ctx.gauntlet.run({ id: 'fold', game: 'coin-chase', inputs: WINNING_MOVES, bar: 30 }, session, 2)

    const folded = foldGauntletRounds(session.events)
    expect(folded).toEqual({ attempts: 2, lastPassed: true, best: { score: 30, attempt: 2 } })
  })

  it('keeps the first best score when a later round ties it', async () => {
    const { ctx } = await mountGauntlet()
    const session = ctx.sessions.create(SessionId('tie-session'))
    ctx.gauntlet.run({ id: 'tie', game: 'coin-chase', inputs: WINNING_MOVES, bar: 10 }, session, 1)
    ctx.gauntlet.run({ id: 'tie', game: 'coin-chase', inputs: WINNING_MOVES, bar: 10 }, session, 2)

    const folded = foldGauntletRounds(session.events)
    expect(folded.best).toEqual({ score: 30, attempt: 1 })
  })
})

describe('GauntletError', () => {
  it('carries the code and message through HarnessError', () => {
    const error = new GauntletError('boom', 'GAUNTLET_STALE_ATTEMPT')
    expect(error).toBeInstanceOf(GauntletError)
    expect(error.code).toBe('GAUNTLET_STALE_ATTEMPT')
    expect(error.message).toBe('boom')
  })
})
