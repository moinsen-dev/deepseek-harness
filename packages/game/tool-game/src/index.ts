/**
 * Model-facing `game_play` and `game_list` tools over `ctx.game`. This package
 * owns schemas, validation, formatting, and the cooperative timeout budget,
 * never concrete games. Enablement controls tool registration; an enabled tool
 * remains visible when no game matches and fails with a structured error at
 * execution time.
 * @module @deepseek-ai/dsh-tool-game
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-game'
import { applyGamePlayTool } from './play.ts'
import { applyGameListTool } from './list.ts'

export { applyGamePlayTool, formatGamePlayResult, parseGamePlayArgs } from './play.ts'
export type { GamePlayValue } from './play.ts'
export { applyGameListTool, formatGameList } from './list.ts'
export type { GameListValue } from './list.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-game'

/** Services required by the game tool suite. */
export const inject = ['tools', 'game']

/** Default cooperative tool-call timeout budget (ms) for `game_play`. */
export const DEFAULT_PLAY_TIMEOUT_MS = 30_000

/** Plugin config: which game tools to register and the `game_play` timeout budget. */
export interface Config {
  /** Register `game_play`. Defaults to true. */
  play?: boolean
  /** Register `game_list`. Defaults to true. */
  list?: boolean
  /** Cooperative timeout budget (ms) for `game_play`. Defaults to 30000. */
  playTimeoutMs?: number
}

export const Config: z<Config> = z.object({
  play: z.boolean().default(true),
  list: z.boolean().default(true),
  playTimeoutMs: z.number().default(DEFAULT_PLAY_TIMEOUT_MS),
})

/** Complete config after schemastery applies every field default. */
type ResolvedConfig = Required<Config>

/** The configured timeout budget must be a positive integer. */
function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`tool-game: ${name} must be a positive integer`)
  }
}

/**
 * Register the enabled game tools. `play`/`list` default to true. The
 * `game_play` cooperative timeout budget is resolved here and attached to the
 * tool as `ToolDefinition.timeoutMs`; the tools' disposers are fiber-scoped,
 * so no manual teardown is needed.
 * @param ctx - Cordis context carrying the tool registry and game seam.
 * @param config - tool enablement and the timeout budget.
 */
export function apply(ctx: Context, config: Config): void {
  // schemastery (Config) has already filled every defaulted field.
  const resolved = config as ResolvedConfig
  assertPositiveInteger('playTimeoutMs', resolved.playTimeoutMs)
  if (resolved.play) {
    applyGamePlayTool(ctx, resolved.playTimeoutMs)
  }
  if (resolved.list) applyGameListTool(ctx)
}
