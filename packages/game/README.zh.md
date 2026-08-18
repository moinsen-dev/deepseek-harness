# game/ — 游戏能力家族

[English](README.md) | 中文

本家族提供确定性可玩游戏、游玩它们的模型工具，以及把回合对照质量门槛打分的 gauntlet 循环。它是游戏开发专用 Harness 的 Phase-0 PoC：引擎提供方（Godot、Unity、Web）将在后续阶段接入同一接缝。

| Package | Role | ctx key |
|---|---|---|
| [`game/`](game/README.md) | 定义游戏模块注册表、试玩执行与共享错误 | `ctx.game` |
| [`game-sim/`](game-sim/README.md) | 提供内置确定性 `coin-chase` 游戏 | registers on `ctx.game` |
| [`tool-game/`](tool-game/README.md) | 向模型暴露 `game_play` 与 `game_list` | registers on `ctx.tools` |
| [`game-gauntlet/`](game-gauntlet/README.md) | 对照质量门槛给回合打分并记录持久化 `gauntlet/round` 会话事件 | `ctx.gauntlet` |

把这些组件变成可玩循环的演示组合见 [examples/gamedev-agent](../../examples/gamedev-agent/README.md)；循环的 builder/critic 迭代由 goal、Ralph 与 workflow 原语组合而成，不随本家族发布。
