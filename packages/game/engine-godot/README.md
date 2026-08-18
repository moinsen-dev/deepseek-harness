# @deepseek-ai/dsh-engine-godot

English | [中文](README.zh.md)

Godot-headless trace provider for the game capability seam: each configured scenario runs **once** through the engine at load, and the deterministic NDJSON trace registers with `ctx.game` as a playable module. Model playtesting, the play tools, and the gauntlet loop then replay real engine outcomes with no live engine per step.

## How a scenario becomes a game

For each `scenarios` entry the provider spawns

```
<godotPath> --headless --path <projectDir> --script <runner> <inputs-json>
```

The runner script prints one NDJSON line per scripted input — `{"state": <json>, "score": <number>, "done": <boolean>}` — and exits 0. The provider validates every line (lossless-JSON state, finite score, monotonic terminal flag), then registers a `TraceGameModule` under the scenario id. A missing engine, non-zero exit, or malformed trace fails the provider's load; the seam never sees a half-registered scenario set.

The registered module replays the trace deterministically: inputs advance the recorded trajectory (input content is not re-evaluated), fewer inputs replay the prefix, extra inputs clamp at the last entry. The module contract stays synchronous — the async engine interaction happens once at load, not per step.

## Config

| Key | Default | Meaning |
|---|---|---|
| `godotPath` | `godot` | The Godot executable. |
| `graceMs` | `30000` | Terminate-escalation grace for one engine run; must be a positive integer. |
| `scenarios` | `[]` | `{ id, projectDir, runner, inputs }` entries to trace and register; an empty list registers nothing. |

## Model Experience

### Request context and condition

#### What the model sees

No direct context. Traced modules reach the model only through the `game_play`, `game_list`, and `gauntlet_round` tools owned by other packages; this package contributes no prompt section and no tool schema.

#### Token effect

Zero-direct token effect.

#### KV Cache effect

Independent — registering trace modules never joins prompt or tool-schema assembly.

## Known Limitations and Deferred Work

- **One engine run per scenario at load** — live per-step engine interaction is deferred; a scenario change reloads the provider, not the game mid-run.
- **The runner protocol is the integration point** — game projects must ship a runner script matching the NDJSON contract; there is no scene introspection or asset pipeline yet.
- **Engine availability fails the load** — a deployment mounting scenarios without a reachable Godot binary fails loud at load by design.
