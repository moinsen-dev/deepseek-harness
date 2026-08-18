# game/ — 游戏能力家族

[English](README.md) | 中文

本家族提供确定性可玩游戏、游玩它们的模型工具，以及把回合对照质量门槛打分的 gauntlet 循环。它是游戏开发专用 Harness 的 Phase-0 PoC：引擎提供方（Godot、Unity、Web）将在后续阶段接入同一接缝。

| Package | Role | ctx key |
|---|---|---|
| [`game/`](game/README.md) | 定义游戏模块注册表、试玩执行与共享错误 | `ctx.game` |
| [`game-sim/`](game-sim/README.md) | 提供内置确定性 `coin-chase` 游戏 | registers on `ctx.game` |
| [`engine-godot/`](engine-godot/README.md) | 通过 Godot headless 为每个场景追踪一次并注册确定性重放模块 | registers on `ctx.game` |
| [`tool-game/`](tool-game/README.md) | 向模型暴露 `game_play` 与 `game_list` | registers on `ctx.tools` |
| [`game-gauntlet/`](game-gauntlet/README.md) | 对照质量门槛给回合打分、运行 builder/critic 循环策略并记录持久化 `gauntlet/round` 会话事件 | `ctx.gauntlet` |
| [`tool-gauntlet/`](tool-gauntlet/README.md) | 向模型暴露 `gauntlet_round`，回合号由运行时分配 | registers on `ctx.tools` |
| [`tool-game-build/`](tool-game-build/README.md) | 创作新游戏：编译沙箱源码、证明确定性、实时注册 | registers on `ctx.tools` |

把这些组件变成可玩循环的演示组合见 [examples/gamedev-agent](../../examples/gamedev-agent/README.md)；循环的 builder/critic 迭代由 goal、Ralph 与 workflow 原语组合而成，不随本家族发布。
