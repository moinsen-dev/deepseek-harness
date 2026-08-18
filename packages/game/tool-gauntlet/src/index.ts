/**
 * Model-facing `gauntlet_round` tool over `ctx.gauntlet`. This package owns the
 * schema, validation, formatting, and the cooperative timeout budget — never
 * the scoring, which stays with the gauntlet runtime.
 * @module @deepseek-ai/dsh-tool-gauntlet
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-game-gauntlet'
import { applyGauntletRoundTool } from './round.ts'

export { applyGauntletRoundTool, formatGauntletRoundResult, parseGauntletRoundArgs } from './round.ts'
export type { GauntletRoundValue } from './round.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-gauntlet'

/** Services required by the gauntlet tool. */
export const inject = ['tools', 'gauntlet']

/** Default cooperative tool-call timeout budget (ms) for `gauntlet_round`. */
export const DEFAULT_ROUND_TIMEOUT_MS = 30_000

/** Plugin config: tool enablement and the `gauntlet_round` timeout budget. */
export interface Config {
  /** Register `gauntlet_round`. Defaults to true. */
  enabled?: boolean
  /** Cooperative timeout budget (ms) for `gauntlet_round`. Defaults to 30000. */
  timeoutMs?: number
}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  timeoutMs: z.number().default(DEFAULT_ROUND_TIMEOUT_MS),
})

/** Complete config after schemastery applies every field default. */
type ResolvedConfig = Required<Config>

/** The configured timeout budget must be a positive integer. */
function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`tool-gauntlet: ${name} must be a positive integer`)
  }
}

/**
 * Register the enabled gauntlet tool. The timeout budget is resolved here and
 * attached as `ToolDefinition.timeoutMs`; the tool's disposer is fiber-scoped,
 * so no manual teardown is needed.
 * @param ctx - Cordis context carrying the tool registry and gauntlet runtime.
 * @param config - tool enablement and the timeout budget.
 */
export function apply(ctx: Context, config: Config): void {
  // schemastery (Config) has already filled every defaulted field.
  const resolved = config as ResolvedConfig
  assertPositiveInteger('timeoutMs', resolved.timeoutMs)
  if (resolved.enabled) {
    applyGauntletRoundTool(ctx, resolved.timeoutMs)
  }
}
