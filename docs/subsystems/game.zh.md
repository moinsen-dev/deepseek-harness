# 游戏能力

[English](game.md) | 中文

游戏能力——一条[能力接缝](../../.agents/notes/implemented/feature/2026-08-18-game-capability-seam-poc.md)，横跨确定性游戏模块、其面向模型的游玩工具，以及把回合对照质量门槛打分的 gauntlet 循环。Service Definition（[dsh-game](../../packages/game/game)，`ctx.game` + 模块注册表与试玩执行）、Service Providers（[dsh-game-sim](../../packages/game/game-sim)，`coin-chase` 模拟；[dsh-engine-godot](../../packages/game/engine-godot)，加载期 Godot-headless 追踪以同步模块重放）与 Consumers（[dsh-tool-game](../../packages/game/tool-game)，`game_play`/`game_list` 工具；[dsh-game-gauntlet](../../packages/game/game-gauntlet)，`ctx.gauntlet` + `gauntlet/round` 会话事件）。游戏是**一项可选能力**，不属于 agent-loop 主干。更换提供方不改变模型请求游玩的方式，更换场景不改变回合打分的方式。

Source: [`packages/game/game/src/types.ts`](../../packages/game/game/src/types.ts)

## 游戏模块契约

游戏是确定性模拟：相同输入序列必然产生相同的状态、分数与终态转换。接缝每次试玩运行创建新实例，因此场景不会观察到上一次运行的状态。

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

## 试玩请求与结果

接缝在每次应用输入后把状态快照校验为无损 JSON，并要求最终分数为有限值——返回畸形输出的模块在接缝处失败（`GAME_INVALID_STATE` / `GAME_INVALID_SCORE`），而不是污染消费方。

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

## gauntlet 循环

`ctx.gauntlet.run` 经接缝游玩场景，仅当 `score >= bar` 时判定回合通过（模型无关），强制回合号按会话与场景严格递增，并追加 log-only 的 `gauntlet/round` 会话事件——`scenarioId`、`game`、`attempt`、`steps`、`score`、`bar`、可选 `baseline` 与 `passed`。该事件绝不进入派生历史；恢复与分叉通过折叠日志还原循环位置。builder/critic 循环策略 `runLoop` 依次游玩候选输入序列直至达标，并把迄今最佳分数作为下一轮的基线。

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

```ts type-equiv
/**
 * One builder/critic loop plan: a fixed game and quality bar plus the
 * candidate input sequences the builder produced. The loop plays each
 * candidate as one round, carries the best score so far as the next round's
 * baseline, and stops at the first round that reaches the bar.
 */
interface GauntletLoopPlan {
  /** Stable scenario id shared by every round of this loop. */
  readonly scenarioId: string
  /** Registered game id the loop plays. */
  readonly game: string
  /** Quality bar: the loop stops once a round reaches this number. */
  readonly bar: number
  /** Candidate scripted input sequences, played in order until the bar passes. */
  readonly candidates: readonly (readonly JsonValue[])[]
}
```

```ts type-equiv
/** Normalized outcome of one completed loop run. */
interface GauntletLoopResult {
  /** The scenario's stable id. */
  readonly scenarioId: string
  /** Number of rounds the loop started. */
  readonly attempts: number
  /** Best score across the started rounds, when any round ran. */
  readonly best?: number
  /** Whether a round reached the bar. */
  readonly passed: boolean
  /** The attempt that reached the bar, when one exists. */
  readonly winningAttempt?: number
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

/**
 * The attempt number the next round for this scenario in this session would
 * receive — one above the last accepted attempt, or 1 for a new scenario.
 * @param session - the session whose attempt history is consulted.
 * @param scenarioId - the scenario's stable id.
 * @returns the next strictly increasing attempt number.
 */
nextAttempt(session: Session, scenarioId: string): number

/**
 * Run the builder/critic loop policy: play each candidate input sequence as
 * one round, carrying the best score so far as the next round's baseline,
 * and stop at the first round that reaches the bar. Model-free and
 * deterministic; every round lands as a durable `gauntlet/round` event, so
 * resume and fork recover the loop position by folding the log.
 * @param session - the session whose log receives the round events.
 * @param plan - the scenario id, game, bar, and candidate sequences.
 * @returns the normalized loop outcome; `winningAttempt` names the passing
 *   round when one exists.
 */
runLoop(session: Session, plan: GauntletLoopPlan): GauntletLoopResult
```

Types: [Session](session.md)

Source: [`packages/game/game-gauntlet/src/index.ts:33`](../../packages/game/game-gauntlet/src/index.ts)
<!-- END GENERATED cordis-surface -->
