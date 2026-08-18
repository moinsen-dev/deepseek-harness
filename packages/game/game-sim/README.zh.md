# @deepseek-ai/dsh-game-sim

[English](README.md) | 中文

游戏能力接缝的内置确定性模拟游戏：向 `ctx.game` 注册 `coin-chase` 模块。

## Coin chase

`coin-chase` 是一个 3x3 网格模拟。玩家从左上角出发；每次输入为 `up`、`down`、`left`、`right` 之一。越界移动停在边缘，其他输入计为一步空操作，进入金币格可收取 10 分。三枚金币（固定在 `(0,2)`、`(1,1)`、`(2,0)`）全部收齐即结束——最高分 30。无随机、无时钟、无 I/O：相同输入序列必然产生相同的状态、分数与终态转换。

插件在加载时注册模块，并随 fiber 一起注销（HMR 安全）。导出：`COIN_CHASE_ID`、`COIN_CHASE_MOVES`、`COIN_CHASE_GRID_SIZE`、`COIN_SCORE`、`CoinChase`、`CoinChaseModule` 与 `CoinChaseState` 类型。

## Model Experience

### Request context and condition

#### What the model sees

无直接上下文。已注册模块只能通过 `@deepseek-ai/dsh-tool-game` 拥有的 `game_play` 与 `game_list` 工具触达；本包不贡献任何提示语段或工具 schema。

#### Token effect

零直接 token 影响。

#### KV Cache effect

独立——注册游戏从不参与提示或工具 schema 组装。

## Known Limitations and Deferred Work

- **单一游戏、固定规则** — 目前只有 `coin-chase`；网格尺寸、金币布局与计分是游戏内容而非配置。更多游戏或可配置场景包属于后续工作，不是接缝变更。
- **无渲染** — 状态是供工具结果与 gauntlet 计分的 JSON 快照，暂无视觉呈现。
