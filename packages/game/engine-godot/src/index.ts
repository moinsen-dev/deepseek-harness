/**
 * `@deepseek-ai/dsh-engine-godot`: runs each configured scenario once through
 * Godot headless and registers the deterministic NDJSON trace with `ctx.game`
 * as a playable game module. Engine-backed games reach the model through the
 * existing play/gauntlet consumers without a live engine per step.
 * @module @deepseek-ai/dsh-engine-godot
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-game'
import type {} from '@deepseek-ai/dsh-subprocess'
import { TraceGameModule } from './trace.ts'
import { runGodotTrace } from './godot.ts'
import type { GodotScenario } from './godot.ts'

export { TraceGameInstance, TraceGameModule, parseTraceGame } from './trace.ts'
export type { TraceEntry, TraceGame } from './trace.ts'
export { runGodotTrace } from './godot.ts'
export type { GodotScenario } from './godot.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'engine-godot'

/** Services required by the Godot trace provider. */
export const inject = ['game', 'subprocess']

/** Default Godot executable name resolved from the deployment environment. */
export const DEFAULT_GODOT_PATH = 'godot'

/** Default terminate-escalation grace for one engine trace run. */
export const DEFAULT_GRACE_MS = 30_000

/** Plugin config: the engine executable, the grace period, and the scenarios to trace. */
export interface Config {
  /** Godot executable. Defaults to `godot` on PATH. */
  godotPath?: string
  /** Terminate-escalation grace (ms) for one engine run. Defaults to 30000. */
  graceMs?: number
  /** Engine scenarios to trace and register; an empty list registers nothing. */
  scenarios?: GodotScenario[]
}

export const Config: z<Config> = z.object({
  godotPath: z.string().default(DEFAULT_GODOT_PATH),
  graceMs: z.number().default(DEFAULT_GRACE_MS),
  scenarios: z.array(z.object({
    id: z.string(),
    projectDir: z.string(),
    runner: z.string(),
    inputs: z.array(z.any()),
  })).default([]),
})

/** Complete config after schemastery applies every field default. */
type ResolvedConfig = Required<Config>

/** The grace period must be a positive integer. */
function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`engine-godot: ${name} must be a positive integer`)
  }
}

/**
 * Trace every configured scenario and register the resulting modules. A
 * missing engine, non-zero exit, or malformed trace fails this plugin's load —
 * the seam then never sees a half-registered scenario set.
 * @param ctx - Cordis context carrying the game and subprocess seams.
 * @param config - engine path, grace, and the scenario list.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  // schemastery (Config) has already filled every defaulted field.
  const resolved = config as ResolvedConfig
  assertPositiveInteger('graceMs', resolved.graceMs)
  const traces = await Promise.all(resolved.scenarios.map(
    async scenario => runGodotTrace(ctx, resolved.godotPath, scenario, resolved.graceMs),
  ))
  for (const trace of traces) {
    ctx.game.registerModule(new TraceGameModule(trace))
  }
}
