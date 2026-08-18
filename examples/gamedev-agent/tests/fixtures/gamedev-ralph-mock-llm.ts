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

const LOSING_MOVES = ['down', 'right', 'right']
const WINNING_MOVES = ['right', 'right', 'right', 'right', 'down', 'down', 'left', 'left', 'right', 'down', 'down', 'left', 'left', 'left']

/** Keyless gamedev-agent Ralph adapter: the parent runs one ralph call; each fresh child scores one gauntlet round and reports. */
class GamedevRalphMockAdapter extends LlmAdapter {
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
    const allText = options.messages.flatMap(message => message.content.filter(block => block.type === 'text')).map(block => block.text).join('\n')
    const roundMatch = /Ralph round: (\d+) of/.exec(allText)
    if (roundMatch !== null) {
      yield* this.childRound(Number(roundMatch[1]), options)
      return
    }

    const toolResults = options.messages.flatMap(message => message.content.filter(block => block.type === 'tool-result'))
    if (toolResults.length === 0) {
      const args = JSON.stringify({ objective: 'Reach a score of at least 20 in gold-run by collecting coins without stepping on a mine.' })
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id: CallId('gamedev-ralph-call'), name: 'ralph', argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: CallId('gamedev-ralph-call'), name: 'ralph', arguments: args } }
      yield { type: 'usage', usage: { inputTokens: 11, outputTokens: 3, cacheReadTokens: 2 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }

    const lastText = toolResults
      .flatMap(block => block.content.filter(inner => inner.type === 'text'))
      .map(inner => inner.text)
      .join('')
    const reply = `GAMEDEV ralph loop complete: ${lastText.trim()}`
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: reply }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: reply } }
    yield { type: 'usage', usage: { inputTokens: 7, outputTokens: 5, reasoningTokens: 1 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }

  private async * childRound(round: number, options: GenerateOptions): AsyncIterable<StreamChunk> {
    const toolResults = options.messages.flatMap(message => message.content.filter(block => block.type === 'tool-result'))
    if (toolResults.length === 0) {
      const inputs = round === 1 ? LOSING_MOVES : WINNING_MOVES
      const args = JSON.stringify({ scenarioId: 'gold-run-reach-20', game: 'gold-run', inputs, bar: 20 })
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id: CallId(`gamedev-ralph-round-${round}`), name: 'gauntlet_round', argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: CallId(`gamedev-ralph-round-${round}`), name: 'gauntlet_round', arguments: args } }
      yield { type: 'usage', usage: { inputTokens: 11, outputTokens: 3, cacheReadTokens: 2 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }

    const reported = toolResults.some(block => block.content.some(inner => inner.type === 'tool-result' && inner.toolCallId.startsWith('gamedev-ralph-report')))
    if (!reported) {
      const report = round === 1
        ? {
          status: 'continue',
          summary: 'Round 1 stepped on a mine with score 0; a mine-free path is needed.',
          evidence: ['gauntlet_round scored 0 against bar 20'],
          nextSteps: ['collect two coins on a mine-free path'],
          blocker: '',
        }
        : {
          status: 'complete',
          summary: 'Collected every coin on a mine-free path.',
          evidence: ['gauntlet_round scored 30 against bar 20'],
          nextSteps: [],
          blocker: '',
        }
      const args = JSON.stringify(report)
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id: CallId(`gamedev-ralph-report-${round}`), name: 'structured_output', argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: CallId(`gamedev-ralph-report-${round}`), name: 'structured_output', arguments: args } }
      yield { type: 'usage', usage: { inputTokens: 7, outputTokens: 5, reasoningTokens: 1 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }

    const text = 'reported'
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'usage', usage: { inputTokens: 7, outputTokens: 5, reasoningTokens: 1 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export const name = 'gamedev-ralph-mock-llm'
export const inject = ['llm']

/** Register the keyless `gamedev-ralph-mock` adapter. */
export function apply(ctx: Context): void {
  ctx.llm.registerAdapter(['gamedev-ralph-mock'], new GamedevRalphMockAdapter())
}
