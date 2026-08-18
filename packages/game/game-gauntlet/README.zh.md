# @deepseek-ai/dsh-game-gauntlet

[English](README.md) | 中文

Gauntlet 循环服务：把一次试玩回合对照质量门槛打分，模型无关地判定通过/失败，并追加持久化的 `gauntlet/round` 会话事件。注册为 `ctx.gauntlet`。

## API

`GauntletRuntime`（挂载为 `ctx.gauntlet`，每个上下文一个实例）：

- `run(scenario, session, attempt)` — 校验场景与回合号，经 `ctx.game` 游玩 `scenario.game`，把分数与 `scenario.bar` 比较（`passed = score >= bar`），并向 `session` 追加一个 `gauntlet/round` 事件。返回规范化后的 [`GauntletRound`](src/types.ts)，含追加事件的 seq。
- `nextAttempt(session, scenarioId)` — 该场景在该会话中下一轮将获得的回合号。
- `runLoop(session, plan)` — builder/critic 循环策略：把每个候选输入序列作为一轮游玩，把迄今最佳分数（以该场景先前已记录回合为种子）作为下一轮基线，并在首个达标回合停止。返回规范化后的 [`GauntletLoopResult`](src/types.ts)。
- `foldGauntletRounds(events)` — 持久化回合事实的纯重放折叠：回合数、最近判定与最佳分数及其回合号。

场景携带稳定 `id`（同一目标的所有回合共用）、游戏、固定脚本化输入、`bar` 与可选 `baseline`（此前最佳分数）。回合号必须是严格递增的正整数（按会话与场景），过期的回合号在游玩前即以 `GAUNTLET_STALE_ATTEMPT` 拒绝。其他错误码：`GAUNTLET_INVALID_SCENARIO_ID`、`GAUNTLET_INVALID_BAR`、`GAUNTLET_INVALID_BASELINE`、`GAUNTLET_INVALID_ATTEMPT`。

## `gauntlet/round` 会话事件

`gauntlet/round` 通过声明合并进入 `SessionEventMap`，且为 log-only（无 `surfaceOp`，绝不进入派生历史）：记录 `scenarioId`、`game`、`attempt`、`steps`、`score`、`bar`、可选 `baseline` 与 `passed`。包级不变量在追加处拦截，拒绝判定与分数/门槛关系矛盾、分数或门槛非有限、回合号非正的事件。恢复与分叉通过折叠日志还原循环位置。

builder/critic 循环策略以 `runLoop` 随包发布；由 builder agent 提出候选、门槛负责打分的 agent 侧迭代由既有原语组合而成（`@deepseek-ai/dsh-tool-gauntlet` 的 `gauntlet_round`、goal 回合、Ralph 循环、workflow 工具）；本包只拥有门槛、打分、回合顺序、循环策略与已记录事实。

## Model Experience

### Request context and condition

#### What the model sees

无直接上下文。回合分数只经 `@deepseek-ai/dsh-tool-game` 拥有的 `game_play` 工具结果触达模型；`gauntlet/round` 事件为 log-only，绝不进入派生历史。

#### Token effect

零直接 token 影响。

#### KV Cache effect

独立——追加 `gauntlet/round` 事件不会改变提示或工具 schema 组装，回合频繁变更不会使任何请求前缀失效。

## Known Limitations and Deferred Work

- **agent 侧迭代是组合而非调度** — `runLoop` 是模型无关的策略；让 builder agent 提出候选并在门槛通过时停止的循环仍是基于 goal/ralph/workflow 原语的示例接线，尚未成为产品功能。
- **进程内回合记忆** — 严格的回合顺序保存在内存中；重载后的进程须先折叠日志还原上次回合号，再进行下一次 `run`。
- **`baseline` 只记录、不比较** — 接缝记录基线但不输出差值、也不阻止回退；该策略属于未来的循环驱动。
