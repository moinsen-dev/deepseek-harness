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

const COUNTER_SOURCE = `module.exports.create = () => {
  let n = 0
  return {
    state: () => ({ n }),
    step: () => { n += 1 },
    done: () => n >= 3,
    score: () => n,
  }
}
`

/** Keyless gamedev-agent build adapter: build a new game, play it, then answer. */
class GamedevBuildMockAdapter extends LlmAdapter {
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
      const args = JSON.stringify({ id: 'counter', source: COUNTER_SOURCE })
      yield* this.toolCall(CallId('gamedev-build-call'), 'game_build', args)
      return
    }
    if (toolResults.length === 1) {
      const args = JSON.stringify({ game: 'counter', inputs: ['a', 'b', 'c'] })
      yield* this.toolCall(CallId('gamedev-play-call'), 'game_play', args)
      return
    }

    const lastText = toolResults
      .flatMap(block => block.content.filter(inner => inner.type === 'text'))
      .map(inner => inner.text)
      .join('')
    const reply = `GAMEDEV build loop complete: ${lastText.trim()}`
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: reply }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: reply } }
    yield { type: 'usage', usage: { inputTokens: 7, outputTokens: 5, reasoningTokens: 1 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }

  private async * toolCall(id: ReturnType<typeof CallId>, name: string, args: string): AsyncIterable<StreamChunk> {
    yield { type: 'block-start', index: 0, blockType: 'tool-call' }
    yield { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: args }
    yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: args } }
    yield { type: 'usage', usage: { inputTokens: 11, outputTokens: 3, cacheReadTokens: 2 } }
    yield { type: 'finish', reason: { kind: 'tool-calls' } }
  }
}

export const name = 'gamedev-build-mock-llm'
export const inject = ['llm']

/** Register the keyless `gamedev-build-mock` adapter. */
export function apply(ctx: Context): void {
  ctx.llm.registerAdapter(['gamedev-build-mock'], new GamedevBuildMockAdapter())
}
