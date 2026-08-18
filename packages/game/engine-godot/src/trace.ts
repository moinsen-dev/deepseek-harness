/**
 * Trace vocabulary and the synchronous replay module: one Godot run produces a
 * per-input trace; the registered module replays it deterministically, so the
 * model playtests a real engine outcome without a live engine per step.
 * @module @deepseek-ai/dsh-engine-godot/trace
 */

import { snapshotJsonValue } from '@deepseek-ai/dsh-session'
import type { JsonValue } from '@deepseek-ai/dsh-session'
import type { GameInstance, GameModule } from '@deepseek-ai/dsh-game'

/** One trace step: the observable facts after one scripted input was applied. */
export interface TraceEntry {
  /** Observable state after the input, as lossless JSON. */
  readonly state: JsonValue
  /** Objective score after the input. */
  readonly score: number
  /** Whether the terminal condition held after the input. */
  readonly done: boolean
}

/** One parsed, validated trace: a game id plus its per-input entries. */
export interface TraceGame {
  /** Stable game id the module registers under. */
  readonly id: string
  /** Per-input facts, in input order; `entries[i]` follows input `i + 1`. */
  readonly entries: readonly TraceEntry[]
}

/**
 * Convert one parsed JSON line into a validated trace entry. The state
 * snapshotter is the single lossless-JSON validator; a finite score and a
 * boolean terminal flag are required.
 * @param value - the parsed NDJSON line.
 * @param line - 1-based line number for diagnostics.
 * @returns the validated entry.
 */
function toTraceEntry(value: unknown, line: number): TraceEntry {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`engine-godot: trace line ${line} is not a { state, score, done } step`)
  }
  const entry = value as { state?: unknown; score?: unknown; done?: unknown }
  if (typeof entry.score !== 'number' || !Number.isFinite(entry.score)) {
    throw new Error(`engine-godot: trace line ${line} has a non-finite score`)
  }
  if (typeof entry.done !== 'boolean') {
    throw new Error(`engine-godot: trace line ${line} has a non-boolean done flag`)
  }
  // snapshotJsonValue is generic over the input; a successful snapshot of any
  // value is a detached lossless-JSON value by its contract.
  const state = snapshotJsonValue(entry.state) as JsonValue | undefined
  if (state === undefined) {
    throw new Error(`engine-godot: trace line ${line} has a state that is not lossless JSON`)
  }
  return { state, score: entry.score, done: entry.done }
}

/**
 * Parse and validate one NDJSON trace body: one entry per line, and the
 * terminal flag monotonic — once `done` holds it must hold for every later
 * entry.
 * @param id - the game id the trace was produced for.
 * @param body - the raw NDJSON stdout of one Godot trace run.
 * @returns the validated trace game; throws on malformed input.
 */
export function parseTraceGame(id: string, body: string): TraceGame {
  if (id.trim().length === 0) throw new Error('engine-godot: scenario id must be a non-empty string')
  const trimmed = body.trim()
  const lines = trimmed.length === 0 ? [] : trimmed.split('\n')
  const entries: TraceEntry[] = []
  let done = false
  for (const [index, line] of lines.entries()) {
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch (error: unknown) {
      throw new Error(`engine-godot: trace line ${index + 1} is not valid JSON`, { cause: error })
    }
    const entry = toTraceEntry(value, index + 1)
    if (done && !entry.done) {
      throw new Error(`engine-godot: trace line ${index + 1} leaves the terminal condition after line ${index}`)
    }
    done = entry.done
    entries.push(entry)
  }
  return { id, entries }
}

/**
 * One synchronous trace replay. Inputs advance the cursor; input content is
 * not re-evaluated — the trace is the recorded engine outcome for the fixed
 * scripted sequence the scenario produced it with. Fewer inputs replay the
 * prefix; extra inputs clamp at the last entry.
 */
export class TraceGameInstance implements GameInstance {
  private cursor = -1

  constructor(private readonly trace: TraceGame) {}

  /** The current entry, or the neutral initial facts before the first input. */
  private get current(): TraceEntry | undefined {
    return this.cursor < 0 ? undefined : this.trace.entries[Math.min(this.cursor, this.trace.entries.length - 1)]
  }

  /**
   * Current observable state; the neutral empty object before the first input.
   * @returns the recorded state snapshot.
   */
  state(): JsonValue {
    const current = this.current
    if (current === undefined) return {}
    return current.state
  }

  /**
   * Advance one recorded step; the input value itself is not re-evaluated.
   * @param input - the scripted input; ignored beyond advancing the trace.
   */
  step(input: JsonValue): void {
    void input
    this.cursor++
  }

  /**
   * Whether the recorded terminal condition holds at the current position.
   * @returns false before the first entry, then the recorded flag.
   */
  done(): boolean {
    return this.current?.done ?? false
  }

  /**
   * Recorded score at the current position.
   * @returns 0 before the first entry, then the recorded score.
   */
  score(): number {
    return this.current?.score ?? 0
  }
}

/**
 * A game module that replays one validated trace. The seam creates one
 * {@link TraceGameInstance} per playtest run, so a scenario never observes a
 * previous run's cursor.
 */
export class TraceGameModule implements GameModule {
  readonly id: string

  constructor(private readonly trace: TraceGame) {
    this.id = trace.id
  }

  /**
   * Create one fresh replay run.
   * @returns a new trace instance.
   */
  create(): TraceGameInstance {
    return new TraceGameInstance(this.trace)
  }
}
