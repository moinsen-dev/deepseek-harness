import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import { Session, SessionId, SessionStore } from '@deepseek-ai/dsh-session'
import AgentRegistry, { Inbox } from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import GameRuntime from '@deepseek-ai/dsh-game'
import * as GameSim from '@deepseek-ai/dsh-game-sim'
import GauntletRuntime from '@deepseek-ai/dsh-game-gauntlet'
import * as ToolGauntlet from '@deepseek-ai/dsh-tool-gauntlet'
import { formatGauntletRoundResult, parseGauntletRoundArgs } from '@deepseek-ai/dsh-tool-gauntlet'

/** A fresh plugin object for the game-sim provider (module exports are read-only). */
function mountGameSimPlugin(): { name: string; inject: string[]; apply: (ctx: Context) => void } {
  return { name: GameSim.name, inject: [...GameSim.inject], apply: (ctx) => { GameSim.apply(ctx) } }
}

/** A fresh plugin object for the gauntlet tool (module exports are read-only). */
function mountToolGauntletPlugin(): {
  name: string
  inject: string[]
  Config: typeof ToolGauntlet.Config
  apply: (ctx: Context, config?: ToolGauntlet.Config) => void
} {
  return {
    name: ToolGauntlet.name,
    inject: [...ToolGauntlet.inject],
    Config: ToolGauntlet.Config,
    apply: (ctx, config) => { ToolGauntlet.apply(ctx, config ?? {}) },
  }
}

/** Mount the full game stack plus the gauntlet tool. */
async function mountTools(config: ToolGauntlet.Config = {}): Promise<{ ctx: Context; agent: Agent }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(GameRuntime)
  await ctx.plugin(mountGameSimPlugin())
  await ctx.plugin(GauntletRuntime)
  await ctx.plugin(mountToolGauntletPlugin(), config)
  const scope = ctx.plugin(() => {})
  const id = SessionId('tool-gauntlet-agent')
  const session = Session.create(id)
  const agent: Agent = {
    id, options: {}, session, inbox: new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} }),
    status: 'idle', ctx: scope.ctx,
    followup: () => {}, steer: () => {}, inject: () => {}, send: () => {}, cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
  ctx.agents.register(agent)
  return { ctx, agent }
}

function resultText(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(block => block.type === 'text').map(block => block.text).join('')
}

const WINNING_MOVES = ['down', 'right', 'down', 'left', 'up', 'up', 'right', 'right']

describe('tool-gauntlet registration', () => {
  it('registers gauntlet_round with the stable model-facing description', async () => {
    const { ctx } = await mountTools()
    const schema = ctx.tools.schemas().find(entry => entry.name === 'gauntlet_round')
    expect(schema).toBeDefined()
    expect(schema?.description).toContain('Play one gauntlet round')
  })

  it('unregisters the tool when the contributing fiber is disposed (HMR safety)', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(GameRuntime)
    await ctx.plugin(mountGameSimPlugin())
    await ctx.plugin(GauntletRuntime)
    const fiber = await ctx.plugin(mountToolGauntletPlugin())
    expect(ctx.tools.schemas().map(schema => schema.name)).toContain('gauntlet_round')
    await fiber.dispose()
    expect(ctx.tools.schemas().map(schema => schema.name)).not.toContain('gauntlet_round')
    await ctx.fiber.dispose()
  })

  it('skips registration when disabled', async () => {
    const disabled = await mountTools({ enabled: false })
    expect(disabled.ctx.tools.schemas().map(schema => schema.name)).not.toContain('gauntlet_round')
  })

  it('rejects an invalid timeoutMs at load', async () => {
    for (const timeoutMs of [0, -5, 1.5]) {
      const ctx = new Context()
      await ctx.plugin(SessionStore)
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(GameRuntime)
      await ctx.plugin(mountGameSimPlugin())
      await ctx.plugin(GauntletRuntime)
      await expect(ctx.plugin(mountToolGauntletPlugin(), { timeoutMs }))
        .rejects.toThrow('tool-gauntlet: timeoutMs must be a positive integer')
      await ctx.fiber.dispose()
    }
  })
})

