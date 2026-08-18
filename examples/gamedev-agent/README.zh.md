# gamedev-agent

[English](README.md) | 中文

Phase-0/1 游戏开发者组合的可运行演示：一个一次性 Agent，通过游戏能力接缝、gauntlet 循环与模型驱动的 `gauntlet_round` 工具游玩并给自己的游戏打分。

`cordis.yml` 把 `dsh-agent-spine-demo` 与 `dsh-game`、`dsh-game-sim`、`dsh-tool-game`、`dsh-tool-gauntlet`、`dsh-game-gauntlet` 组合在一起。测试驱动预打两轮 gauntlet（一轮未达标、一轮达标）和一次 builder/critic 循环（三个候选，第三个达标），随后让模型游玩 `coin-chase` 或亲自驱动一轮。

## 测试

- `tests/keyless-smoke.e2e.ts` — 用 mock LLM 启动真实 Loader 树：两轮 gauntlet 加两次 `game_play` 调用，以及 builder/critic 循环加一次模型驱动的 `gauntlet_round`。
- `tests/gamedev.snapshot.ts` — 无密钥快照，固定两条规范事件流；用 `DSH_SNAPSHOT=refresh` 刷新。
- `tests/real-model.e2e.ts` — 带密钥冒烟测试；无 `DEEPSEEK_API_KEY` 时自动跳过。

## 文件

- `cordis.yml` — 真实组合（DeepSeek 适配器、Agent 主干、游戏包、持久化）。
- `tests/fixtures/cli.cordis.yml` — 无密钥覆盖层：mock LLM、改写后的 Agent 主干、会话目录。
- `tests/fixtures/cli-loop.cordis.yml` — builder/critic 循环场景的无密钥覆盖层。
- `tests/fixtures/gamedev-mock-llm.ts` — 脚本化适配器：先输一次 `game_play`，再赢一次，最后给出回答。
- `tests/fixtures/gamedev-loop-mock-llm.ts` — 脚本化适配器：一次模型驱动的 `gauntlet_round`，然后给出回答。
- `tests/fixtures/gauntlet-driver.ts` — Loader 驱动：两轮脚本化 gauntlet，随后以规范 JSONL 输出一个 fixture 回合。
- `tests/fixtures/gauntlet-loop-driver.ts` — Loader 驱动：一次 builder/critic 循环（未达标、未达标、达标），随后以规范 JSONL 输出一个 fixture 回合。
