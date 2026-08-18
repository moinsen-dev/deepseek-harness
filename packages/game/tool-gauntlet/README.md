# @deepseek-ai/dsh-tool-gauntlet

English | [中文](README.zh.md)

Model-facing `gauntlet_round` tool over `ctx.gauntlet`. This package owns the schema, validation, formatting, and the cooperative timeout budget — never the scoring, which stays with the gauntlet runtime.

## The tool

`gauntlet_round({ scenarioId, game, inputs, bar, baseline? })` plays one candidate input sequence through `ctx.game`, and returns the assigned attempt, steps, score, bar, optional baseline, and the model-free verdict (`passed = score >= bar`). The runtime assigns strictly increasing attempt numbers per session and scenario, so the model iterates — propose, observe the scored result, propose a better sequence — without ever naming an attempt itself. Every round lands as a durable `gauntlet/round` session event.

## Config

- `enabled` (default `true`) — register `gauntlet_round`.
- `timeoutMs` (default `30000`) — the cooperative timeout budget; must be a positive integer.

## Model Experience

### Request context and condition

#### What the model sees

The `gauntlet_round` schema and description join prompt assembly whenever the tool is registered. Its model-visible contract is pinned in the generated [tool catalog](../../../docs/tool-catalog.md); this package contributes no system-prompt section beyond the schema.

#### Token effect

Fixed while the tool is registered: one tool schema plus its description, independent of game or scenario count.

#### KV Cache effect

Append-only stable prefix while the tool set is unchanged; disabling `gauntlet_round` changes the assembled tool schemas and invalidates reuse for that request onward.

## Known Limitations and Deferred Work

- **The model proposes strategies, not code** — candidate inputs come from the model or a builder agent; game-code edits are out of scope until an engine seam with reloadable game modules ships.
- **No dedicated UI card** — the tool falls back to the generic card; a score/verdict card is deferred.
