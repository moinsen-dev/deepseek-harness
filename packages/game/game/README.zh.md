# @deepseek-ai/dsh-game

[English](README.md) | 中文

游戏能力接缝的 Service Definition：确定性可玩游戏模块的注册表加上有界试玩执行，注册为 `ctx.game`。

## API

`GameRuntime`（挂载为 `ctx.game`，每个上下文一个实例）：

- `registerModule(module)` — 以稳定 `id` 注册一个 `GameModule`；重复 id 抛出错误码为 `GAME_DUPLICATE_MODULE` 的 `GameError`。返回注销器；注册也随所属 fiber 一起回收。
- `list()` — 按注册顺序列出全部模块。
- `play(request, signal?)` — 通过 `request.game` 指定的模块按顺序应用 `request.inputs`，返回规范化后的 `PlaytestResult`；实例报告 `done()` 或输入耗尽时提前停止；每个输入应用前检查 `signal`（协作式取消）。

配置：`maxSteps`（默认 `1000`）限制单次运行可应用的输入数量；超限请求在运行前即以 `GAME_STEP_LIMIT_EXCEEDED` 拒绝。

接缝拥有的错误码：`GAME_DUPLICATE_MODULE`、`GAME_UNKNOWN_GAME`、`GAME_STEP_LIMIT_EXCEEDED`、`GAME_ABORTED`、`GAME_INVALID_STATE`、`GAME_INVALID_SCORE`。

## 游戏模块契约

[`GameModule`](src/types.ts) 是带有稳定 `id` 的工厂；`create()` 每次运行返回一个新的 [`GameInstance`](src/types.ts)，因此场景不会观察到上一次运行的状态。实现必须确定：相同输入序列产生相同的状态、分数与终态转换。

- `state(): JsonValue` — 当前可观察状态；每次应用输入后做无损 JSON 快照与校验（非法状态以 `GAME_INVALID_STATE` 终止运行）。
- `step(input: JsonValue)` — 应用一个脚本化输入。
- `done(): boolean` — 终态条件；一旦成立，接缝停止继续步进。
- `score(): number` — 客观分数，越高越好；最终分数非有限值时以 `GAME_INVALID_SCORE` 终止运行。

## 设计说明

接缝刻意保持无会话依赖（与 `ctx.web` 相同）：它既不读取也不追加会话状态，由消费方决定记录什么——`@deepseek-ai/dsh-tool-game` 把试玩结果作为工具值返回，`@deepseek-ai/dsh-game-gauntlet` 追加持久化的 `gauntlet/round` 会话事件。提供方选择只按游戏 id，从不依赖注册顺序。

## Model Experience

### Request context and condition

#### What the model sees

无直接上下文。模型只能通过 `@deepseek-ai/dsh-tool-game` 拥有的 `game_play` 与 `game_list` 工具触达已注册游戏；本包不贡献任何提示语段或工具 schema。

#### Token effect

零直接 token 影响。

#### KV Cache effect

独立——游戏注册不参与提示或工具 schema 组装，挂载或卸载模块不会使任何请求前缀失效。

## Known Limitations and Deferred Work

- **仅同步、同进程模块** — `GameInstance.step` 是同步的，基于网络的引擎（如 Godot/Unreal 提供方）暂无法适配当前契约。Phase 1 将把 `play` 改为异步并在同一接缝后增加引擎提供方。
- **仅请求级上限** — 没有按游戏设置的步数预算；`maxSteps` 统一约束整次运行。
