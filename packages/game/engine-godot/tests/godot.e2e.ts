import { access } from 'node:fs/promises'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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

/** A real Godot is optional: the e2e self-skips when no engine is installed. */
async function godotAvailable(): Promise<boolean> {
  try {
    await access('/usr/local/bin/godot')
    return true
  } catch {
    return false
  }
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

describe.skipIf(!(await godotAvailable()))('engine-godot with a real engine', () => {
  it('traces the shipped runner project and replays it through the seam', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-engine-godot-real-'))
    // A minimal project whose runner prints one trace line per scripted input.
    await writeFile(join(root, 'project.godot'), '')
    await writeFile(join(root, 'runner.gd'), `extends SceneTree

func _init() -> void:
	var inputs: Array = JSON.parse_string(OS.get_cmdline_user_args().back())
	for i in inputs.size():
		var step: int = i + 1
		print(JSON.stringify({"state": {"step": step}, "score": 10 * step, "done": step == inputs.size()}))
	quit()
`)

    const ctx = new Context()
    context = ctx
    await ctx.plugin(GameRuntime)
    await ctx.plugin(LocalSubprocessRuntime)
    await ctx.plugin(mountEnginePlugin(), {
      godotPath: '/usr/local/bin/godot',
      scenarios: [{ id: 'real-trace', projectDir: root, runner: 'res://runner.gd', inputs: ['a', 'b'] }],
    })

    const result = ctx.game.play({ game: 'real-trace', inputs: ['a', 'b'] })
    expect(result).toMatchObject({ steps: 2, score: 20, done: true })
  }, 60_000)
})
