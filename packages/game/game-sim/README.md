# @deepseek-ai/dsh-game-sim

English | [中文](README.zh.md)

Built-in deterministic simulation games for the game capability seam: registers the `coin-chase` and `gold-run` modules with `ctx.game`.

## Gold run

`gold-run` is a 5x5 grid with three coins worth 10 points each and two mines that end the run immediately. The player starts at the top-left cell; each input is one of `up`, `down`, `left`, `right`. Out-of-bounds moves stop at the edge, any other input is a counted no-op, and entering a coin cell collects it. A run is terminal when all three coins (fixed at `(0,4)`, `(2,2)`, `(4,0)`) are collected — perfect score 30 — or when the player steps on one of the two mines (`(1,2)`, `(3,2)`), freezing the score at whatever was collected. The mine-free search space is deliberately larger than coin-chase's, so a builder's first candidate strategy usually misses the bar and iteration visibly improves. No randomness, no clock, no I/O.

## Coin chase

`coin-chase` is a 3x3 grid simulation. The player starts at the top-left cell; each input is one of `up`, `down`, `left`, `right`. Out-of-bounds moves stop at the edge, any other input is a counted no-op, and entering a coin cell collects it for 10 points. The run ends once all three coins (fixed at `(0,2)`, `(1,1)`, `(2,0)`) are collected — maximum score 30. No randomness, no clock, no I/O: the same scripted input sequence always yields the same state, score, and terminal transition.

The plugin registers the modules on load and unregisters them with its fiber (HMR-safe). Exports for coin-chase: `COIN_CHASE_ID`, `COIN_CHASE_MOVES`, `COIN_CHASE_GRID_SIZE`, `COIN_SCORE`, `CoinChase`, `CoinChaseModule`, and the `CoinChaseState` type; for gold-run: `GOLD_RUN_ID`, `GOLD_RUN_MOVES`, `GOLD_RUN_GRID_SIZE`, `GOLD_COIN_SCORE`, `GoldRun`, `GoldRunModule`, and the `GoldRunState` type.

## Model Experience

### Request context and condition

#### What the model sees

No direct context. The registered module becomes playable only through the `game_play` and `game_list` tools owned by `@deepseek-ai/dsh-tool-game`; this package contributes no prompt section and no tool schema.

#### Token effect

Zero-direct token effect.

#### KV Cache effect

Independent — registering a game never joins prompt or tool-schema assembly.

## Known Limitations and Deferred Work

- **Two games, fixed rules** — only `coin-chase` and `gold-run` ship; grid sizes, layouts, and scoring are game content, not config. A configurable scenario pack or more games is deferred work, not a seam change.
- **No rendering** — states are JSON snapshots for tool results and gauntlet scoring; there is no visual presentation yet.
