# @deepseek-ai/dsh-tool-game

[English](README.md) | 中文

面向模型的 `ctx.game` 游戏工具：`game_play` 与 `game_list`。本包拥有 schema、校验、格式化与协作式超时预算——从不拥有具体游戏。

## 工具

- `game_play` — 以脚本化输入序列游玩一个已注册游戏，返回已应用步数、最终状态、客观分数与终态标志。相同输入序列加相同游戏代码必然得到相同结果，因此可用于在修改后验证游戏行为。
- `game_list` — 列出已注册的游戏 id。

已启用的工具在目标不可用时保持可见，并在执行时报结构化错误（未注册 id 为 `GAME_UNKNOWN_GAME`）。`game_play` 带有协作式超时预算（`playTimeoutMs`，默认 `30000`），由 `@deepseek-ai/dsh-tool-call-timeout-policy` 执行；`game_list` 为同步操作，无截止时间。

## 配置

- `play`（默认 `true`）— 注册 `game_play`。
- `list`（默认 `true`）— 注册 `game_list`。
- `playTimeoutMs`（默认 `30000`）— `game_play` 的超时预算；必须为正整数。

## Model Experience

### Request context and condition

#### What the model sees

工具注册后，`game_play` 与 `game_list` 的 schema 和描述加入提示组装。其模型可见契约固定在生成的 [tool catalog](../../../docs/tool-catalog.md) 中；除 schema 外本包不贡献系统提示语段。

#### Token effect

两工具均注册时固定：两个工具 schema 加描述，与已注册游戏数量无关。禁用某工具只移除其 schema token。

#### KV Cache effect

工具集不变时保持稳定的可复用前缀；禁用 `play` 或 `list` 会改变组装的工具 schema，使该请求起缓存复用失效。

## Known Limitations and Deferred Work

- **仅字符串输入** — 面向模型的 `inputs` 数组只接受移动字符串，不接受任意 JSON 脚本化输入，尽管接缝接受任意 `JsonValue`。
- **无专属 UI 卡片** — 两个工具回退到通用工具卡片；分数/状态卡片待做。
- **`game_list` 无截止时间** — 列表操作同步且廉价，故未声明超时；未来的远程游戏目录将需要。
