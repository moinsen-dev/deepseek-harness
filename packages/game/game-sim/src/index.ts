/**
 * `@deepseek-ai/dsh-game-sim`: registers the built-in deterministic `coin-chase`
 * and `gold-run` games with `ctx.game`. A function/namespace plugin (NOT a
 * default-export service): it registers INTO the seam's module registry.
 * @module @deepseek-ai/dsh-game-sim
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-game'
import { CoinChaseModule } from './coin-chase.ts'
import { GoldRunModule } from './gold-run.ts'

export { COIN_CHASE_GRID_SIZE, COIN_CHASE_ID, COIN_CHASE_MOVES, COIN_SCORE, CoinChase, CoinChaseModule } from './coin-chase.ts'
export type { CoinChaseState } from './coin-chase.ts'
export { GOLD_COIN_SCORE, GOLD_RUN_GRID_SIZE, GOLD_RUN_ID, GOLD_RUN_MOVES, GoldRun, GoldRunModule } from './gold-run.ts'
export type { GoldRunState } from './gold-run.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'game-sim'

/** The game seam this provider registers into. */
export const inject = ['game']

/**
 * Register the built-in simulation games.
 * @param ctx - Cordis context carrying the game seam.
 */
export function apply(ctx: Context): void {
  ctx.game.registerModule(new CoinChaseModule())
  ctx.game.registerModule(new GoldRunModule())
}
