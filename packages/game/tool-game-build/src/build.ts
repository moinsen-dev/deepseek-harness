/**
 * The game authoring pipeline: compile one plain-JavaScript module body in a
 * `node:vm` sandbox, validate the exported factory and instance contract, and
 * prove determinism by playing a probe input sequence twice — two runs must
 * agree on state, score, and terminal flag after every input. A game that
 * diverges (randomness, clock reads) is rejected at build time, before it can
 * poison the seam's replay guarantee.
 * @module @deepseek-ai/dsh-tool-game-build/build
 */

import vm from 'node:vm'
import { snapshotJsonValue } from '@deepseek-ai/dsh-session'
import type { JsonValue } from '@deepseek-ai/dsh-session'
import type { GameInstance } from '@deepseek-ai/dsh-game'

/** The observable tuple one probe step compares across two runs. */
export interface GameBuildProbe {
  /** Number of probe inputs applied before the comparison stopped. */
  readonly steps: number
  /** Final score of the first run. */
  readonly score: number
  /** Whether the first run reached its terminal condition. */
  readonly done: boolean
  /** Final state of the first run, detached as lossless JSON. */
  readonly state: JsonValue
}

/**
 * Cross-realm SyntaxError detection: a compile failure inside `runInContext`
 * constructs its error in the SANDBOX realm, so a host `instanceof
 * SyntaxError` is silently false — the `name` property is the realm-safe tag.
 * @param error - the caught compile failure.
 * @returns whether the error is a SyntaxError from either realm.
 */
function isSyntaxError(error: unknown): error is Error {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'SyntaxError'
}

/**
 * Compile one plain-JavaScript module body into its exports object. The body
 * runs as a CommonJS-style wrapper (`module`, `exports`) inside a fresh vm
 * context that exposes nothing else — game code gets no I/O, no timers, no
 * ambient globals beyond the JavaScript language itself.
 * @param source - the module body; it must set `module.exports.create`.
 * @returns the module's exports object.
 */
export function compileGameModule(source: string): unknown {
  const sandbox: Record<string, unknown> = {}
  vm.createContext(sandbox)
  const moduleBox = { exports: {} as Record<string, unknown> }
  let wrapper: unknown
  try {
    wrapper = vm.runInContext(`(function (module, exports) {\n${source}\n})`, sandbox, { filename: 'game-build.js' })
  } catch (error) {
    /* v8 ignore next 2 -- vm.runInContext of a function definition only throws SyntaxError; the guard is defensive. */
    if (!isSyntaxError(error)) throw error
    throw new Error(`game source failed to parse: ${String(error)}. The sandbox runs plain JavaScript — no TypeScript annotations.`)
  }
  /* v8 ignore next -- the wrapped definition always evaluates to a function when the script runs; the guard is defensive. */
  if (typeof wrapper !== 'function') throw new Error('game source must be a JavaScript module body')
  const run = wrapper as (module: unknown, exports: unknown) => void
  run(moduleBox, moduleBox.exports)
  return moduleBox.exports
}

/**
 * Validate the compiled exports: a `create()` factory whose instances
 * implement the synchronous game-instance contract. The factory runs once for
 * the smoke check — the same trust the seam gives any registered module.
 * @param exports - the compiled module exports.
 * @returns the validated factory.
 */
export function toGameFactory(exports: unknown): () => GameInstance {
  if (exports === null || typeof exports !== 'object') {
    throw new Error('game source must export a create() factory')
  }
  const create = (exports as { create?: unknown }).create
  if (typeof create !== 'function') {
    throw new Error('game source must export a create() factory')
  }
  const factory = create as () => unknown
  const instance = factory()
  if (instance === null || typeof instance !== 'object') {
    throw new Error('create() must return a game instance object')
  }
  const contract = instance as Partial<GameInstance>
  if (typeof contract.step !== 'function' || typeof contract.state !== 'function'
    || typeof contract.done !== 'function' || typeof contract.score !== 'function') {
    throw new Error('game instance must implement step(), state(), done(), and score()')
  }
  return create as () => GameInstance
}

/** Read one run's comparable tuple, validating state and score as it goes. */
function readRun(run: GameInstance): { state: JsonValue; score: number; done: boolean } {
  const state = snapshotJsonValue(run.state())
  if (state === undefined) throw new Error('game state is not lossless JSON')
  const score = run.score()
  if (!Number.isFinite(score)) throw new Error('game score must be a finite number')
  return { state, score, done: run.done() }
}

/**
 * Play the probe sequence on two fresh instances and require byte-identical
 * agreement after every input — the behavioral determinism proof. The
 * comparison stops early once a run reports its terminal condition.
 * @param factory - the validated game factory.
 * @param inputs - the scripted probe sequence.
 * @returns the first run's final tuple plus the number of applied inputs.
 */
export function probeDeterminism(factory: () => GameInstance, inputs: readonly JsonValue[]): GameBuildProbe {
  const first = factory()
  const second = factory()
  let steps = 0
  for (const input of inputs) {
    for (const run of [first, second]) {
      /* v8 ignore next -- the loop breaks as soon as either run reports done, so a done run never re-enters the step guard. */
      if (!run.done()) run.step(input)
    }
    const a = readRun(first)
    const b = readRun(second)
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      throw new Error(`game is not deterministic: two runs diverged after input ${steps + 1}`)
    }
    steps++
    if (a.done) break
  }
  const final = readRun(first)
  return { steps, score: final.score, done: final.done, state: final.state }
}
