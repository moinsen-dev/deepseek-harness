import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import AgentRegistry, { Inbox } from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import GameRuntime from '@deepseek-ai/dsh-game'
import * as GameSim from '@deepseek-ai/dsh-game-sim'
import * as ToolGameBuild from '@deepseek-ai/dsh-tool-game-build'
import { compileGameModule, formatGameBuildResult, probeDeterminism, toGameFactory } from '@deepseek-ai/dsh-tool-game-build'

const COUNTER_SOURCE = `module.exports.create = () => {
  let n = 0
  return {
    state: () => ({ n }),
    step: () => { n += 1 },
    done: () => n >= 3,
    score: () => n,
  }
}
`

/** A fresh plugin object for the game-sim provider (module exports are read-only). */
function mountGameSimPlugin(): { name: string; inject: string[]; apply: (ctx: Context) => void } {
  return { name: GameSim.name, inject: [...GameSim.inject], apply: (ctx) => { GameSim.apply(ctx) } }
}

/** A fresh plugin object for the build tools (module exports are read-only). */
function mountToolGameBuildPlugin(): {
  name: string
  inject: string[]
  Config: typeof ToolGameBuild.Config
  apply: (ctx: Context, config?: ToolGameBuild.Config) => void
} {
  return {
    name: ToolGameBuild.name,
    inject: [...ToolGameBuild.inject],
    Config: ToolGameBuild.Config,
    apply: (ctx, config) => { ToolGameBuild.apply(ctx, config ?? {}) },
  }
}

/** Mount the game seam, the sim provider, the tool registry, and the build tools. */
async function mountTools(config: ToolGameBuild.Config = {}): Promise<{ ctx: Context; agent: Agent }> {
  const ctx = new Context()
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(GameRuntime)
  await ctx.plugin(mountGameSimPlugin())
  await ctx.plugin(mountToolGameBuildPlugin(), config)
  const scope = ctx.plugin(() => {})
  const id = SessionId('tool-game-build-agent')
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

/** The normalized tool outcome fields these tests read. */
interface ToolOutcome {
  isError: boolean
  content: { type: string; text?: string }[]
}

function build(ctx: Context, agent: Agent, args: Record<string, unknown>): Promise<ToolOutcome> {
  return ctx.tools.execute({
    signal: new AbortController().signal,
    callId: CallId(`build-${String(args.id)}`),
    name: 'game_build',
    arguments: args,
    agent,
  })
}

function remove(ctx: Context, agent: Agent, id: string): Promise<ToolOutcome> {
  return ctx.tools.execute({
    signal: new AbortController().signal,
    callId: CallId(`remove-${id}`),
    name: 'game_remove',
    arguments: { id },
    agent,
  })
}

describe('tool-game-build registration', () => {
  it('registers game_build and game_remove with stable descriptions', async () => {
    const { ctx } = await mountTools()
    const names = ctx.tools.schemas().map(schema => schema.name)
    expect(names).toContain('game_build')
    expect(names).toContain('game_remove')
  })

  it('registers nothing when disabled', async () => {
    const { ctx } = await mountTools({ enabled: false })
    const names = ctx.tools.schemas().map(schema => schema.name)
    expect(names).not.toContain('game_build')
    expect(names).not.toContain('game_remove')
  })

  it('unloads every built game when the contributing fiber is disposed (HMR safety)', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(GameRuntime)
    const fiber = await ctx.plugin(mountToolGameBuildPlugin())
    const agent = await (async () => {
      const scope = ctx.plugin(() => {})
      const id = SessionId('hmr-agent')
      const session = Session.create(id)
      const value: Agent = {
        id, options: {}, session, inbox: new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} }),
        status: 'idle', ctx: scope.ctx,
        followup: () => {}, steer: () => {}, inject: () => {}, send: () => {}, cancel() {},
        runMaintenance: task => task(new AbortController().signal),
        whenIdle: () => Promise.resolve(),
      }
      ctx.agents.register(value)
      return value
    })()
    await build(ctx, agent, { id: 'hmr-game', source: COUNTER_SOURCE })
    expect(ctx.game.list().map(module => module.id)).toContain('hmr-game')
    await fiber.dispose()
    expect(ctx.game.list().map(module => module.id)).not.toContain('hmr-game')
    await ctx.fiber.dispose()
  })
})

