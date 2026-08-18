# @deepseek-ai/dsh-tool-game

English | [中文](README.zh.md)

Model-facing game tools over `ctx.game`: `game_play` and `game_list`. This package owns schemas, validation, formatting, and the cooperative timeout budget — never concrete games.

## Tools

- `game_play` — plays one registered game with a scripted input sequence and returns steps applied, final state, objective score, and the terminal flag. The same input sequence with the same game code always yields the same result, so it verifies game behavior after edits.
- `game_list` — lists registered game ids.

An enabled tool remains visible when its target is unusable and fails with a structured error at execution time (`GAME_UNKNOWN_GAME` for an unregistered id). `game_play` carries a cooperative timeout budget (`playTimeoutMs`, default `30000`) enforced by `@deepseek-ai/dsh-tool-call-timeout-policy`; `game_list` is synchronous and has no deadline.

## Config

- `play` (default `true`) — register `game_play`.
- `list` (default `true`) — register `game_list`.
- `playTimeoutMs` (default `30000`) — the `game_play` timeout budget; must be a positive integer.

## Model Experience

### Request context and condition

#### What the model sees

The `game_play` and `game_list` schemas and descriptions join prompt assembly whenever the tools are registered. Their model-visible contracts are pinned in the generated [tool catalog](../../../docs/tool-catalog.md); this package contributes no system-prompt section beyond the schemas.

#### Token effect

Fixed while both tools are registered: two tool schemas plus their descriptions, independent of the number of registered games. Disabling a tool removes only its schema tokens.

#### KV Cache effect

Append-only stable prefix while the tool set is unchanged; disabling `play` or `list` changes the assembled tool schemas and invalidates reuse for that request onward.

## Known Limitations and Deferred Work

- **String inputs only** — the model-facing `inputs` array accepts move strings, not arbitrary JSON scripted inputs, even though the seam accepts any `JsonValue`.
- **No dedicated UI card** — both tools fall back to the generic tool card; a score/state card is deferred.
- **`game_list` has no deadline** — listing is synchronous and cheap, so no timeout is declared; a future remote game directory would need one.
