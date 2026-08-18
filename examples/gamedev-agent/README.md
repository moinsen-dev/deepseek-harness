# gamedev-agent

English | [中文](README.zh.md)

Runnable demo of the Phase-0 game-developer composition: a one-shot agent that plays and scores its own games through the game capability seam and the gauntlet loop.

`cordis.yml` composes `dsh-agent-spine-demo` with `dsh-game`, `dsh-game-sim`, `dsh-tool-game`, and `dsh-game-gauntlet`. The test driver pre-scored two gauntlet rounds (one fails the bar, one passes) and then lets the model play `coin-chase` with `game_play`.

## Tests

- `tests/keyless-smoke.e2e.ts` — boots the real Loader tree with a mock LLM and asserts two gauntlet rounds plus two `game_play` tool calls and their final answer.
- `tests/gamedev.snapshot.ts` — keyless snapshot pinning the canonical stream of the same run; refresh with `DSH_SNAPSHOT=refresh`.
- `tests/real-model.e2e.ts` — with-key smoke; self-skips without `DEEPSEEK_API_KEY`.

## Files

- `cordis.yml` — the live composition (DeepSeek adapter, agent spine, game packages, persistence).
- `tests/fixtures/cli.cordis.yml` — keyless overlay: mock LLM, patched agent spine, session root.
- `tests/fixtures/gamedev-mock-llm.ts` — scripted adapter: a losing `game_play`, then a winning one, then a final answer.
- `tests/fixtures/gauntlet-driver.ts` — Loader driver: two scripted gauntlet rounds, then one fixture turn as canonical JSONL.
