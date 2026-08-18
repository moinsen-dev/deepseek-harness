# Game Capability

English | [中文](game.zh.md)

The game capability — a [capability seam](../../.agents/notes/implemented/feature/2026-08-18-game-capability-seam-poc.md) spanning deterministic game modules, their model-facing play tools, and the gauntlet loop that scores rounds against a quality bar. Service Definition ([dsh-game](../../packages/game/game), `ctx.game` + the module registry and playtest execution), Service Provider ([dsh-game-sim](../../packages/game/game-sim), the `coin-chase` simulation), and Consumers ([dsh-tool-game](../../packages/game/tool-game), the `game_play`/`game_list` tools; [dsh-game-gauntlet](../../packages/game/game-gauntlet), `ctx.gauntlet` + the `gauntlet/round` session event). Games are **one optional capability**, not part of the agent-loop spine. A provider swap does not change how the model asks to play, and a scenario swap does not change how a round is scored.

Source: [`packages/game/game/src/types.ts`](../../packages/game/game/src/types.ts)

## The game module contract

A game is a deterministic simulation: the same scripted input sequence always yields the same state, score, and terminal transition. The seam creates one instance per playtest run, so a scenario never observes a previous run's state.

```ts type-equiv
/**
 * A registered game: a factory with a stable identity. The seam creates one
 * instance per playtest run, so a scenario never observes a previous run's state.
 */
interface GameModule {
  /** Stable unique id — the `game` field of playtest requests and gauntlet scenarios. */
  readonly id: string
  /** Create one fresh playable run. */
  create(): GameInstance
}
```

```ts type-equiv
/**
 * One live playable run. Implementations must be deterministic: the same input
 * sequence yields the same state, score, and terminal transition.
 */
interface GameInstance {
  /** Current observable state as lossless JSON. */
  state(): JsonValue
  /** Apply one scripted input and advance the simulation. */
  step(input: JsonValue): void
  /** True once the terminal condition holds; the seam stops stepping then. */
  done(): boolean
  /** Objective score so far; higher is better. Must be a finite number. */
  score(): number
}
```

## Playtest request and result

The seam validates every state snapshot as lossless JSON after each applied input and requires a finite final score, so a module returning malformed output fails at the seam (`GAME_INVALID_STATE` / `GAME_INVALID_SCORE`) instead of poisoning consumers.

```ts type-equiv
/**
 * One playtest request: a registered game plus the scripted input sequence.
 * The seam rejects a sequence longer than its configured `maxSteps` before
 * applying anything.
 */
interface PlaytestRequest {
  /** Registered game id to play. */
  readonly game: string
  /** Scripted inputs applied in order until `done()` or the list ends. */
  readonly inputs: readonly JsonValue[]
}
```

```ts type-equiv
/** Normalized playtest outcome produced by the seam. */
interface PlaytestResult {
  /** The game id that was played. */
  readonly game: string
  /** Number of inputs actually applied — stops at `done()` or the request end. */
  readonly steps: number
  /** Final observable state, snapshotted as detached lossless JSON. */
  readonly state: JsonValue
  /** Final objective score. */
  readonly score: number
  /** Whether the run reached its terminal condition. */
  readonly done: boolean
}
```

## The gauntlet loop

`ctx.gauntlet.run` plays a scenario through the seam, passes the round exactly when `score >= bar` (model-free), enforces strictly increasing attempts per session and scenario, and appends the log-only `gauntlet/round` session event — `scenarioId`, `game`, `attempt`, `steps`, `score`, `bar`, optional `baseline`, and `passed`. The event never joins derived history; resume and fork recover loop position by folding the log.

```ts type-equiv
/**
 * One gauntlet scenario: a playtest objective plus the pass/fail quality bar.
 * The scenario id is the stable business id across rounds, so consumers can
 * group every `gauntlet/round` event without guessing from adjacency.
 */
interface GauntletScenario {
  /** Stable scenario id shared by every round of this objective. */
  readonly id: string
  /** Registered game id the scenario plays. */
  readonly game: string
  /** Scripted input sequence applied by every round of this scenario. */
  readonly inputs: readonly JsonValue[]
  /** Quality bar: a round passes when its score reaches this number. */
  readonly bar: number
  /** Prior best score the round is compared against, when one is known. */
  readonly baseline?: number
}
```

```ts type-equiv
/** Normalized outcome of one gauntlet round, returned by the runtime. */
interface GauntletRound {
  /** The scenario's stable id. */
  readonly scenarioId: string
  /** The game id that was played. */
  readonly game: string
  /** Positive round number; strictly increasing per scenario and session. */
  readonly attempt: number
  /** Number of inputs actually applied. */
  readonly steps: number
  /** Final objective score. */
  readonly score: number
  /** The quality bar the score was compared against. */
  readonly bar: number
  /** Prior best score, when the scenario carried one. */
  readonly baseline?: number
  /** Whether the round reached the bar (`score >= bar`). */
  readonly passed: boolean
  /** Seq of the appended `gauntlet/round` session event. */
  readonly eventSeq: number
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxgame--gameruntime"></a>

### `ctx.game` — `GameRuntime`

The game capability service. Registered as `ctx.game` (one instance per context).

Execution semantics: a run applies inputs in order, stops early when the instance reports `done()`, and rejects with GameError when the request exceeds the step cap, the game id is unknown, the run is aborted, a state snapshot is not lossless JSON, or the final score is not finite.

```ts cordis-catalog
/**
 * Register a game module. Throws {@link GameError} `GAME_DUPLICATE_MODULE`
 * if its id is already registered. Returns a disposer; the registration is
 * also disposed with the calling fiber.
 * @param module - the module; its `id` is the registry key.
 * @returns the disposer that unregisters the module.
 */
registerModule(module: GameModule): () => void

/**
 * All registered modules, in registration order.
 * @returns a fresh array of the registered modules.
 */
list(): readonly GameModule[]

/**
 * Play one request through the registered module. Cancellation is cooperative:
 * the signal is checked before each applied input, so an abort mid-run stops
 * before the next input and never after the final one. Synchronous by
 * contract — modules are deterministic in-process simulations; engine-backed
 * providers require the deferred asynchronous contract.
 * @param request - the game id plus the scripted input sequence.
 * @param signal - optional cancellation signal checked between inputs.
 * @returns the normalized playtest outcome.
 */
play(request: PlaytestRequest, signal?: AbortSignal): PlaytestResult
```

Source: [`packages/game/game/src/index.ts:44`](../../packages/game/game/src/index.ts)

<a id="ctxgauntlet--gauntletruntime"></a>

### `ctx.gauntlet` — `GauntletRuntime`

The gauntlet runtime. Registered as `ctx.gauntlet` (one instance per context). Enforces strictly increasing attempt numbers per session and scenario before playing, and writes one `gauntlet/round` session event per accepted round.

```ts cordis-catalog
/**
 * Run one gauntlet round: validate the scenario and attempt, play the game,
 * compare the score against the bar, and append the durable round event.
 * Synchronous like the seam's play — deterministic in-process simulation.
 * @param scenario - the objective, game, inputs, bar, and optional baseline.
 * @param session - the session whose log receives the `gauntlet/round` event.
 * @param attempt - positive round number; must exceed the previous attempt
 *   for this scenario in this session.
 * @returns the normalized round, including the appended event's seq.
 */
run(scenario: GauntletScenario, session: Session, attempt: number): GauntletRound
```

Types: [Session](session.md)

Source: [`packages/game/game-gauntlet/src/index.ts:32`](../../packages/game/game-gauntlet/src/index.ts)
<!-- END GENERATED cordis-surface -->
