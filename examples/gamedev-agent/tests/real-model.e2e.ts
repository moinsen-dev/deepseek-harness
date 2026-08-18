import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

const binScript = fileURLToPath(new URL('./fixtures/gauntlet-driver.ts', import.meta.url))
const configPath = fileURLToPath(new URL('../cordis.yml', import.meta.url))
const tsconfigPath = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))
const hasKey = Boolean(process.env.DEEPSEEK_API_KEY)

describe.skipIf(!hasKey)('gamedev-agent with real model', () => {
  it('plays coin-chase to completion and leaves a scored tool result in the session stream', async () => {
    const { stdout } = await runLoaderSmoke({
      label: 'gamedev-agent real model',
      tempDirPrefix: 'gamedev-agent-real-',
      binScript,
      libBinScript: binScript,
      configPath,
      binArgs: [
        configPath,
        'Call game_list, then use game_play to play coin-chase and collect all three coins. Report the final score you observed.',
      ],
      tsconfigPath,
      processTimeoutMs: 120_000,
    })
    const lines = stdout.trimEnd().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
    const events = lines.slice(0, -1).map(line => line['event'] as SessionEvent)
    expect(stdout).toContain('coin-chase')
    // Verify the world, not the model's claim: a completed game_play result
    // carrying the full score must exist in the streamed session log.
    expect(events.some(event => event.type === 'tool/result' && JSON.stringify(event).includes('score 30'))).toBe(true)
  }, 135_000)
})
