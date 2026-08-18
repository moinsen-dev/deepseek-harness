# @deepseek-ai/dsh-game-sim

English | [中文](README.zh.md)

Built-in deterministic simulation games for the game capability seam: registers the `coin-chase` module with `ctx.game`.

## Coin chase

`coin-chase` is a 3x3 grid simulation. The player starts at the top-left cell; each input is one of `up`, `down`, `left`, `right`. Out-of-bounds moves stop at the edge, any other input is a counted no-op, and entering a coin cell collects it for 10 points. The run ends once all three coins (fixed at `(0,2)`, `(1,1)`, `(2,0)`) are collected — maximum score 30. No randomness, no clock, no I/O: the same scripted input sequence always yields the same state, score, and terminal transition.

The plugin registers the module on load and unregisters it with its fiber (HMR-safe). Exports: `COIN_CHASE_ID`, `COIN_CHASE_MOVES`, `COIN_CHASE_GRID_SIZE`, `COIN_SCORE`, `CoinChase`, `CoinChaseModule`, and the `CoinChaseState` type.

## Model Experience

### Request context and condition

#### What the model sees

No direct context. The registered module becomes playable only through the `game_play` and `game_list` tools owned by `@deepseek-ai/dsh-tool-game`; this package contributes no prompt section and no tool schema.

#### Token effect

Zero-direct token effect.

#### KV Cache effect

Independent — registering a game never joins prompt or tool-schema assembly.

## Known Limitations and Deferred Work

- **One game, fixed rules** — only `coin-chase` ships; grid size, coin layout, and scoring are game content, not config. A configurable scenario pack or more games is deferred work, not a seam change.
- **No rendering** — states are JSON snapshots for tool results and gauntlet scoring; there is no visual presentation yet.
