# @deepseek-ai/dsh-tool-game-build

[English](README.md) | 中文

面向模型的游戏创作工具，基于 `ctx.game`：`game_build` 在 `node:vm` 沙箱中编译纯 JavaScript 游戏源码，证明其确定性并实时注册；`game_remove` 卸载本工具构建的游戏。这是游戏循环的 builder 半边——配合游玩/打分工具，agent 现在可以创作全新游戏、试玩、对照门槛打分，并重建直至达标。

## 工具

- `game_build({ id, source })` — 源码是 CommonJS 风格的模块体，把 `module.exports.create` 设为返回 `{ step(input), state(), done(), score() }` 的工厂。沙箱不暴露任何其他内容：无 I/O、无计时器、除语言本身外无环境全局。工具编译源码、校验契约，并通过把探针输入游玩两次来证明确定性——两次运行必须在每个输入后对状态、分数与终态标志完全一致，因此随机性或时钟读取在构建期即被拒绝。探针结果（`probeSteps`/`probeScore`/`probeDone`）返回给模型。重建已有 id 会替换上一次构建。
- `game_remove({ id })` — 卸载由 `game_build` 构建的游戏；内置游戏与其他提供方的游戏不可移除。

构建归插件所有：卸载插件会回收它注册的全部构建（HMR 安全）。

## 配置

- `enabled`（默认 `true`）— 注册两个工具。
- `probe`（默认 `[up, down, left, right]`）— 确定性证明游玩两次的脚本化输入。

## Model Experience

### Request context and condition

#### What the model sees

工具注册后，`game_build` 与 `game_remove` 的 schema 和描述加入提示组装。其模型可见契约固定在生成的 [tool catalog](../../../docs/tool-catalog.md) 中；除 schema 外本包不贡献系统提示语段。

#### Token effect

两工具注册期间固定：两个工具 schema 加描述，与已有游戏数量无关。

#### KV Cache effect

工具集不变时保持稳定的可复用前缀；禁用某工具会改变组装的工具 schema，使该请求起缓存复用失效。

## Known Limitations and Deferred Work

- **仅纯 JavaScript** — vm 沙箱运行 JavaScript 而非 TypeScript；创作模型必须自行去掉类型注解。
- **行为确定性而非静态隔离** — 沙箱不暴露 I/O，但真正的保证是确定性探针；两次探针一致、第三次翻转的游戏无法在构建期检测。
- **进程级注册** — 构建的游戏在被移除或插件卸载前对进程内每个 agent 可见；按 agent 隔离的构建作用域待做。
