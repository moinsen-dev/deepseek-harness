// Real-composition proof: the Godot provider boots from a cordis.yml through
// the real Loader and registers the traced module behind the game seam.
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import GameRuntime from '@deepseek-ai/dsh-game'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import * as EngineGodot from '@deepseek-ai/dsh-engine-godot'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** Boot a cordis.yml carrying the seam, the local subprocess provider, and the Godot provider. */
async function boot(): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'dsh-engine-godot-loader-'))
  const fakeGodot = join(root, 'fake-godot.cjs')
  await writeFile(fakeGodot, `#!/usr/bin/env node
const inputs = JSON.parse(process.argv.at(-1))
for (const [index] of inputs.entries()) {
  const step = index + 1
  process.stdout.write(JSON.stringify({ state: { step }, score: 10 * step, done: step === inputs.length }) + '\\n')
}
`)
  await chmod(fakeGodot, 0o755)
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@deepseek-ai/dsh-game'",
    "- name: '@deepseek-ai/dsh-subprocess-local'",
    "- name: '@deepseek-ai/dsh-engine-godot'",
    '  config:',
    `    godotPath: ${JSON.stringify(fakeGodot)}`,
    '    scenarios:',
    '      - id: trace-game',
    `        projectDir: ${JSON.stringify(root)}`,
    '        runner: res://runner.gd',
    '        inputs: [up, right, down]',
    '',
  ].join('\n'))

  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-game', GameRuntime],
    ['@deepseek-ai/dsh-subprocess-local', LocalSubprocessRuntime],
    ['@deepseek-ai/dsh-engine-godot', EngineGodot],
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

describe('engine-godot real Loader composition through cordis.yml', () => {
  it('traces the scenario through the fake engine and registers the replayable module', async () => {
    const ctx = await boot()
    expect(ctx.game.list().map(module => module.id)).toEqual(['trace-game'])
    const result = ctx.game.play({ game: 'trace-game', inputs: ['up', 'right', 'down'] })
    expect(result).toMatchObject({ steps: 3, score: 30, done: true })
  }, 30_000)
})
