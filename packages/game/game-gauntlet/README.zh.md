# @deepseek-ai/dsh-game-gauntlet

[English](README.md) | 中文

Gauntlet 循环服务：把一次试玩回合对照质量门槛打分，模型无关地判定通过/失败，并追加持久化的 `gauntlet/round` 会话事件。注册为 `ctx.gauntlet`。

## API

`GauntletRuntime`（挂载为 `ctx.gauntlet`，每个上下文一个实例）：

- `run(scenario, session, attempt)` — 校验场景与回合号，经 `ctx.game` 游玩 `scenario.game`，把分数与 `scenario.bar` 比较（`passed = score >= bar`），并向 `session` 追加一个 `gauntlet/round` 事件。返回规范化后的 [`GauntletRound`](src/types.ts)，含追加事件的 seq。
- `foldGauntletRounds(events)` — 持久化回合事实的纯重放折叠：回合数、最近判定与最佳分数及其回合号。

场景携带稳定 `id`（同一目标的所有回合共用）、游戏、固定脚本化输入、`bar` 与可选 `baseline`（此前最佳分数）。回合号必须是严格递增的正整数（按会话与场景），过期的回合号在游玩前即以 `GAUNTLET_STALE_ATTEMPT` 拒绝。其他错误码：`GAUNTLET_INVALID_SCENARIO_ID`、`GAUNTLET_INVALID_BAR`、`GAUNTLET_INVALID_BASELINE`、`GAUNTLET_INVALID_ATTEMPT`。

## `gauntlet/round` 会话事件

`gauntlet/round` 通过声明合并进入 `SessionEventMap`，且为 log-only（无 `surfaceOp`，绝不进入派生历史）：记录 `scenarioId`、`game`、`attempt`、`steps`、`score`、`bar`、可选 `baseline` 与 `passed`。包级不变量在追加处拦截，拒绝判定与分数/门槛关系矛盾、分数或门槛非有限、回合号非正的事件。恢复与分叉通过折叠日志还原循环位置。

循环到门槛通过的 builder/critic 迭代刻意由既有原语组合而成（goal 回合、Ralph 循环、workflow 工具）；本包只拥有门槛、打分、回合顺序与已记录事实。

## Model Experience

### Request context and condition

#### What the model sees

无直接上下文。回合分数只经 `@deepseek-ai/dsh-tool-game` 拥有的 `game_play` 工具结果触达模型；`gauntlet/round` 事件为 log-only，绝不进入派生历史。

#### Token effect

零直接 token 影响。

#### KV Cache effect

独立——追加 `gauntlet/round` 事件不会改变提示或工具 schema 组装，回合频繁变更不会使任何请求前缀失效。

## Known Limitations and Deferred Work

- **循环驱动未随包发布** — 目前只有回合原语；迭代 builder 与 critic 直至门槛通过的 goal/ralph/workflow 组合仍是示例接线，尚未成为产品功能。
- **进程内回合记忆** — 严格的回合顺序保存在内存中；重载后的进程须先折叠日志还原上次回合号，再进行下一次 `run`。
- **`baseline` 只记录、不比较** — 接缝记录基线但不输出差值、也不阻止回退；该策略属于未来的循环驱动。
