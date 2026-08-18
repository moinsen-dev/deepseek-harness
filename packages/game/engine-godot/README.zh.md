# @deepseek-ai/dsh-engine-godot

[English](README.md) | 中文

游戏能力接缝的 Godot-headless 追踪提供方：每个已配置场景在加载时**只经引擎运行一次**，确定性 NDJSON 追踪以可玩模块注册到 `ctx.game`。模型试玩、游玩工具与 gauntlet 循环随后重放真实引擎结果，无需每步都启动实时引擎。

## 场景如何变成游戏

对每个 `scenarios` 条目，提供方启动

```
<godotPath> --headless --path <projectDir> --script <runner> <inputs-json>
```

runner 脚本为每个脚本化输入打印一行 NDJSON——`{"state": <json>, "score": <number>, "done": <boolean>}`——并以 0 退出。提供方校验每一行（无损 JSON 状态、有限分数、单调终态标志），随后以场景 id 注册 `TraceGameModule`。引擎缺失、非零退出或追踪畸形都会使提供方加载失败；接缝永远不会看到注册一半的场景集合。

注册模块确定性重放追踪：输入推进已记录轨迹（输入内容不再重新求值），较少输入重放前缀，多余输入钳制在最后一条。模块契约保持同步——异步引擎交互只在加载时发生一次，而非每步一次。

## 配置

| 键 | 默认 | 含义 |
|---|---|---|
| `godotPath` | `godot` | Godot 可执行文件。 |
| `graceMs` | `30000` | 单次引擎运行的终止升级宽限；必须为正整数。 |
| `scenarios` | `[]` | 需要追踪并注册的 `{ id, projectDir, runner, inputs }` 条目；空列表不注册任何内容。 |

## Model Experience

### Request context and condition

#### What the model sees

无直接上下文。被追踪模块只能通过其他包拥有的 `game_play`、`game_list` 与 `gauntlet_round` 工具触达；本包不贡献任何提示语段或工具 schema。

#### Token effect

零直接 token 影响。

#### KV Cache effect

独立——注册追踪模块从不参与提示或工具 schema 组装。

## Known Limitations and Deferred Work

- **每场景仅在加载时运行一次引擎** — 每步实时引擎交互待做；场景变更通过重载提供方生效，而非运行中改游戏。
- **runner 协议是集成点** — 游戏项目须提供符合 NDJSON 契约的 runner 脚本；尚无场景内省或资源管线。
- **引擎不可用会使加载失败** — 按设计，挂载场景但找不到 Godot 二进制的部署会在加载时大声失败。
