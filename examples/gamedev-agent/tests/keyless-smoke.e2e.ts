import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

const binScript = fileURLToPath(new URL('./fixtures/gauntlet-driver.ts', import.meta.url))
const configPath = fileURLToPath(new URL('./fixtures/cli.cordis.yml', import.meta.url))
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
})
