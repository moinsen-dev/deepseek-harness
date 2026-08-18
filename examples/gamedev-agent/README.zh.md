# gamedev-agent

[English](README.md) | 中文

Phase-0 游戏开发者组合的可运行演示：一个一次性 Agent，通过游戏能力接缝与 gauntlet 循环游玩并给自己的游戏打分。

`cordis.yml` 把 `dsh-agent-spine-demo` 与 `dsh-game`、`dsh-game-sim`、`dsh-tool-game`、`dsh-game-gauntlet` 组合在一起。测试驱动先预打两轮 gauntlet（一轮未达标、一轮达标），随后让模型用 `game_play` 游玩 `coin-chase`。

## 测试

- `tests/keyless-smoke.e2e.ts` — 用 mock LLM 启动真实 Loader 树，断言两轮 gauntlet、两次 `game_play` 工具调用与最终回答。
- `tests/gamedev.snapshot.ts` — 无密钥快照，固定同一运行的规范事件流；用 `DSH_SNAPSHOT=refresh` 刷新。
- `tests/real-model.e2e.ts` — 带密钥冒烟测试；无 `DEEPSEEK_API_KEY` 时自动跳过。

## 文件

- `cordis.yml` — 真实组合（DeepSeek 适配器、Agent 主干、游戏包、持久化）。
- `tests/fixtures/cli.cordis.yml` — 无密钥覆盖层：mock LLM、改写后的 Agent 主干、会话目录。
- `tests/fixtures/gamedev-mock-llm.ts` — 脚本化适配器：先输一次 `game_play`，再赢一次，最后给出回答。
- `tests/fixtures/gauntlet-driver.ts` — Loader 驱动：两轮脚本化 gauntlet，随后以规范 JSONL 输出一个 fixture 回合。
