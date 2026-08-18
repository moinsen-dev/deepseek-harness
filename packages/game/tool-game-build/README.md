# @deepseek-ai/dsh-tool-game-build

English | [中文](README.zh.md)

Model-facing game authoring tools over `ctx.game`: `game_build` compiles a plain-JavaScript game source in a `node:vm` sandbox, proves it deterministic, and registers it live; `game_remove` unloads a game this tool built. This is the builder half of the game loop — paired with the play/score tools, an agent can now author a brand-new game, playtest it, score it against a bar, and rebuild until the bar falls.

## The tools

- `game_build({ id, source })` — the source is a CommonJS-style module body that sets `module.exports.create` to a factory returning `{ step(input), state(), done(), score() }`. The sandbox exposes nothing else: no I/O, no timers, no ambient globals beyond the language. The tool compiles the source, validates the contract, and proves determinism by playing the probe inputs twice — two runs must agree on state, score, and terminal flag after every input, so randomness or clock reads are rejected at build time. The probe outcome comes back to the model (`probeSteps`/`probeScore`/`probeDone`). Rebuilding an existing id replaces the previous build.
- `game_remove({ id })` — unloads a game built by `game_build`; built-in games and games from other providers are not removable.

Builds are owned by the plugin: unloading it disposes every build it registered (HMR-safe).

## Config

- `enabled` (default `true`) — register both tools.
- `probe` (default `[up, down, left, right]`) — the scripted inputs the determinism proof plays twice.

## Model Experience

### Request context and condition

#### What the model sees

The `game_build` and `game_remove` schemas and descriptions join prompt assembly whenever the tools are registered. Their model-visible contracts are pinned in the generated [tool catalog](../../../docs/tool-catalog.md); this package contributes no system-prompt section beyond the schemas.

#### Token effect

Fixed while both tools are registered: two tool schemas plus their descriptions, independent of how many games exist.

#### KV Cache effect

Append-only stable prefix while the tool set is unchanged; disabling a tool changes the assembled tool schemas and invalidates reuse for that request onward.

## Known Limitations and Deferred Work

- **Plain JavaScript only** — the vm sandbox runs JavaScript, not TypeScript; type annotations must be stripped by the authoring model.
- **Behavioral determinism, not static isolation** — the sandbox exposes no I/O, but the determinism probe is the real guarantee; a game that passes the probe twice but flips on a third play is not detectable at build time.
- **Process-global registration** — a built game is playable by every agent in the process until removed or the plugin unloads; per-agent build scoping is deferred.
