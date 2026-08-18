import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { checkGauntletRound } from '@deepseek-ai/dsh-game-gauntlet/invariant'
import type { SessionEventMap } from '@deepseek-ai/dsh-session/types'

/** Manual invariant topology: the invariant service plus this package's companion. */
async function setup(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(InvariantRegistry)
  await ctx.plugin(await import('@deepseek-ai/dsh-game-gauntlet/invariant'))
  return ctx
}

type RoundData = SessionEventMap['gauntlet/round']

const VALID_ROUND: RoundData = {
  scenarioId: 'collect-all',
  game: 'coin-chase',
  attempt: 1,
  steps: 8,
  score: 30,
  bar: 30,
  passed: true,
}

describe('checkGauntletRound', () => {
  it('accepts a consistent passing and a consistent failing round', () => {
    expect(checkGauntletRound(VALID_ROUND)).toBeUndefined()
    expect(checkGauntletRound({ ...VALID_ROUND, score: 10, bar: 30, passed: false })).toBeUndefined()
  })

  it('rejects a non-finite score, non-finite bar, and non-positive attempt', () => {
    expect(checkGauntletRound({ ...VALID_ROUND, score: Number.NaN })).toContain('non-finite score')
    expect(checkGauntletRound({ ...VALID_ROUND, bar: Number.POSITIVE_INFINITY })).toContain('non-finite bar')
    expect(checkGauntletRound({ ...VALID_ROUND, attempt: 0 })).toContain('non-positive attempt')
    expect(checkGauntletRound({ ...VALID_ROUND, attempt: 1.5 })).toContain('non-positive attempt')
  })

  it('rejects a verdict that contradicts the bar relation', () => {
    expect(checkGauntletRound({ ...VALID_ROUND, score: 10, passed: true })).toContain('logs passed=true')
    expect(checkGauntletRound({ ...VALID_ROUND, score: 40, bar: 30, passed: false })).toContain('logs passed=false')
  })
})

describe('game-gauntlet invariant', () => {
  it('admits a consistent round and unrelated session events', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create(SessionId('valid-invariant-session'))
    session.append('turn/start', { turn: 1 })
    expect(() => session.append('gauntlet/round', VALID_ROUND)).not.toThrow()
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    await ctx.fiber.dispose()
  })

  it('rejects a malformed round at the append site', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create(SessionId('invalid-invariant-session'))
    expect(() => session.append('gauntlet/round', { ...VALID_ROUND, score: 5, passed: true }))
      .toThrow(/logs passed=true but score 5 against bar 30/)
    await ctx.fiber.dispose()
  })
})
