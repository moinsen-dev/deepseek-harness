/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-engine-godot`.
 * @module @deepseek-ai/dsh-engine-godot/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-engine-godot'

/** Cordis companion plugin name. */
export const name = 'engine-godot-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: trace validation happens at parse time, module
 * registration is guarded by the game seam's duplicate-id check, and this
 * package publishes no independent event sequence or mutable data relation.
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
