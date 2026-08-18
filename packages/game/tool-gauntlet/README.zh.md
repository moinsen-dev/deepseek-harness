# @deepseek-ai/dsh-tool-gauntlet

[English](README.md) | 中文

面向模型的 `gauntlet_round` 工具，基于 `ctx.gauntlet`。本包拥有 schema、校验、格式化与协作式超时预算——从不拥有打分，打分归 gauntlet 运行时所有。

## 工具

`gauntlet_round({ scenarioId, game, inputs, bar, baseline? })` 经 `ctx.game` 游玩一个候选输入序列，返回分配到的回合号、步数、分数、门槛、可选基线，以及模型无关的判定（`passed = score >= bar`）。运行时按会话与场景分配严格递增的回合号，因此模型可以迭代——提出、观察打分结果、提出更好的序列——而无需自己指定回合号。每一轮都会作为持久化的 `gauntlet/round` 会话事件落盘。

## 配置

- `enabled`（默认 `true`）— 注册 `gauntlet_round`。
- `timeoutMs`（默认 `30000`）— 协作式超时预算；必须为正整数。

## Model Experience

### Request context and condition

#### What the model sees

工具注册后，`gauntlet_round` 的 schema 和描述加入提示组装。其模型可见契约固定在生成的 [tool catalog](../../../docs/tool-catalog.md) 中；除 schema 外本包不贡献系统提示语段。

#### Token effect

工具注册期间固定：一个工具 schema 加描述，与游戏或场景数量无关。

#### KV Cache effect

工具集不变时保持稳定的可复用前缀；禁用 `gauntlet_round` 会改变组装的工具 schema，使该请求起缓存复用失效。

## Known Limitations and Deferred Work

- **模型提出的是策略而非代码** — 候选输入来自模型或 builder agent；在可热载游戏模块的引擎 seam 发布前，游戏代码编辑不在范围内。
- **无专属 UI 卡片** — 工具回退到通用卡片；分数/判定卡片待做。
