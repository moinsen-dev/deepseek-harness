# Agent Note: The game capability seam and gauntlet loop PoC

Status: implemented

[English](2026-08-18-game-capability-seam-poc.md) | 中文

## Problem

DeepSeek Harness 是基于插件的 Harness，但已发布代码树中没有任何面向游戏开发的能力：没有模型可以试玩的游戏运行时，没有把试玩结果变成模型可见事实的工具，也没有把工作对照质量门槛打分（而非相信模型自我报告）的循环原语。游戏开发专用的 Harness 变体必须从 Harness 自身的扩展点长出这些能力——能力接缝、模型工具、会话事件与组合式循环原语——而不是做成 fork 或一个庞大的“游戏模式”。

## Decision

Phase-0 PoC 以新的 `packages/game/` 组发布，由 `examples/gamedev-agent` 演示：

- [`@deepseek-ai/dsh-game`](../../../../packages/game/game/README.md) 是 Service Definition：`ctx.game` 按稳定 id 注册确定性 `GameModule`（重复 id 大声失败），以配置的 `maxSteps` 上限执行脚本化输入序列，并把每个状态快照校验为无损 JSON、最终分数校验为有限值。接缝不依赖会话：记录什么由消费方决定。
- [`@deepseek-ai/dsh-game-sim`](../../../../packages/game/game-sim/README.md) 是第一个提供方：`coin-chase` 3x3 确定性模拟（四种移动、三枚固定金币、每枚 10 分、全部收齐即结束）与 `gold-run`——5x5 网格中的两枚地雷会结束运行，更大的无雷搜索空间让 builder 的首个候选通常错过门槛，迭代带来可见提升。
- [`@deepseek-ai/dsh-engine-godot`](../../../../packages/game/engine-godot/README.md) 是引擎提供方：每个已配置场景在加载时经 Godot headless 运行一次，校验后的确定性 NDJSON 追踪以同步重放模块注册——真实引擎结果进入同一接缝，每步实时引擎执行仍待做。
- [`@deepseek-ai/dsh-tool-game`](../../../../packages/game/tool-game/README.md) 是消费方：面向模型的 `game_play`（脚本化输入进，步数/状态/分数/终态出，带协作式超时）与 `game_list`。
- [`@deepseek-ai/dsh-game-gauntlet`](../../../../packages/game/game-gauntlet/README.md) 拥有 gauntlet 循环原语：`ctx.gauntlet.run(scenario, session, attempt)` 经接缝游玩，仅当 `score >= bar` 时判定回合通过（模型无关），强制回合号按会话与场景严格递增，并追加 log-only 的 `gauntlet/round` 会话事件。`nextAttempt` 暴露分配的回合编号，`runLoop(session, plan)` 随包发布 builder/critic 循环策略——候选输入序列逐轮打分、最佳分数作为基线传递、在首个达标回合停止——`foldGauntletRounds` 从日志恢复循环位置。包级不变量在追加处拦截，拒绝判定与门槛关系矛盾的回合。
- [`@deepseek-ai/dsh-tool-gauntlet`](../../../../packages/game/tool-gauntlet/README.md) 是面向模型的一半：`gauntlet_round` 提出一个候选策略，收到运行时分配的回合号与模型无关判定，因此模型按“提出 → 打分 → 提出”迭代，而无需自己指定回合号。
- [`@deepseek-ai/dsh-tool-game-build`](../../../../packages/game/tool-game-build/README.md) 是创作的一半：`game_build` 在 `node:vm` 沙箱中编译纯 JavaScript 游戏源码，校验模块契约，通过把探针输入游玩两次来证明确定性，并实时注册游戏；`game_remove` 卸载构建，重建已有 id 会替换上一次构建。循环就此完整：创作 → 试玩 → 门槛 → 重建。

agent 侧的 builder/critic 迭代刻意不作为新引擎发布：它由既有原语组合而成（goal 回合、Ralph 循环、workflow 工具），示例驱动演示了三种形态——两轮脚本化回合（未达标、随后达标）、一次 builder/critic 循环（三个候选、第三个达标）后再跟一次模型驱动的 `gauntlet_round`，以及一次 Ralph 循环——两个全新子代理为 `gold-run` 的 gauntlet 回合打分直至达标（第 1 轮踩雷、第 2 轮走无雷路径完成），和一次创作运行——用 `game_build` 构建全新 counter 游戏、用 `game_play` 游玩并报告循环。无密钥快照固定四种组装后的转录，真实模型冒烟测试验证事件流中的带分工具结果，而非模型的自我陈述。

## Alternatives considered

- **专用的 `gamedev` 应用或 profile fork** — 拒绝：fork 会把游戏工具冻结在插件树之外，profiles、presets 与 patches 都无法触及。以上全部是普通插件，因此日后可用 `--profile gamedev` bundle 叠加而不改接缝。
- **试玩结果作为模型可见的 surface 消息** — 拒绝：把每轮作为 `user/message` 注入会让打分搅动上下文与缓存。`gauntlet/round` 为 log-only；分数只经 `game_play` 工具结果触达模型。
- **带自己调度器的 gauntlet 引擎服务** — 拒绝：仓库已有 goal/ralph/workflow 迭代原语；第二个调度器会重复激活与取消语义。

## Consequences

接缝与循环让游戏变体在不触碰 `agent-loop` 的前提下获得三项必需性质：模型通过试玩验证游戏行为（确定性、可重放）、门槛比较模型无关且被记录、循环位置经会话日志在恢复与分叉后仍可还原。代价：模块契约是同步且同进程的（每步实时引擎执行待做；engine-godot 以加载期追踪桥接真实引擎）、agent 侧 builder/critic 迭代仍是示例接线而非被调度的产品功能、回合顺序为进程内状态，直到消费方通过折叠日志重新推导。
