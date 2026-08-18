/**
 * Godot-headless trace runs: spawn the engine once per scenario, harvest the
 * NDJSON trace from stdout, and fail loud on engine or protocol errors.
 * @module @deepseek-ai/dsh-engine-godot/godot
 */

import type { Context } from '@deepseek-ai/cordis'
import { parseTraceGame } from './trace.ts'
import type { TraceGame } from './trace.ts'
import type { JsonValue } from '@deepseek-ai/dsh-session'

/** One engine scenario the provider turns into a registered game module. */
export interface GodotScenario {
  /** Stable game id the produced module registers under. */
  readonly id: string
  /** Godot project directory (`--path`). */
  readonly projectDir: string
  /** Runner script inside the project (`--script`, e.g. `res://runner.gd`). */
  readonly runner: string
  /** The fixed scripted input sequence the runner replays. */
  readonly inputs: JsonValue[]
}

/**
 * Spawn one Godot-headless trace run and parse its NDJSON stdout.
 * @param ctx - Cordis context carrying the subprocess seam.
 * @param godotPath - the Godot executable.
 * @param scenario - the scenario to trace.
 * @param graceMs - terminate escalation grace for the engine process.
 * @returns the validated trace; throws on spawn, exit, or protocol failure.
 */
export async function runGodotTrace(ctx: Context, godotPath: string, scenario: GodotScenario, graceMs: number): Promise<TraceGame> {
  const handle = ctx.subprocess.spawn({
    argv: [godotPath, '--headless', '--path', scenario.projectDir, '--script', scenario.runner, JSON.stringify(scenario.inputs)],
    cwd: scenario.projectDir,
    stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
    graceMs,
  })
  const chunks: Buffer[] = []
  const stdout = handle.stdout
  /* v8 ignore next -- stdout:'pipe' always yields a Readable per the subprocess seam contract;
     the guard is defensive against a nonconforming implementation. */
  if (stdout === undefined) throw new Error('engine-godot: subprocess seam returned no stdout pipe')
  for await (const chunk of stdout) {
    chunks.push(chunk as Buffer)
  }
  const outcome = await handle.done
  if (outcome.exitCode !== 0) {
    throw new Error(`engine-godot: godot exited with code ${String(outcome.exitCode)} for scenario "${scenario.id}"`)
  }
  return parseTraceGame(scenario.id, Buffer.concat(chunks).toString('utf8'))
}
