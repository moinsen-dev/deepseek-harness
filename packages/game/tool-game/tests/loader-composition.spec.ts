// Real-composition proof: the game tools boot from a cordis.yml through the
// real Loader and play a registered game end to end, so the product wiring —
// not a hand-built context — is what the tool runs against.
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { CallId } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import AgentRegistry, { Inbox } from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import GameRuntime from '@deepseek-ai/dsh-game'
import * as GameSim from '@deepseek-ai/dsh-game-sim'
import * as ToolGame from '@deepseek-ai/dsh-tool-game'

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
  const id = SessionId('game-loader-agent')
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

/** Boot a fixed cordis.yml carrying the whole game seam through the real Loader. */
async function boot(): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'dsh-game-loader-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@deepseek-ai/dsh-agent'",
    "- name: '@deepseek-ai/dsh-system-prompt'",
    "- name: '@deepseek-ai/dsh-tools'",
    "- name: '@deepseek-ai/dsh-game'",
    "- name: '@deepseek-ai/dsh-game-sim'",
    "- name: '@deepseek-ai/dsh-tool-game'",
    '',
  ].join('\n'))

  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-agent', AgentRegistry],
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
    ['@deepseek-ai/dsh-game', GameRuntime],
    ['@deepseek-ai/dsh-game-sim', GameSim],
    ['@deepseek-ai/dsh-tool-game', ToolGame],
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

describe('tool-game real Loader composition through cordis.yml', () => {
  it('boots the seam, registers the tools, and plays coin-chase end to end', async () => {
    const ctx = await boot()
    const names = ctx.tools.schemas().map(schema => schema.name)
    expect(names).toEqual(expect.arrayContaining(['game_play', 'game_list']))
    expect(ctx.game.list().map(module => module.id)).toEqual(['coin-chase', 'gold-run'])

    const owner = agent(ctx)
    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('loader-play'),
      name: 'game_play',
      arguments: { game: 'coin-chase', inputs: ['down', 'right', 'down', 'left', 'up', 'up', 'right', 'right'] },
      agent: owner,
    })
    expect(result.isError).toBe(false)
    expect(resultText(result)).toContain('score 30')
  }, 30_000)
})
