# gamedev-agent

English | [中文](README.zh.md)

Runnable demo of the Phase-0/1 game-developer composition: a one-shot agent that plays and scores its own games through the game capability seam, the gauntlet loop, and the model-driven `gauntlet_round` tool.

`cordis.yml` composes `dsh-agent-spine-demo` with `dsh-game`, `dsh-game-sim`, `dsh-tool-game`, `dsh-tool-gauntlet`, and `dsh-game-gauntlet`. The test drivers pre-score gauntlet rounds (one fails the bar, one passes) and one builder/critic loop (three candidates, the third reaches the bar), then let the model play `coin-chase` or drive a round itself.

## Tests

- `tests/keyless-smoke.e2e.ts` — boots the real Loader tree with mock LLMs: the two-round gauntlet plus two `game_play` calls, and the builder/critic loop plus one model-driven `gauntlet_round`.
- `tests/gamedev.snapshot.ts` — keyless snapshots pinning both canonical streams; refresh with `DSH_SNAPSHOT=refresh`.
- `tests/real-model.e2e.ts` — with-key smoke; self-skips without `DEEPSEEK_API_KEY`.

## Files

- `cordis.yml` — the live composition (DeepSeek adapter, agent spine, game packages, persistence).
- `tests/fixtures/cli.cordis.yml` — keyless overlay: mock LLM, patched agent spine, session root.
- `tests/fixtures/cli-loop.cordis.yml` — keyless overlay for the builder/critic loop scenario.
- `tests/fixtures/gamedev-mock-llm.ts` — scripted adapter: a losing `game_play`, then a winning one, then a final answer.
- `tests/fixtures/gamedev-loop-mock-llm.ts` — scripted adapter: one model-driven `gauntlet_round`, then a final answer.
- `tests/fixtures/gauntlet-driver.ts` — Loader driver: two scripted gauntlet rounds, then one fixture turn as canonical JSONL.
- `tests/fixtures/gauntlet-loop-driver.ts` — Loader driver: one builder/critic loop (fail, fail, pass), then one fixture turn as canonical JSONL.
