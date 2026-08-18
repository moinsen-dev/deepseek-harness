# @deepseek-ai/dsh-game

English | [中文](README.zh.md)

Service Definition for the game capability seam: a registry of deterministic playable game modules plus bounded playtest execution, registered as `ctx.game`.

## API

`GameRuntime` (mounted as `ctx.game`, one instance per context):

- `registerModule(module)` — registers one `GameModule` under its stable `id`; duplicate ids throw `GameError` with code `GAME_DUPLICATE_MODULE`. Returns a disposer; the registration is also disposed with the calling fiber.
- `list()` — all registered modules in registration order.
- `play(request, signal?)` — plays `request.inputs` through the module named by `request.game` and returns the normalized `PlaytestResult`: inputs are applied in order until the instance reports `done()` or the list ends; `signal` is checked before each applied input (cooperative cancellation).

Config: `maxSteps` (default `1000`) caps how many inputs one run may apply; a longer request rejects with `GAME_STEP_LIMIT_EXCEEDED` before anything runs.

Error codes owned by the seam: `GAME_DUPLICATE_MODULE`, `GAME_UNKNOWN_GAME`, `GAME_STEP_LIMIT_EXCEEDED`, `GAME_ABORTED`, `GAME_INVALID_STATE`, `GAME_INVALID_SCORE`.

## Game module contract

A [`GameModule`](src/types.ts) is a factory with a stable `id`; `create()` returns one [`GameInstance`](src/types.ts) per run, so a scenario never observes a previous run's state. Implementations must be deterministic: the same input sequence yields the same state, score, and terminal transition.

- `state(): JsonValue` — current observable state; snapshotted and validated as lossless JSON after every applied input (a malformed state fails the run with `GAME_INVALID_STATE`).
- `step(input: JsonValue)` — apply one scripted input.
- `done(): boolean` — the terminal condition; the seam stops stepping once it holds.
- `score(): number` — objective score, higher is better; a non-finite final score fails the run with `GAME_INVALID_SCORE`.

## Design notes

The seam deliberately stays session-free, like `ctx.web`: it neither reads nor appends session state. Consumers decide what to log — `@deepseek-ai/dsh-tool-game` returns playtest results as tool values, and `@deepseek-ai/dsh-game-gauntlet` appends the durable `gauntlet/round` session events. Provider selection is by game id only, never by registration order.

## Model Experience

### Request context and condition

#### What the model sees

No direct context. The model reaches registered games only through the `game_play` and `game_list` tools owned by `@deepseek-ai/dsh-tool-game`; this package contributes no prompt section and no tool schema.

#### Token effect

Zero-direct token effect.

#### KV Cache effect

Independent — game registrations do not join prompt or tool-schema assembly, so mounting or unmounting modules never invalidates a request prefix.

## Known Limitations and Deferred Work

- **Synchronous, same-process modules only** — `GameInstance.step` is synchronous, so a network-backed engine (a Godot/Unreal provider) cannot fit the current contract. Phase 1 makes `play` asynchronous and adds engine providers behind this same seam.
- **One request-level cap** — there is no per-game step budget; `maxSteps` bounds the whole run uniformly.
