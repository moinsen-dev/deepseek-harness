import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

const binScript = fileURLToPath(new URL('./fixtures/gauntlet-driver.ts', import.meta.url))
const loopBinScript = fileURLToPath(new URL('./fixtures/gauntlet-loop-driver.ts', import.meta.url))
const ralphBinScript = fileURLToPath(new URL('./fixtures/ralph-driver.ts', import.meta.url))
const buildBinScript = fileURLToPath(new URL('./fixtures/build-driver.ts', import.meta.url))
const configPath = fileURLToPath(new URL('./fixtures/cli.cordis.yml', import.meta.url))
const loopConfigPath = fileURLToPath(new URL('./fixtures/cli-loop.cordis.yml', import.meta.url))
const ralphConfigPath = fileURLToPath(new URL('./fixtures/ralph.cordis.yml', import.meta.url))
const buildConfigPath = fileURLToPath(new URL('./fixtures/build.cordis.yml', import.meta.url))
const tsconfigPath = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))

describe('gamedev-agent keyless smoke', () => {
  it('boots the real Loader tree, scores two gauntlet rounds, and runs two game_play tool calls', async () => {
    const { stdout, stderr } = await runLoaderSmoke({
      label: 'gamedev-agent',
      tempDirPrefix: 'gamedev-agent-smoke-',
      binScript,
      libBinScript: binScript,
      configPath,
      binArgs: [configPath, 'play coin-chase to collect every coin'],
      tsconfigPath,
    })
    const lines = stdout.trimEnd().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
    const events = lines.slice(0, -1).map(line => line['event'] as SessionEvent)
    const result = lines.at(-1)
    expect(stderr).toBe('')

    const rounds = events.filter(event => event.type === 'gauntlet/round')
    expect(rounds).toHaveLength(2)
    expect(rounds[0]?.data).toMatchObject({ scenarioId: 'collect-all', attempt: 1, score: 0, bar: 30, passed: false })
    expect(rounds[1]?.data).toMatchObject({ scenarioId: 'collect-all', attempt: 2, score: 30, bar: 30, passed: true, baseline: 0 })

    const calls = events.filter(event => event.type === 'tool/call' && event.data.name === 'game_play')
    expect(calls).toHaveLength(2)
    expect(events.filter(event => event.type === 'tool/result').some(event => JSON.stringify(event).includes('score 30'))).toBe(true)
    expect(result).toMatchObject({ type: 'result' })
    expect(String(result?.['output'])).toContain('GAMEDEV tool round trip complete')
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)

  it('runs the builder/critic loop until the bar passes and then scores one model-driven round', async () => {
    const { stdout, stderr } = await runLoaderSmoke({
      label: 'gamedev-agent loop',
      tempDirPrefix: 'gamedev-agent-loop-smoke-',
      binScript: loopBinScript,
      libBinScript: loopBinScript,
      configPath: loopConfigPath,
      binArgs: [loopConfigPath, 'propose a strategy that reaches the bar'],
      tsconfigPath,
    })
    const lines = stdout.trimEnd().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
    const events = lines.slice(0, -1).map(line => line['event'] as SessionEvent)
    const result = lines.at(-1)
    expect(stderr).toBe('')

    const rounds = events.filter(event => event.type === 'gauntlet/round')
    expect(rounds.map(round => round.data.attempt)).toEqual([1, 2, 3, 4])
    expect(rounds[1]?.data).toMatchObject({ score: 10, baseline: 0, passed: false })
    expect(rounds[2]?.data).toMatchObject({ score: 30, baseline: 10, passed: true })
    expect(rounds[3]?.data).toMatchObject({ attempt: 4, score: 0, bar: 30, passed: false })

    expect(events.filter(event => event.type === 'tool/call' && event.data.name === 'gauntlet_round')).toHaveLength(1)
    expect(result).toMatchObject({ type: 'result' })
    expect(String(result?.['output'])).toContain('GAMEDEV loop round trip complete')
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)

  it('runs a Ralph loop: two fresh children score gauntlet rounds until the bar passes', async () => {
    let persisted = ''
    const { stdout, stderr } = await runLoaderSmoke({
      label: 'gamedev-agent ralph',
      tempDirPrefix: 'gamedev-agent-ralph-smoke-',
      binScript: ralphBinScript,
      libBinScript: ralphBinScript,
      configPath: ralphConfigPath,
      binArgs: [ralphConfigPath, 'run a ralph loop to reach the gold-run bar'],
      tsconfigPath,
      processTimeoutMs: 60_000,
      inspect: async (cwd) => {
        const files = await readdir(join(cwd, '.sessions'), { recursive: true })
        for (const file of files) {
          if (!file.endsWith('.jsonl.zstd')) continue
          persisted += (await readFile(join(cwd, '.sessions', file))).subarray(0, 4).toString('hex')
        }
      },
    })
    const lines = stdout.trimEnd().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
    const events = lines.slice(0, -1).map(line => line['event'] as SessionEvent)
    const result = lines.at(-1)
    expect(stderr).toBe('')

    // Child sessions persist separately; the parent stream carries the ralph call and the verdict.
    expect(events.filter(event => event.type === 'tool/call' && event.data.name === 'ralph')).toHaveLength(1)
    const output = String(result?.['output'])
    expect(output).toContain('Ralph worker reported completion after 2 rounds')
    expect(output).toContain('gauntlet_round scored 30 against bar 20')
    expect(persisted.length).toBeGreaterThan(0)
    expect(result).toMatchObject({ type: 'result' })
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)

  it('builds a brand-new game, plays it, and reports the loop', async () => {
    const { stdout, stderr } = await runLoaderSmoke({
      label: 'gamedev-agent build',
      tempDirPrefix: 'gamedev-agent-build-smoke-',
      binScript: buildBinScript,
      libBinScript: buildBinScript,
      configPath: buildConfigPath,
      binArgs: [buildConfigPath, 'build a small counter game and play it'],
      tsconfigPath,
    })
    const lines = stdout.trimEnd().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
    const events = lines.slice(0, -1).map(line => line['event'] as SessionEvent)
    const result = lines.at(-1)
    expect(stderr).toBe('')

    expect(events.filter(event => event.type === 'tool/call' && event.data.name === 'game_build')).toHaveLength(1)
    expect(events.filter(event => event.type === 'tool/call' && event.data.name === 'game_play').some(
      event => JSON.stringify(event.data).includes('counter'),
    )).toBe(true)
    expect(events.filter(event => event.type === 'tool/result').some(
      event => JSON.stringify(event).includes('score 3'),
    )).toBe(true)
    expect(result).toMatchObject({ type: 'result' })
    expect(String(result?.['output'])).toContain('GAMEDEV build loop complete')
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
