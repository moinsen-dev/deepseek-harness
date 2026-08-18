# gamedev-agent

English | [中文](README.zh.md)

Runnable demo of the game-developer composition: a one-shot agent that plays and scores its own games through the game capability seam, the gauntlet loop, the model-driven `gauntlet_round` tool, and a Ralph loop of fresh builder children.

`cordis.yml` composes `dsh-agent-spine-demo` with `dsh-game`, `dsh-game-sim` (`coin-chase` and `gold-run`), `dsh-tool-game`, `dsh-tool-gauntlet`, and `dsh-game-gauntlet`. The test drivers pre-score gauntlet rounds, run one builder/critic loop, and run one Ralph loop whose fresh children score `gold-run` gauntlet rounds (round 1 misses the bar on a mine, round 2 passes on a mine-free path).

## Tests

- `tests/keyless-smoke.e2e.ts` — boots the real Loader tree with mock LLMs: the two-round gauntlet plus two `game_play` calls, the builder/critic loop plus one model-driven `gauntlet_round`, and the Ralph loop whose two fresh children score `gold-run` rounds until the bar passes.
- `tests/gamedev.snapshot.ts` — keyless snapshots pinning all three canonical streams; refresh with `DSH_SNAPSHOT=refresh`.
- `tests/real-model.e2e.ts` — with-key smoke; self-skips without `DEEPSEEK_API_KEY`.

## Files

- `cordis.yml` — the live composition (DeepSeek adapter, agent spine, game packages, persistence).
- `tests/fixtures/cli.cordis.yml` — keyless overlay: mock LLM, patched agent spine, session root.
- `tests/fixtures/cli-loop.cordis.yml` — keyless overlay for the builder/critic loop scenario.
- `tests/fixtures/ralph.cordis.yml` — keyless overlay adding the workflow engine, the spawn subagent provider, and the `ralph` tool.
- `tests/fixtures/gamedev-mock-llm.ts` — scripted adapter: a losing `game_play`, then a winning one, then a final answer.
- `tests/fixtures/gamedev-loop-mock-llm.ts` — scripted adapter: one model-driven `gauntlet_round`, then a final answer.
- `tests/fixtures/gamedev-ralph-mock-llm.ts` — scripted adapter: the parent runs one `ralph` call; each fresh child scores one `gauntlet_round` (miss, then pass) and reports through `structured_output`.
- `tests/fixtures/gauntlet-driver.ts` — Loader driver: two scripted gauntlet rounds, then one fixture turn as canonical JSONL.
- `tests/fixtures/gauntlet-loop-driver.ts` — Loader driver: one builder/critic loop (fail, fail, pass), then one fixture turn as canonical JSONL.
- `tests/fixtures/ralph-driver.ts` — Loader driver: one fixture turn whose parent runs a Ralph loop as canonical JSONL.
