import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
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

/** The fake godot: an executable that prints one NDJSON trace line per scripted input. */
const FAKE_GODOT_SOURCE = `#!/usr/bin/env node
const inputs = JSON.parse(process.argv.at(-1))
for (const [index] of inputs.entries()) {
  const step = index + 1
  const done = step === inputs.length && process.env.FAKE_GODOT_DONE !== '0'
  process.stdout.write(JSON.stringify({ state: { step }, score: 10 * step, done }) + '\\n')
}
`

/** Write the fake godot executable and return its path. */
async function fakeGodot(body: string = FAKE_GODOT_SOURCE): Promise<string> {
  root = await mkdtemp(join(tmpdir(), 'dsh-engine-godot-'))
  const bin = join(root, 'fake-godot.cjs')
  await writeFile(bin, body)
  await chmod(bin, 0o755)
  return bin
}

/** A fresh plugin object for the Godot provider (module exports are read-only). */
function mountEnginePlugin(): {
  name: string
  inject: string[]
  Config: typeof EngineGodot.Config
  apply: (ctx: Context, config?: EngineGodot.Config) => Promise<void>
} {
  return {
    name: EngineGodot.name,
    inject: [...EngineGodot.inject],
    Config: EngineGodot.Config,
    apply: (ctx, config) => EngineGodot.apply(ctx, config ?? {}),
  }
}

/** Mount the game seam, the local subprocess provider, and the Godot provider. */
async function mountEngine(config: EngineGodot.Config): Promise<Context> {
  const ctx = new Context()
  context = ctx
  await ctx.plugin(GameRuntime)
  await ctx.plugin(LocalSubprocessRuntime)
  await ctx.plugin(mountEnginePlugin(), config)
  return ctx
}

const SCENARIO_INPUTS = ['up', 'right', 'down']

/** A scenario rooted in the fake-project temp dir (the spawn cwd must exist). */
function scenario(projectDir: string): { id: string; projectDir: string; runner: string; inputs: string[] } {
  return { id: 'trace-game', projectDir, runner: 'res://runner.gd', inputs: SCENARIO_INPUTS }
}

describe('engine-godot provider', () => {
  it('traces each scenario and registers a replayable module', async () => {
    const godot = await fakeGodot()
    const ctx = await mountEngine({ godotPath: godot, scenarios: [scenario(root ?? '')] })

    expect(ctx.game.list().map(module => module.id)).toEqual(['trace-game'])
    const result = ctx.game.play({ game: 'trace-game', inputs: SCENARIO_INPUTS })
    expect(result).toMatchObject({ steps: 3, score: 30, done: true })
    expect(result.state).toEqual({ step: 3 })
  })

  it('registers nothing with an empty scenario list', async () => {
    const godot = await fakeGodot()
    const ctx = await mountEngine({ godotPath: godot })
    expect(ctx.game.list()).toHaveLength(0)
  })

  it('replays a prefix when fewer inputs are applied', async () => {
    const godot = await fakeGodot()
    const ctx = await mountEngine({ godotPath: godot, scenarios: [scenario(root ?? '')] })
    const result = ctx.game.play({ game: 'trace-game', inputs: ['up'] })
    expect(result).toMatchObject({ steps: 1, score: 10, done: false })
  })

  it('fails its load when the engine exits non-zero', async () => {
    const godot = await fakeGodot('#!/usr/bin/env node\nprocess.exit(3)\n')
    const ctx = new Context()
    context = ctx
    await ctx.plugin(GameRuntime)
    await ctx.plugin(LocalSubprocessRuntime)
    await expect(ctx.plugin(mountEnginePlugin(), { godotPath: godot, scenarios: [scenario(root ?? '')] })).rejects.toThrow('godot exited with code 3')
  })

  it('fails its load on a malformed trace', async () => {
    const godot = await fakeGodot('#!/usr/bin/env node\nprocess.stdout.write(\'not json\\n\')\n')
    const ctx = new Context()
    context = ctx
    await ctx.plugin(GameRuntime)
    await ctx.plugin(LocalSubprocessRuntime)
    await expect(ctx.plugin(mountEnginePlugin(), { godotPath: godot, scenarios: [scenario(root ?? '')] })).rejects.toThrow('line 1 is not valid JSON')
  })

  it('rejects an invalid graceMs at load', async () => {
    const ctx = new Context()
    context = ctx
    await ctx.plugin(GameRuntime)
    await ctx.plugin(LocalSubprocessRuntime)
    await expect(ctx.plugin(mountEnginePlugin(), { graceMs: 0 })).rejects.toThrow('engine-godot: graceMs must be a positive integer')
  })
})
