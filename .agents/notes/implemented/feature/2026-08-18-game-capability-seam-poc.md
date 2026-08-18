# Agent Note: The game capability seam and gauntlet loop PoC

Status: implemented

English | [中文](2026-08-18-game-capability-seam-poc.zh.md)

## Problem

DeepSeek Harness is a plugin-based harness, but nothing in the shipped tree targets game development: there is no game runtime the model can play against, no tool that turns playtest outcomes into model-visible facts, and no loop primitive that scores work against a quality bar instead of trusting the model's self-report. A game-development-specialized variant of the harness must grow these from the harness's own extension points — capability seams, model tools, session events, and composed loop primitives — rather than as a fork or a monolithic "game mode".

## Decision

The Phase-0 PoC ships as the new `packages/game/` group, demoed by `examples/gamedev-agent`:

- [`@deepseek-ai/dsh-game`](../../../../packages/game/game/README.md) is the Service Definition: `ctx.game` registers deterministic `GameModule`s by stable id (duplicate ids fail loud) and plays scripted input sequences with a configured `maxSteps` cap, validating every state snapshot as lossless JSON and the final score as finite. The seam is session-free: consumers own what gets logged.
- [`@deepseek-ai/dsh-game-sim`](../../../../packages/game/game-sim/README.md) is the first provider: the `coin-chase` 3x3 deterministic simulation (four moves, three fixed coins, 10 points each, done when all are collected).
- [`@deepseek-ai/dsh-tool-game`](../../../../packages/game/tool-game/README.md) is the consumer: model-facing `game_play` (scripted inputs in, steps/state/score/done out, cooperative timeout) and `game_list`.
- [`@deepseek-ai/dsh-game-gauntlet`](../../../../packages/game/game-gauntlet/README.md) owns the gauntlet loop primitive: `ctx.gauntlet.run(scenario, session, attempt)` plays through the seam, passes a round exactly when `score >= bar` (model-free), enforces strictly increasing attempts per session and scenario, and appends the log-only `gauntlet/round` session event. `foldGauntletRounds` recovers loop position from the log. The package-owned invariant intercepts the append and rejects a round whose verdict contradicts its bar relation.

The builder/critic iteration that loops until the bar passes is deliberately not shipped as a new engine: it is composed from existing primitives (goal rounds, the Ralph loop, the workflow tool), and the example's driver demonstrates the shape — round 1 misses the bar, round 2 passes. The keyless snapshot pins the assembled transcript, and the real-model smoke verifies the scored tool result in the streamed session log rather than the model's claim.

## Alternatives considered

- **A dedicated `gamedev` app or profile fork** — rejected: a fork would freeze the game tooling outside the plugin tree, where profiles, presets, and patches cannot reach it. Everything above is ordinary plugins, so a `--profile gamedev` bundle can stack them later without changing the seam.
- **Playtest results as model-visible surface messages** — rejected: injecting every round as a `user/message` would let scoring churn context and cache. `gauntlet/round` is log-only; scores reach the model only through `game_play` tool results.
- **A gauntlet engine service with its own scheduler** — rejected: the repo already has goal/ralph/workflow primitives for iteration; a second scheduler would duplicate activation and cancellation semantics.

## Consequences

The seam and the loop give the game variant its three required properties without touching `agent-loop`: the model verifies game behavior by playing (deterministic, replayable), the bar comparison is model-free and logged, and the loop position survives resume and fork through the session log. The costs: the module contract is synchronous and same-process (engine providers deferred), the loop driver is example wiring rather than a product feature, and attempt ordering is process-local until a consumer re-derives it by folding the log.