describe('gauntlet_round execution', () => {
  it('assigns strictly increasing attempts and logs each round to the calling session', async () => {
    const { ctx, agent } = await mountTools()
    const play = (inputs: string[], baseline?: number) => ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId(`round-${inputs.length}`),
      name: 'gauntlet_round',
      arguments: { scenarioId: 'collect-all', game: 'coin-chase', inputs, bar: 30, ...(baseline === undefined ? {} : { baseline }) },
      agent,
    })

    const losing = await play(['up'])
    expect(losing.isError).toBe(false)
    expect(resultText(losing)).toContain('Gauntlet round 1 for `collect-all`: score 0 against bar 30 — FAILED.')

    const winning = await play(WINNING_MOVES, 0)
    expect(winning.isError).toBe(false)
    expect(resultText(winning)).toContain('Gauntlet round 2 for `collect-all`: score 30 against bar 30 — PASSED (baseline 0, delta +30).')

    const rounds = agent.session.events.filter(event => event.type === 'gauntlet/round')
    expect(rounds.map(event => event.data.attempt)).toEqual([1, 2])
    expect(rounds[1]?.data).toMatchObject({ passed: true, baseline: 0 })
  })

  it('rejects a call without an owning agent session', async () => {
    const { ctx } = await mountTools()
    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('no-agent'),
      name: 'gauntlet_round',
      arguments: { scenarioId: 'collect-all', game: 'coin-chase', inputs: ['up'], bar: 30 },
    })
    expect(result.isError).toBe(true)
    expect(resultText(result)).toContain('owning agent session')
  })

  it('reports invalid arguments as structured tool errors', async () => {
    const { ctx, agent } = await mountTools()
    const play = (args: Record<string, unknown>) => ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('invalid'),
      name: 'gauntlet_round',
      arguments: args,
      agent,
    })

    const blank = await play({ scenarioId: '  ', game: 'coin-chase', inputs: ['up'], bar: 30 })
    expect(blank.isError).toBe(true)
    expect(resultText(blank)).toContain('scenarioId must be a non-empty string')
  })
})

describe('tool-gauntlet formatters', () => {
  it('parseGauntletRoundArgs validates and copies the input list', () => {
    expect(() => parseGauntletRoundArgs({ scenarioId: ' ', game: 'coin-chase', inputs: [], bar: 10 }))
      .toThrow('scenarioId must be a non-empty string')
    const parsed = parseGauntletRoundArgs({ scenarioId: 'x', game: 'coin-chase', inputs: ['up'], bar: 10, baseline: 5 })
    expect(parsed).toEqual({ scenarioId: 'x', game: 'coin-chase', inputs: ['up'], bar: 10, baseline: 5 })
    expect(parseGauntletRoundArgs({ scenarioId: 'x', game: 'coin-chase', inputs: ['up'], bar: 10 }))
      .toEqual({ scenarioId: 'x', game: 'coin-chase', inputs: ['up'], bar: 10 })
  })

  it('formatGauntletRoundResult renders pass, fail, delta sign, and no-baseline forms', () => {
    const pass = formatGauntletRoundResult({ scenarioId: 'collect-all', attempt: 2, steps: 8, score: 30, bar: 30, baseline: 0, passed: true })
    expect(pass).toContain('PASSED (baseline 0, delta +30)')

    const fail = formatGauntletRoundResult({ scenarioId: 'collect-all', attempt: 3, steps: 1, score: 0, bar: 30, baseline: 30, passed: false })
    expect(fail).toContain('FAILED (baseline 30, delta -30)')

    const noBaseline = formatGauntletRoundResult({ scenarioId: 'collect-all', attempt: 1, steps: 1, score: 0, bar: 30, passed: false })
    expect(noBaseline).toContain('score 0 against bar 30 — FAILED.')
  })
})
