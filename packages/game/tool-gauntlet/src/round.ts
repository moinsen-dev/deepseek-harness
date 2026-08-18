/**
 * The model-facing `gauntlet_round` tool: propose one candidate strategy, get a
 * bar-scored round back. Attempt numbers are owned by `ctx.gauntlet` (strictly
 * increasing per session and scenario), so the model iterates — propose, score,
 * propose — without ever naming an attempt itself. Every round lands as a
 * durable `gauntlet/round` session event.
 * @module @deepseek-ai/dsh-tool-gauntlet/round
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

/** The canonical `gauntlet_round` value: the accepted round's durable facts. */
export interface GauntletRoundValue {
  /** The scenario's stable id. */
  readonly scenarioId: string
  /** The attempt number the runtime assigned. */
  readonly attempt: number
  /** Number of inputs actually applied. */
  readonly steps: number
  /** Final objective score. */
  readonly score: number
  /** The quality bar the score was compared against. */
  readonly bar: number
  /** Prior best score, when the call carried one. */
  readonly baseline?: number
  /** Whether the round reached the bar. */
  readonly passed: boolean
}

/**
 * Validate value constraints the schema DSL cannot express: a non-blank
 * `scenarioId`. Throws a plain `Error` otherwise. Bar and baseline finiteness
 * is already enforced at the model-argument boundary (lossless JSON rejects
 * non-finite numbers before execution).
 * @param args - the schema-validated `gauntlet_round` arguments.
 * @returns the accepted arguments, passed through unchanged.
 */
export function parseGauntletRoundArgs(args: {
  scenarioId: string
  game: string
  inputs: string[]
  bar: number
  baseline?: number
}): { scenarioId: string; game: string; inputs: string[]; bar: number; baseline?: number } {
  if (args.scenarioId.trim().length === 0) throw new Error('scenarioId must be a non-empty string')
  return {
    scenarioId: args.scenarioId,
    game: args.game,
    inputs: [...args.inputs],
    bar: args.bar,
    ...(args.baseline === undefined ? {} : { baseline: args.baseline }),
  }
}

/**
 * Format one round outcome as a single model-facing text block: the assigned
 * attempt, score against the bar, verdict, and the baseline delta when known.
 * @param value - the canonical `gauntlet_round` value.
 * @returns the rendered verdict line.
 */
export function formatGauntletRoundResult(value: GauntletRoundValue): string {
  const verdict = value.passed ? 'PASSED' : 'FAILED'
  if (value.baseline === undefined) {
    return `Gauntlet round ${value.attempt} for \`${value.scenarioId}\`: score ${value.score} against bar ${value.bar} — ${verdict}.`
  }
  const delta = value.score - value.baseline
  const sign = delta > 0 ? '+' : ''
  return `Gauntlet round ${value.attempt} for \`${value.scenarioId}\`: score ${value.score} against bar ${value.bar} — `
    + `${verdict} (baseline ${value.baseline}, delta ${sign}${delta}).`
}

/**
 * Register the `gauntlet_round` tool with `ctx.tools`.
 * @param ctx - Cordis context carrying the tool registry and gauntlet runtime.
 * @param timeoutMs - cooperative timeout budget attached to the tool.
 */
export function applyGauntletRoundTool(ctx: Context, timeoutMs: number): void {
  ctx.tools.register(defineTool({
    name: 'gauntlet_round',
    description: 'Play one gauntlet round: propose a candidate input sequence for a registered game, and get a '
      + 'model-free verdict back — the round passes exactly when its score reaches the bar. The runtime assigns the '
      + 'strictly increasing attempt number and logs every round durably, so iterate: propose, observe the scored '
      + 'result, propose a better sequence.',
    parameters: {
      scenarioId: { type: 'string', required: true, description: 'Stable id shared by all rounds of one objective (e.g. "collect-all").' },
      game: { type: 'string', required: true, description: 'Registered game id to play (see game_list).' },
      inputs: {
        type: 'array',
        items: { type: 'string' },
        required: true,
        description: 'Candidate scripted inputs applied in order, for example ["down", "right"].',
      },
      bar: { type: 'number', required: true, description: 'Quality bar: the round passes when its score reaches this number.' },
      baseline: { type: 'number', description: 'Prior best score to compare against; omit for the first round.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          scenarioId: { type: 'string', required: true },
          attempt: { type: 'number', required: true },
          steps: { type: 'number', required: true },
          score: { type: 'number', required: true },
          bar: { type: 'number', required: true },
          baseline: { type: 'number' },
          passed: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatGauntletRoundResult(value) }],
    },
    timeoutMs,
    execute(args, exec) {
      const { scenarioId, game, inputs, bar, baseline } = parseGauntletRoundArgs(args)
      if (!exec.agent) {
        // The round appends to the caller's session; a non-agent caller has
        // nowhere to log it. Reject rather than silently no-op.
        throw new Error('gauntlet_round requires an owning agent session')
      }
      const session = exec.agent.session
      const attempt = ctx.gauntlet.nextAttempt(session, scenarioId)
      const round = ctx.gauntlet.run({
        id: scenarioId,
        game,
        inputs,
        bar,
        ...(baseline === undefined ? {} : { baseline }),
      }, session, attempt)
      return Promise.resolve({
        scenarioId,
        attempt: round.attempt,
        steps: round.steps,
        score: round.score,
        bar: round.bar,
        ...(round.baseline === undefined ? {} : { baseline: round.baseline }),
        passed: round.passed,
      })
    },
  }))
}
