// Real-composition proof: the gauntlet tool boots from a cordis.yml through the
// real Loader and scores a round end to end against the game seam.
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
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

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

function agent(ctx: Context): Agent {
  const scope = ctx.plugin(() => {})
  const id = SessionId('gauntlet-loader-agent')
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
}

function resultText(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(block => block.type === 'text').map(block => block.text).join('')
}

/** Boot a fixed cordis.yml carrying the whole game stack through the real Loader. */
async function boot(): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'dsh-gauntlet-loader-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@deepseek-ai/dsh-session'",
    "- name: '@deepseek-ai/dsh-agent'",
    "- name: '@deepseek-ai/dsh-system-prompt'",
    "- name: '@deepseek-ai/dsh-tools'",
    "- name: '@deepseek-ai/dsh-game'",
    "- name: '@deepseek-ai/dsh-game-sim'",
    "- name: '@deepseek-ai/dsh-game-gauntlet'",
    "- name: '@deepseek-ai/dsh-tool-gauntlet'",
    '',
  ].join('\n'))

  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-session', SessionStore],
    ['@deepseek-ai/dsh-agent', AgentRegistry],
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
    ['@deepseek-ai/dsh-game', GameRuntime],
    ['@deepseek-ai/dsh-game-sim', GameSim],
    ['@deepseek-ai/dsh-game-gauntlet', GauntletRuntime],
    ['@deepseek-ai/dsh-tool-gauntlet', ToolGauntlet],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  return ctx
}

describe('tool-gauntlet real Loader composition through cordis.yml', () => {
  it('boots the stack, registers the tool, and scores a passing round end to end', async () => {
    const ctx = await boot()
    expect(ctx.tools.schemas().map(schema => schema.name)).toContain('gauntlet_round')

    const owner = agent(ctx)
    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('loader-round'),
      name: 'gauntlet_round',
      arguments: {
        scenarioId: 'collect-all',
        game: 'coin-chase',
        inputs: ['down', 'right', 'down', 'left', 'up', 'up', 'right', 'right'],
        bar: 30,
      },
      agent: owner,
    })
    expect(result.isError).toBe(false)
    expect(resultText(result)).toContain('score 30 against bar 30 — PASSED.')
    expect(owner.session.events.filter(event => event.type === 'gauntlet/round')).toHaveLength(1)
  }, 30_000)
})
