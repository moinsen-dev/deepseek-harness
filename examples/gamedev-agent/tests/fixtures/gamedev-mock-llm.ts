import type { Context } from '@deepseek-ai/cordis'
import {
  CallId,
  LlmAdapter,
  ReasoningEffortId,
  type GenerateOptions,
  type LlmResolvedModelInfo,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'

const HIGH = ReasoningEffortId('high')
const OFF = ReasoningEffortId('off')

const LOSING_MOVES = ['up']
const WINNING_MOVES = ['down', 'right', 'down', 'left', 'up', 'up', 'right', 'right']

/** Keyless gamedev-agent adapter: two game_play calls (fail, then pass) followed by a final answer. */
class GamedevMockAdapter extends LlmAdapter {
  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return {
      provider,
      id: model,
      name: model,
      reasoning: {
        efforts: [
          { id: OFF, name: 'Off' },
          { id: HIGH, name: 'High' },
        ],
        defaultEffort: HIGH,
      },
    }
  }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    if (process.env.DSH_GAMEDEV_MOCK_FAILURE === '1') {
      yield { type: 'finish', reason: { kind: 'error', failure: { code: 'SERVER', message: 'GAMEDEV mock provider failed' } } }
      return
    }
    const toolResults = options.messages.flatMap(message => message.content.filter(block => block.type === 'tool-result'))
    if (toolResults.length === 0) {
      yield* this.toolCall(CallId('gamedev-call-lose'), LOSING_MOVES)
      return
    }
    if (toolResults.length === 1) {
      yield* this.toolCall(CallId('gamedev-call-win'), WINNING_MOVES)
      return
    }

    const lastText = toolResults
      .flatMap(block => block.content.filter(inner => inner.type === 'text'))
      .map(inner => inner.text)
      .join('')
    const reply = `GAMEDEV tool round trip complete: ${lastText.trim()}`
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: reply }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: reply } }
    yield { type: 'usage', usage: { inputTokens: 7, outputTokens: 5, reasoningTokens: 1 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }

  private async * toolCall(id: ReturnType<typeof CallId>, inputs: readonly string[]): AsyncIterable<StreamChunk> {
    const args = JSON.stringify({ game: 'coin-chase', inputs })
    yield { type: 'block-start', index: 0, blockType: 'tool-call' }
    yield { type: 'tool-call-delta', index: 0, id, name: 'game_play', argumentsDelta: args }
    yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'game_play', arguments: args } }
    yield { type: 'usage', usage: { inputTokens: 11, outputTokens: 3, cacheReadTokens: 2 } }
    yield { type: 'finish', reason: { kind: 'tool-calls' } }
  }
}

export const name = 'gamedev-mock-llm'
export const inject = ['llm']

/** Register the keyless `gamedev-mock` adapter. */
export function apply(ctx: Context): void {
  ctx.llm.registerAdapter(['gamedev-mock'], new GamedevMockAdapter())
}
