# Agent Note: fork-only development with weekly upstream rebases

Status: implemented

[English](2026-08-18-fork-sync-strategy.md) | 中文

## Problem

本仓库是 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 的私有 fork。我们不会向上游仓库提交任何 pull request，但上游更新必须持续流入：上游处于开发者预览阶段，会刻意做出破坏兼容性的变更，因此 fork 必须持续跟踪它，否则会腐烂。fork 的差异——游戏能力组（`packages/game/`、`examples/gamedev-agent/`）——必须保持小巧、可审查、可分离，让将来提取为树外插件仓库始终是一个机械步骤。

## Decision

fork 的 `master` 维护为**upstream/master 加上 rebase 在其上的 fork 自有提交**。上游永不合并进 fork；fork 也永不合并进上游。`scripts/sync-upstream.sh` 执行每周同步：fetch、在临时分支上 rebase 到 `upstream/master`、运行聚焦门禁（`packages/game` 测试、`doc-sync`、lint、host typecheck），并且只在 `--push` 时以 `--force-with-lease=fork/master:<rebase 前 OID>` 发布。启用 git rerere（`rerere.enabled`、`rerere.autoupdate`），让反复出现的冲突解法自动重放。

fork 自有提交行是：四个游戏能力提交、同步脚本与本条说明。`master` 上其余一切属于上游，本地绝不改动。

### 冲突操作手册

冲突是可预测的，因为 fork 恰好只触碰以下上游高频变更面：

| 冲突面 | 解法 |
|---|---|
| `docs/tool-catalog.md`、`docs/config-catalog.md`、`docs/persistence-catalog.md`、`docs/capability-seams.md`、`docs/module-graph.md`、`docs/event-producer-consumer.md` | 完全采用上游一侧，然后重新运行生成器（`gen-tool-catalog`、`gen-config-catalog`、`gen-persistence-catalog`、`gen-doc-graphs`、`gen-module-graph`、`gen-cordis-catalog`），并把生成区域镜像到 `.zh.md` 对侧；用 `verify-translation-pairing --write` 重新记录每个变更配对。绝不手工合并生成内容。 |
| `packages/core/tools/tests/gen-tool-catalog.spec.ts` | 上游的固定工具清单变了——采用上游清单，再按序补入 `game_list`、`game_play`、`gauntlet_round`。 |
| `tsconfig.base.json`、`tsconfig.host.json`、`knip.json`、`examples/package.json` | 机械处理：把游戏组的条目（通配符、引用、knip 块、依赖行）重新套到上游新条目旁边。 |
| `packages/game/**`、`examples/gamedev-agent/**` | 实际上无冲突：该组是全新的、自包含的，不触碰任何外来文件——这就是 seam 拆分带来的回报。 |

## Alternatives considered

- **定期把 `upstream/master` 合并进 fork** — 拒绝：交叉合并会累积无法重放、无法审查、无法提取的交织历史；差异会无界增长，而不是保持一组固定的少量提交。
- **用 cherry-pick 上游发布维护一个私有上游-PR 分支** — 拒绝：cherry-pick 整棵树与 rebase 工作量相同，却缺少归因与 rerere 支持。
- **把上游 vendoring 进 fork 子树** — 拒绝：在第二个仓库里复制整个 harness，并破坏已发布 `@deepseek-ai/dsh-*` 生态的模块身份。

## Consequences

每次同步都是一次有界、可审查的操作，其唯一反复出现的成本就是上述已知冲突面。付出的代价：fork 的 `master` 历史每周被重写，因此任何 fork/master 的克隆或下游引用都必须重新 fetch 而非 fast-forward——可接受，因为 fork 没有外部消费方。长期出口是在上游发布稳定的 npm 版本线后提取为树外插件仓库；在此之前，fork 的游戏包留在这里，因为它们消费的预览期内部接口尚未上架 registry。
