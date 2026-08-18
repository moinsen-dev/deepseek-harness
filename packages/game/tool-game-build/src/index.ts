/**
 * Model-facing game authoring tools: `game_build` compiles a plain-JavaScript
 * game source in a vm sandbox, proves it deterministic, and registers it live
 * with `ctx.game`; `game_remove` unloads a game this tool built. Rebuilding an
 * id replaces the previous build; unloading this plugin disposes every build.
 * @module @deepseek-ai/dsh-tool-game-build
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-game'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { compileGameModule, probeDeterminism, toGameFactory } from './build.ts'
import type { GameBuildProbe } from './build.ts'

export { compileGameModule, probeDeterminism, toGameFactory } from './build.ts'
export type { GameBuildProbe } from './build.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-game-build'

/** Services required by the game authoring tools. */
export const inject = ['tools', 'game']

/** The default probe sequence every new game must replay deterministically. */
export const DEFAULT_PROBE = ['up', 'down', 'left', 'right'] as const

/** Plugin config: tool enablement and the determinism probe sequence. */
export interface Config {
  /** Register `game_build` and `game_remove`. Defaults to true. */
  enabled?: boolean
  /** Scripted inputs the determinism probe plays twice. Defaults to the four moves. */
  probe?: string[]
}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  probe: z.array(z.string()).default([...DEFAULT_PROBE]),
})

/** Complete config after schemastery applies every field default. */
type ResolvedConfig = Required<Config>

/** The canonical `game_build` value: the registered id plus the probe outcome. */
export interface GameBuildValue {
  /** The game id that was registered. */
  readonly id: string
  /** Number of probe inputs applied. */
  readonly probeSteps: number
  /** Probe score. */
  readonly probeScore: number
  /** Whether the probe reached the terminal condition. */
  readonly probeDone: boolean
}

/** The canonical `game_remove` value. */
export interface GameRemoveValue {
  /** The game id that was unloaded. */
  readonly id: string
  /** Always true for a successful removal. */
  readonly removed: boolean
}

/** Validate value constraints the schema DSL cannot express: a non-blank id. */
function assertNonBlankId(id: string, tool: 'game_build' | 'game_remove'): void {
  if (id.trim().length === 0) throw new Error(`${tool}: id must be a non-empty string`)
}

/**
 * Format one build outcome as a single model-facing text block.
 * @param value - the canonical `game_build` value.
 * @returns the rendered build summary.
 */
export function formatGameBuildResult(value: GameBuildValue): string {
  const done = value.probeDone ? 'the probe reached its terminal condition' : 'the probe did not finish'
  return `Built \`${value.id}\`: probe applied ${value.probeSteps} input(s), score ${value.probeScore} (${done}). `
    + 'The game is registered — play it with game_play and score rounds with gauntlet_round.'
}

/**
 * Register the game authoring tools with `ctx.tools`. Builds are owned by this
 * plugin: rebuilding an id replaces the previous build, `game_remove` unloads
 * builds, and disposing this plugin unloads every build it owns.
 * @param ctx - Cordis context carrying the tool registry and game seam.
 * @param config - tool enablement and the probe sequence.
 */
export function apply(ctx: Context, config: Config): void {
  // schemastery (Config) has already filled every defaulted field.
  const resolved = config as ResolvedConfig
  if (!resolved.enabled) return
  const probe = [...resolved.probe]
  const built = new Map<string, () => void>()

  ctx.tools.register(defineTool({
    name: 'game_build',
    description: 'Build a new game from plain JavaScript source and register it live: the source must set '
      + 'module.exports.create to a factory returning { step(input), state(), done(), score() }. The tool compiles it '
      + 'in a sandbox, proves determinism by playing the probe inputs twice (both runs must agree after every input), '
      + 'and reports the probe outcome. Rebuilding an existing id replaces the previous build.',
    parameters: {
      id: { type: 'string', required: true, description: 'Stable game id for the new game; rebuilding it replaces the previous build.' },
      source: { type: 'string', required: true, description: 'Plain JavaScript module body setting module.exports.create; no TypeScript annotations.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true },
          probeSteps: { type: 'number', required: true },
          probeScore: { type: 'number', required: true },
          probeDone: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatGameBuildResult(value) }],
    },
    execute(args) {
      assertNonBlankId(args.id, 'game_build')
      const exports = compileGameModule(args.source)
      const factory = toGameFactory(exports)
      const probeOutcome: GameBuildProbe = probeDeterminism(factory, probe)
      const existing = built.get(args.id)
      if (existing !== undefined) {
        existing()
        built.delete(args.id)
      }
      const dispose = ctx.game.registerModule({ id: args.id, create: factory })
      built.set(args.id, dispose)
      return Promise.resolve({
        id: args.id,
        probeSteps: probeOutcome.steps,
        probeScore: probeOutcome.score,
        probeDone: probeOutcome.done,
      })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'game_remove',
    description: 'Unload a game that game_build registered. Built-in games and games from other providers are not removable.',
    parameters: {
      id: { type: 'string', required: true, description: 'Stable game id of a game this session built with game_build.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true },
          removed: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `Removed \`${value.id}\` — it is no longer playable.` }],
    },
    execute(args) {
      assertNonBlankId(args.id, 'game_remove')
      const dispose = built.get(args.id)
      if (dispose === undefined) {
        throw new Error(`no built game "${args.id}" is registered by game_build`)
      }
      dispose()
      built.delete(args.id)
      return Promise.resolve({ id: args.id, removed: true })
    },
  }))

  ctx.effect(() => () => {
    for (const dispose of built.values()) dispose()
    built.clear()
  }, 'tool-game-build.disposeBuilds()')
}
