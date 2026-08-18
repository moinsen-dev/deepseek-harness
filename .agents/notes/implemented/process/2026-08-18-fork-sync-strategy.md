# Agent Note: fork-only development with weekly upstream rebases

Status: implemented

English | [中文](2026-08-18-fork-sync-strategy.zh.md)

## Problem

This repository is a private fork of [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness). No pull requests will be opened against the upstream repository, but upstream updates must keep flowing in: upstream is a developer preview with deliberate compatibility-breaking changes, so the fork has to track it continuously or rot. The fork's divergence — the game capability group (`packages/game/`, `examples/gamedev-agent/`) — must stay small, reviewable, and separable so the extraction into an out-of-tree plugin repository stays a mechanical step.

## Decision

The fork's `master` is maintained as **upstream/master plus the fork-owned commits rebased on top**. Upstream is never merged into the fork; the fork is never merged into upstream. `scripts/sync-upstream.sh` performs the weekly sync: fetch, rebase onto `upstream/master` on a scratch branch, run the focused gates (`packages/game` tests, `doc-sync`, lint, host typecheck), and — only with `--push` — publish with `--force-with-lease=fork/master:<pre-rebase-oid>`. Git rerere (`rerere.enabled`, `rerere.autoupdate`) is enabled so recurring conflict resolutions replay automatically.

The fork-owned commit line is: the four game-capability commits, the sync script, and this note. Everything else on `master` belongs to upstream and must never be edited locally.

### Conflict playbook

Conflicts are predictable because the fork touches exactly these upstream-churned surfaces:

| Surface | Resolution |
|---|---|
| `docs/tool-catalog.md`, `docs/config-catalog.md`, `docs/persistence-catalog.md`, `docs/capability-seams.md`, `docs/module-graph.md`, `docs/event-producer-consumer.md` | Take upstream's side entirely, then re-run the generators (`gen-tool-catalog`, `gen-config-catalog`, `gen-persistence-catalog`, `gen-doc-graphs`, `gen-module-graph`, `gen-cordis-catalog`) and mirror the generated regions into the `.zh.md` counterparts; re-record every changed pair with `verify-translation-pairing --write`. Never hand-merge generated content. |
| `packages/core/tools/tests/gen-tool-catalog.spec.ts` | Upstream's pinned tool list changed — take upstream's list, then append `game_list`, `game_play`, `gauntlet_round` in sorted position. |
| `tsconfig.base.json`, `tsconfig.host.json`, `knip.json`, `examples/package.json` | Mechanical: re-apply the game-group entries (wildcards, references, knip blocks, dependency rows) next to upstream's new entries. |
| `packages/game/**`, `examples/gamedev-agent/**` | Effectively conflict-free: the group is new, self-contained, and touches no foreign files — this is the seam split paying for itself. |

## Alternatives considered

- **Periodic `git merge upstream/master` into the fork** — rejected: cross-merges accumulate an interleaved history that cannot be replayed, reviewed, or extracted; the divergence would grow unboundedly instead of staying a fixed small set of commits.
- **A private upstream-PR branch tracked by cherry-picking upstream releases** — rejected: cherry-picking a whole tree is the same work as a rebase with worse attribution and no rerere support.
- **Vendoring upstream into the fork subtree** — rejected: duplicates the entire harness in a second repository and breaks module identity for the published `@deepseek-ai/dsh-*` ecosystem.

## Consequences

Every sync is a bounded, reviewable operation whose only recurring cost is the known conflict surface above. The cost paid: the fork's `master` history is rewritten weekly, so any clone or downstream reference of fork/master must re-fetch rather than fast-forward — acceptable because the fork has no external consumers. The long-term exit is the extraction into an out-of-tree plugin repository once upstream publishes a stable npm line; until then the fork's game packages stay here because they consume preview-stage internals that are not yet on the registry.
