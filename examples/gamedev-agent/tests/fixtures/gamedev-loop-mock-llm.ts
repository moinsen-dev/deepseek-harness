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

/** Keyless gamedev-agent loop adapter: one gauntlet_round call followed by a final answer. */
class GamedevLoopMockAdapter extends LlmAdapter {
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
    const toolResults = options.messages.flatMap(message => message.content.filter(block => block.type === 'tool-result'))
    if (toolResults.length === 0) {
      const args = JSON.stringify({ scenarioId: 'collect-all', game: 'coin-chase', inputs: ['up'], bar: 30 })
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id: CallId('gamedev-loop-round'), name: 'gauntlet_round', argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: CallId('gamedev-loop-round'), name: 'gauntlet_round', arguments: args } }
      yield { type: 'usage', usage: { inputTokens: 11, outputTokens: 3, cacheReadTokens: 2 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }

    const lastText = toolResults
      .flatMap(block => block.content.filter(inner => inner.type === 'text'))
      .map(inner => inner.text)
      .join('')
    const reply = `GAMEDEV loop round trip complete: ${lastText.trim()}`
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: reply }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: reply } }
    yield { type: 'usage', usage: { inputTokens: 7, outputTokens: 5, reasoningTokens: 1 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export const name = 'gamedev-loop-mock-llm'
export const inject = ['llm']

/** Register the keyless `gamedev-loop-mock` adapter. */
export function apply(ctx: Context): void {
  ctx.llm.registerAdapter(['gamedev-loop-mock'], new GamedevLoopMockAdapter())
}
