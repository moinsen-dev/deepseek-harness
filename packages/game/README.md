# game/ — game capability family

English | [中文](README.zh.md)

This family provides deterministic playable games, the model-facing tools that play them, and the gauntlet loop that scores rounds against a quality bar. It is the Phase-0 PoC for a game-development-specialized harness: engine-backed providers (Godot, Unity, web) join this same seam in later phases.

| Package | Role | ctx key |
|---|---|---|
| [`game/`](game/README.md) | Defines the game-module registry, playtest execution, and shared errors | `ctx.game` |
| [`game-sim/`](game-sim/README.md) | Provides the built-in deterministic `coin-chase` game | registers on `ctx.game` |
| [`engine-godot/`](engine-godot/README.md) | Traces configured scenarios once through Godot headless and registers the deterministic replay modules | registers on `ctx.game` |
| [`tool-game/`](tool-game/README.md) | Exposes `game_play` and `game_list` to the model | registers on `ctx.tools` |
| [`game-gauntlet/`](game-gauntlet/README.md) | Scores rounds against a quality bar, runs the builder/critic loop policy, and logs durable `gauntlet/round` session events | `ctx.gauntlet` |
| [`tool-gauntlet/`](tool-gauntlet/README.md) | Exposes `gauntlet_round` to the model, with runtime-assigned attempts | registers on `ctx.tools` |
| [`tool-game-build/`](tool-game-build/README.md) | Authors new games: compiles sandboxed sources, proves determinism, registers live | registers on `ctx.tools` |

The demo composition that turns these into a playable loop is [examples/gamedev-agent](../../examples/gamedev-agent/README.md); the loop's builder/critic iteration is composed from goal, Ralph, and workflow primitives rather than shipped here.
