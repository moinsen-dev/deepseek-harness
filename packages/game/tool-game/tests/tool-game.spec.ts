import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import AgentRegistry, { Inbox } from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import GameRuntime from '@deepseek-ai/dsh-game'
import * as GameSim from '@deepseek-ai/dsh-game-sim'
import * as ToolGame from '@deepseek-ai/dsh-tool-game'
import { formatGameList, formatGamePlayResult, parseGamePlayArgs } from '@deepseek-ai/dsh-tool-game'

/** A fresh plugin object for the game tools (module exports are read-only). */
function mountToolGamePlugin(): {
  name: string
  inject: string[]
  Config: typeof ToolGame.Config
  apply: (ctx: Context, config?: ToolGame.Config) => void
} {
  return {
    name: ToolGame.name,
    inject: [...ToolGame.inject],
    Config: ToolGame.Config,
    apply: (ctx, config) => { ToolGame.apply(ctx, config ?? {}) },
  }
}

/** Mount the game seam, the sim provider, the tool registry, and the game tools. */
async function mountTools(config: ToolGame.Config = {}): Promise<{ ctx: Context; agent: Agent }> {
  const ctx = new Context()
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(GameRuntime)
  await ctx.plugin(mountGameSimPlugin())
  await ctx.plugin(mountToolGamePlugin(), config)
  const scope = ctx.plugin(() => {})
  const id = SessionId('tool-game-agent')
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

/** A fresh plugin object for the game-sim provider. */
function mountGameSimPlugin(): { name: string; inject: string[]; apply: (ctx: Context) => void } {
  return { name: GameSim.name, inject: [...GameSim.inject], apply: (ctx) => { GameSim.apply(ctx) } }
}

function resultText(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(block => block.type === 'text').map(block => block.text).join('')
}

const WINNING_MOVES = ['down', 'right', 'down', 'left', 'up', 'up', 'right', 'right']

describe('tool-game registration', () => {
  it('registers game_play and game_list with the stable model-facing descriptions', async () => {
    const { ctx } = await mountTools()
    const names = ctx.tools.schemas().map(schema => schema.name)
    expect(names).toContain('game_play')
    expect(names).toContain('game_list')
    const play = ctx.tools.schemas().find(schema => schema.name === 'game_play')
    expect(play?.description).toContain('Play one registered game with a scripted input sequence')
  })

  it('unregisters the tools when the contributing fiber is disposed (HMR safety)', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(GameRuntime)
    const fiber = await ctx.plugin(mountToolGamePlugin())
    expect(ctx.tools.schemas().map(schema => schema.name)).toContain('game_play')
    await fiber.dispose()
    expect(ctx.tools.schemas().map(schema => schema.name)).not.toContain('game_play')
    await ctx.fiber.dispose()
  })

  it('registers only the enabled tools', async () => {
    const onlyList = await mountTools({ play: false })
    const onlyListNames = onlyList.ctx.tools.schemas().map(schema => schema.name)
    expect(onlyListNames).toContain('game_list')
    expect(onlyListNames).not.toContain('game_play')

    const onlyPlay = await mountTools({ list: false })
    const onlyPlayNames = onlyPlay.ctx.tools.schemas().map(schema => schema.name)
    expect(onlyPlayNames).toContain('game_play')
    expect(onlyPlayNames).not.toContain('game_list')
  })

  it('rejects a non-positive or non-integer playTimeoutMs at load', async () => {
    for (const playTimeoutMs of [0, -5, 1.5]) {
      const ctx = new Context()
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(GameRuntime)
      await expect(ctx.plugin(mountToolGamePlugin(), { playTimeoutMs }))
        .rejects.toThrow('tool-game: playTimeoutMs must be a positive integer')
      await ctx.fiber.dispose()
    }
  })
})

describe('game tools execution', () => {
  it('game_list returns the registered game ids', async () => {
    const { ctx, agent } = await mountTools()
    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('list'),
      name: 'game_list',
      arguments: {},
      agent,
    })
    expect(result.isError).toBe(false)
    expect(resultText(result)).toBe('Registered games:\n- coin-chase\n- gold-run')
  })

  it('game_play runs a winning sequence and renders the score', async () => {
    const { ctx, agent } = await mountTools()
    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('play'),
      name: 'game_play',
      arguments: { game: 'coin-chase', inputs: WINNING_MOVES },
      agent,
    })
    expect(result.isError).toBe(false)
    const text = resultText(result)
    expect(text).toContain('score 30')
    expect(text).toContain('the run reached its terminal condition')
  })

  it('game_play reports an unknown game as a structured tool error', async () => {
    const { ctx, agent } = await mountTools()
    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('missing'),
      name: 'game_play',
      arguments: { game: 'missing', inputs: [] },
      agent,
    })
    expect(result.isError).toBe(true)
    expect(resultText(result)).toContain('game module "missing" is not registered')
  })

  it('game_play rejects a blank game id', async () => {
    const { ctx, agent } = await mountTools()
    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('blank'),
      name: 'game_play',
      arguments: { game: '   ', inputs: [] },
      agent,
    })
    expect(result.isError).toBe(true)
    expect(resultText(result)).toContain('game must be a non-empty string')
  })
})

describe('game tool formatters', () => {
  it('parseGamePlayArgs rejects a blank game and copies the input list', () => {
    expect(() => parseGamePlayArgs({ game: ' ', inputs: ['up'] })).toThrow('game must be a non-empty string')
    const parsed = parseGamePlayArgs({ game: 'coin-chase', inputs: ['up'] })
    expect(parsed).toEqual({ game: 'coin-chase', inputs: ['up'] })
  })

  it('formatGamePlayResult renders done and not-done outcomes', () => {
    const done = formatGamePlayResult({ game: 'coin-chase', steps: 1, score: 10, done: true, state: { player: [0, 0] } })
    expect(done).toContain('1 input applied, score 10')
    expect(done).toContain('reached its terminal condition')
    expect(done).toContain('{"player":[0,0]}')

    const pending = formatGamePlayResult({ game: 'coin-chase', steps: 2, score: 0, done: false, state: {} })
    expect(pending).toContain('2 inputs applied, score 0')
    expect(pending).toContain('stopped before its terminal condition')
  })

  it('formatGameList renders a populated and an empty list', () => {
    expect(formatGameList({ games: ['coin-chase', 'pong'] })).toBe('Registered games:\n- coin-chase\n- pong')
    expect(formatGameList({ games: [] })).toBe('No games registered.')
  })
})
