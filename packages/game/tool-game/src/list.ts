/**
 * The model-facing `game_list` tool: discover the registered game ids that
 * `game_play` can run.
 * @module @deepseek-ai/dsh-tool-game/list
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

/** The canonical `game_list` value. */
export interface GameListValue {
  /** Registered game ids, in registration order. */
  readonly games: string[]
}

/**
 * Format a game list as one model-facing text block.
 * @param value - the canonical `game_list` value.
 * @returns the rendered list, or a no-games note.
 */
export function formatGameList(value: GameListValue): string {
  if (value.games.length === 0) return 'No games registered.'
  const lines = value.games.map(game => `- ${game}`)
  return `Registered games:\n${lines.join('\n')}`
}

/**
 * Register the `game_list` tool with `ctx.tools`.
 * @param ctx - Cordis context carrying the tool registry and game seam.
 */
export function applyGameListTool(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'game_list',
    description: 'List the game modules registered in this session, by stable id. Use it to discover which games '
      + 'game_play can run.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          games: { type: 'array', items: { type: 'string' }, required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatGameList(value) }],
    },
    async execute() {
      return Promise.resolve({ games: ctx.game.list().map(module => module.id) })
    },
  }))
}
