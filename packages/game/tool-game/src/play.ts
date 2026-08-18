/**
 * The model-facing `game_play` tool: run one registered game with a scripted
 * input sequence through `ctx.game`. This module owns only the model-facing
 * schema, argument validation, result formatting, and the cooperative timeout
 * budget, never the games themselves.
 * @module @deepseek-ai/dsh-tool-game/play
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-session'

/** The canonical `game_play` value: the seam's playtest outcome, verbatim. */
export interface GamePlayValue {
  /** The game id that was played. */
  readonly game: string
  /** Number of inputs actually applied. */
  readonly steps: number
  /** Final objective score. */
  readonly score: number
  /** Whether the run reached its terminal condition. */
  readonly done: boolean
  /** Final observable state. */
  readonly state: JsonValue
}

/**
 * Validate value constraints the schema DSL cannot express: a non-blank
 * `game`. Throws a plain `Error` otherwise.
 * @param args - the schema-validated `game_play` arguments.
 * @returns the accepted arguments, passed through unchanged.
 */
export function parseGamePlayArgs(args: { game: string; inputs: string[] }): { game: string; inputs: string[] } {
  if (args.game.trim().length === 0) throw new Error('game must be a non-empty string')
  return { game: args.game, inputs: [...args.inputs] }
}

/**
 * Format a playtest outcome as one model-facing text block: steps applied,
 * score, terminal condition, and the final state.
 * @param value - the canonical `game_play` value.
 * @returns the rendered summary plus the final state as JSON.
 */
export function formatGamePlayResult(value: GamePlayValue): string {
  const done = value.done
    ? 'the run reached its terminal condition'
    : 'the run stopped before its terminal condition — extend the inputs or change them'
  const lines = [
    `Played \`${value.game}\`: ${value.steps} ${value.steps === 1 ? 'input' : 'inputs'} applied, score ${value.score} (${done}).`,
    'Final state:',
    '```json',
    JSON.stringify(value.state),
    '```',
  ]
  return lines.join('\n')
}

/**
 * Register the `game_play` tool with `ctx.tools`.
 * @param ctx - Cordis context carrying the tool registry and game seam.
 * @param timeoutMs - cooperative timeout budget attached to the tool.
 */
export function applyGamePlayTool(ctx: Context, timeoutMs: number): void {
  ctx.tools.register(defineTool({
    name: 'game_play',
    description: 'Play one registered game with a scripted input sequence and observe the deterministic outcome: '
      + 'steps applied, final state, objective score, and whether the run reached its terminal condition. '
      + 'Use it to verify game behavior after edits — the same input sequence with the same game code always '
      + 'yields the same result.',
    parameters: {
      game: { type: 'string', required: true, description: 'Registered game id to play (see game_list).' },
      inputs: {
        type: 'array',
        items: { type: 'string' },
        required: true,
        description: 'Scripted inputs applied in order until the run is done or the list ends, for example ["up", "right"].',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          game: { type: 'string', required: true },
          steps: { type: 'number', required: true },
          score: { type: 'number', required: true },
          done: { type: 'boolean', required: true },
          state: { type: 'json', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatGamePlayResult(value) }],
    },
    timeoutMs,
    execute(args, exec) {
      const { game, inputs } = parseGamePlayArgs(args)
      const result = ctx.game.play({ game, inputs }, exec.signal)
      return Promise.resolve({
        game: result.game,
        steps: result.steps,
        score: result.score,
        done: result.done,
        state: result.state,
      })
    },
  }))
}
