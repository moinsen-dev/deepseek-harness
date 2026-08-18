# @deepseek-ai/dsh-game-gauntlet

English | [中文](README.zh.md)

The gauntlet loop service: run one playtest round against a quality bar, pass/fail it model-free, and append the durable `gauntlet/round` session event. Registered as `ctx.gauntlet`.

## API

`GauntletRuntime` (mounted as `ctx.gauntlet`, one instance per context):

- `run(scenario, session, attempt)` — validates the scenario and attempt, plays `scenario.game` through `ctx.game`, compares the score against `scenario.bar` (`passed = score >= bar`), and appends one `gauntlet/round` event to `session`. Returns the normalized [`GauntletRound`](src/types.ts) including the appended event's seq.
- `foldGauntletRounds(events)` — pure replay fold of durable round facts: attempt count, the last verdict, and the best score with its attempt.

A scenario carries a stable `id` (shared by all rounds of one objective), the game, the fixed scripted inputs, the `bar`, and an optional `baseline` (prior best score). Attempts must be positive integers strictly increasing per session and scenario — a stale attempt rejects with `GAUNTLET_STALE_ATTEMPT` before anything plays. Other codes: `GAUNTLET_INVALID_SCENARIO_ID`, `GAUNTLET_INVALID_BAR`, `GAUNTLET_INVALID_BASELINE`, `GAUNTLET_INVALID_ATTEMPT`.

## The `gauntlet/round` session event

`gauntlet/round` is declaration-merged into `SessionEventMap` and is log-only (no `surfaceOp`, never derived history): it records `scenarioId`, `game`, `attempt`, `steps`, `score`, `bar`, optional `baseline`, and `passed`. The package-owned invariant intercepts the append and rejects a round whose verdict contradicts its score/bar relation, a non-finite score/bar, or a non-positive attempt. Resume and fork recover loop position by folding the log.

The builder/critic iteration that loops until the bar passes is deliberately composed from existing primitives (goal rounds, the Ralph loop, the workflow tool); this package owns only the bar, the scoring, the attempt ordering, and the logged facts.

## Model Experience

### Request context and condition

#### What the model sees

No direct context. Round scores reach the model only through `game_play` tool results owned by `@deepseek-ai/dsh-tool-game`; `gauntlet/round` events are log-only and never join derived history.

#### Token effect

Zero-direct token effect.

#### KV Cache effect

Independent — appending `gauntlet/round` events never changes prompt or tool-schema assembly, so round churn cannot invalidate a request prefix.

## Known Limitations and Deferred Work

- **Loop driver not shipped** — only the round primitive exists; the goal/ralph/workflow composition that iterates builder and critic until the bar passes is example wiring, not yet a product feature.
- **Process-local attempt memory** — the strict attempt ordering lives in memory; a reloaded process must re-derive the last attempt by folding the log before its next `run`.
- **`baseline` is carried, not compared** — the seam logs the baseline but does not emit a delta or block regressions; that policy belongs to the future loop driver.
