/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-tool-game-build`.
 * @module @deepseek-ai/dsh-tool-game-build/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-tool-game-build'

/** Cordis companion plugin name. */
export const name = 'tool-game-build-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: tool calls and results are logged by the core tool
 * pipeline, built games live in the game seam's private registry with
 * disposal proven by the HMR-safety test, and this package publishes no
 * independent event sequence or mutable data relation.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