describe('game_build execution', () => {
  it('builds a deterministic game, registers it, and reports the probe outcome', async () => {
    const { ctx, agent } = await mountTools()
    const result = await build(ctx, agent, { id: 'counter', source: COUNTER_SOURCE })
    expect(result.isError).toBe(false)
    expect(ctx.game.list().map(module => module.id)).toContain('counter')

    const played = ctx.game.play({ game: 'counter', inputs: ['up', 'down', 'left'] })
    expect(played).toMatchObject({ steps: 3, score: 3, done: true })
  })

  it('replaces a previous build with the same id', async () => {
    const { ctx, agent } = await mountTools()
    await build(ctx, agent, { id: 'twice', source: COUNTER_SOURCE })
    const doubled = `module.exports.create = () => {
  let n = 0
  return {
    state: () => ({ n }),
    step: () => { n += 2 },
    done: () => n >= 4,
    score: () => n,
  }
}
`
    const result = await build(ctx, agent, { id: 'twice', source: doubled })
    expect(result.isError).toBe(false)
    const played = ctx.game.play({ game: 'twice', inputs: ['a', 'b'] })
    expect(played).toMatchObject({ score: 4, done: true })
  })

  it('game_remove unloads a built game and rejects unknown ids', async () => {
    const { ctx, agent } = await mountTools()
    await build(ctx, agent, { id: 'gone', source: COUNTER_SOURCE })

    const removed = await remove(ctx, agent, 'gone')
    expect(removed.isError).toBe(false)
    expect(ctx.game.list().map(module => module.id)).not.toContain('gone')

    const again = await remove(ctx, agent, 'gone')
    expect(again.isError).toBe(true)
    expect(resultText(again)).toContain('no built game "gone" is registered by game_build')
  })

  it('rejects a blank id and reports the tool name', async () => {
    const { ctx, agent } = await mountTools()
    const blank = await build(ctx, agent, { id: '   ', source: COUNTER_SOURCE })
    expect(blank.isError).toBe(true)
    expect(resultText(blank)).toContain('game_build: id must be a non-empty string')
  })

  it('rejects unparseable, contract-breaking, and non-deterministic sources', async () => {
    const { ctx, agent } = await mountTools()

    const syntax = await build(ctx, agent, { id: 'bad-syntax', source: 'module.exports.create = ( =>' })
    expect(syntax.isError).toBe(true)
    expect(resultText(syntax)).toContain('failed to parse')

    const noFactory = await build(ctx, agent, { id: 'no-factory', source: 'module.exports = {}' })
    expect(noFactory.isError).toBe(true)
    expect(resultText(noFactory)).toContain('must export a create() factory')

    const badInstance = await build(ctx, agent, { id: 'bad-instance', source: 'module.exports.create = () => 42' })
    expect(badInstance.isError).toBe(true)
    expect(resultText(badInstance)).toContain('must return a game instance object')

    const missingMethods = await build(ctx, agent, { id: 'missing-methods', source: 'module.exports.create = () => ({})' })
    expect(missingMethods.isError).toBe(true)
    expect(resultText(missingMethods)).toContain('must implement step(), state(), done(), and score()')

    const random = await build(ctx, agent, { id: 'random', source: 'module.exports.create = () => ({ state: () => ({ r: Math.random() }), step: () => {}, done: () => false, score: () => 0 })' })
    expect(random.isError).toBe(true)
    expect(resultText(random)).toContain('not deterministic')
  })

  it('rejects non-JSON state and non-finite scores during the probe', async () => {
    const { ctx, agent } = await mountTools()

    const badState = await build(ctx, agent, { id: 'bad-state', source: 'module.exports.create = () => ({ state: () => ({ f: () => {} }), step: () => {}, done: () => false, score: () => 0 })' })
    expect(badState.isError).toBe(true)
    expect(resultText(badState)).toContain('not lossless JSON')

    const badScore = await build(ctx, agent, { id: 'bad-score', source: 'module.exports.create = () => ({ state: () => ({}), step: () => {}, done: () => false, score: () => Number.NaN })' })
    expect(badScore.isError).toBe(true)
    expect(resultText(badScore)).toContain('finite number')
  })

  it('stops the probe at the terminal condition', async () => {
    const { ctx, agent } = await mountTools()
    await build(ctx, agent, { id: 'terminal', source: COUNTER_SOURCE })
    const result = ctx.game.play({ game: 'terminal', inputs: ['a', 'b', 'c'] })
    expect(result.done).toBe(true)
  })
})

describe('tool-game-build formatters and helpers', () => {
  it('formatGameBuildResult renders done and not-done probe outcomes', () => {
    expect(formatGameBuildResult({ id: 'counter', probeSteps: 3, probeScore: 3, probeDone: true }))
      .toContain('Built `counter`: probe applied 3 input(s), score 3 (the probe reached its terminal condition).')
    expect(formatGameBuildResult({ id: 'open', probeSteps: 4, probeScore: 1, probeDone: false }))
      .toContain('(the probe did not finish)')
  })

  it('compileGameModule and toGameFactory reject malformed sources directly', () => {
    expect(() => compileGameModule('(broken')).toThrow('failed to parse')
    expect(() => toGameFactory(null)).toThrow('must export a create() factory')
    expect(() => toGameFactory({ create: 'not a function' })).toThrow('must export a create() factory')
  })

  it('probeDeterminism rejects divergent runs directly', () => {
    const factory = toGameFactory(compileGameModule('module.exports.create = () => ({ state: () => ({ r: Math.random() }), step: () => {}, done: () => false, score: () => 0 })'))
    expect(() => probeDeterminism(factory, ['a', 'b'])).toThrow('not deterministic')
  })
})
