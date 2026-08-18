import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { normalizeSessionLog, normalizeStdout, scrubRequestHeaders } from '@deepseek-ai/dsh-acp-snapshot'
import type { NormalizeContext } from '@deepseek-ai/dsh-acp-snapshot'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

const snapshotsDir = join(dirname(fileURLToPath(import.meta.url)), 'snapshots')
const scenarioDir = join(snapshotsDir, 'gauntlet-loop')
const streamExpected = join(scenarioDir, 'stream-json.expected.jsonl')
const loopScenarioDir = join(snapshotsDir, 'builder-critic-loop')
const loopStreamExpected = join(loopScenarioDir, 'stream-json.expected.jsonl')
const ralphScenarioDir = join(snapshotsDir, 'ralph-loop')
const ralphStreamExpected = join(ralphScenarioDir, 'stream-json.expected.jsonl')
const binScript = fileURLToPath(new URL('./fixtures/gauntlet-driver.ts', import.meta.url))
const loopBinScript = fileURLToPath(new URL('./fixtures/gauntlet-loop-driver.ts', import.meta.url))
const ralphBinScript = fileURLToPath(new URL('./fixtures/ralph-driver.ts', import.meta.url))
const configPath = fileURLToPath(new URL('./fixtures/cli.cordis.yml', import.meta.url))
const loopConfigPath = fileURLToPath(new URL('./fixtures/cli-loop.cordis.yml', import.meta.url))
const ralphConfigPath = fileURLToPath(new URL('./fixtures/ralph.cordis.yml', import.meta.url))
const tsconfigPath = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))
const refreshing = process.env.DSH_SNAPSHOT === 'refresh'

interface JsonObject {
  [key: string]: unknown
}

/** Parse one JSONL stream into records; a final newline is optional. */
function parseJsonl(raw: string): JsonObject[] {
  const trimmed = raw.trimEnd()
  if (trimmed.length === 0) return []
  return trimmed.split('\n').map(line => JSON.parse(line) as JsonObject)
}

/** Normalize one driver stream: session events scrub to stable form, the result record passes through. */
function normalizeHeadlessStream(rawStdout: string, cwd: string): string {
  const records = parseJsonl(rawStdout)
  if (records.length === 0) throw new Error('gamedev snapshot emitted no stream-json records')
  const final = records.at(-1)
  if (final?.type !== 'result') throw new Error('gamedev snapshot did not end with a result record')
  if (records.slice(0, -1).some(record => record.type !== 'session_event')) {
    throw new Error('gamedev snapshot emitted a non-event record before its result')
  }

  const sessionIds = [...new Set(records.flatMap(record => typeof record.sessionId === 'string' ? [record.sessionId] : []))]
  if (sessionIds.length !== 1) throw new Error(`gamedev snapshot streamed ${sessionIds.length} main session ids`)
  const context: NormalizeContext = { sessionIds, cwd }
  const events = records.slice(0, -1).map((record) => {
    if (record.event === null || typeof record.event !== 'object' || Array.isArray(record.event)) {
      throw new Error('gamedev snapshot emitted an invalid session event')
    }
    return record.event as JsonObject
  })
  const normalizedEvents = parseJsonl(scrubRequestHeaders(normalizeSessionLog(
    `${events.map(event => JSON.stringify(event)).join('\n')}\n`,
    context,
  )))
  const normalizedRecords = records.map((record, index) => index < normalizedEvents.length
    ? { ...record, event: normalizedEvents[index] }
    : record)
  return normalizeStdout(`${normalizedRecords.map(record => JSON.stringify(record)).join('\n')}\n`, context)
}

describe('gamedev-agent keyless snapshot', () => {
  it('pins the gauntlet rounds and the game_play tool turn in the canonical stream', async () => {
    let runCwd = ''
    const result = await runLoaderSmoke({
      label: 'gamedev-agent gauntlet loop stream-json snapshot',
      tempDirPrefix: 'gamedev-agent-snapshot-',
      binScript,
      libBinScript: binScript,
      configPath,
      binArgs: [configPath, 'play coin-chase to collect every coin'],
      tsconfigPath,
      env: {
        DSH_SNAPSHOT: 'replay',
        NODE_OPTIONS: [process.env.NODE_OPTIONS, '--disable-warning=ExperimentalWarning'].filter(Boolean).join(' '),
      },
      prepare: (cwd) => { runCwd = cwd },
    })

    expect(result.stderr).toBe('')
    const normalized = normalizeHeadlessStream(result.stdout, runCwd)
    if (refreshing) {
      await mkdir(scenarioDir, { recursive: true })
      await writeFile(streamExpected, normalized)
    }
    expect(normalized).toBe(await readFile(streamExpected, 'utf8'))
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)

  it('pins the builder/critic loop and the model-driven gauntlet_round in the canonical stream', async () => {
    let runCwd = ''
    const result = await runLoaderSmoke({
      label: 'gamedev-agent builder critic loop stream-json snapshot',
      tempDirPrefix: 'gamedev-agent-loop-snapshot-',
      binScript: loopBinScript,
      libBinScript: loopBinScript,
      configPath: loopConfigPath,
      binArgs: [loopConfigPath, 'propose a strategy that reaches the bar'],
      tsconfigPath,
      env: {
        DSH_SNAPSHOT: 'replay',
        NODE_OPTIONS: [process.env.NODE_OPTIONS, '--disable-warning=ExperimentalWarning'].filter(Boolean).join(' '),
      },
      prepare: (cwd) => { runCwd = cwd },
    })

    expect(result.stderr).toBe('')
    const normalized = normalizeHeadlessStream(result.stdout, runCwd)
    if (refreshing) {
      await mkdir(loopScenarioDir, { recursive: true })
      await writeFile(loopStreamExpected, normalized)
    }
    expect(normalized).toBe(await readFile(loopStreamExpected, 'utf8'))
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)

  it('pins the Ralph builder/critic loop — two fresh children until the bar passes', async () => {
    let runCwd = ''
    const result = await runLoaderSmoke({
      label: 'gamedev-agent ralph loop stream-json snapshot',
      tempDirPrefix: 'gamedev-agent-ralph-snapshot-',
      binScript: ralphBinScript,
      libBinScript: ralphBinScript,
      configPath: ralphConfigPath,
      binArgs: [ralphConfigPath, 'run a ralph loop to reach the gold-run bar'],
      tsconfigPath,
      processTimeoutMs: 60_000,
      env: {
        DSH_SNAPSHOT: 'replay',
        NODE_OPTIONS: [process.env.NODE_OPTIONS, '--disable-warning=ExperimentalWarning'].filter(Boolean).join(' '),
      },
      prepare: (cwd) => { runCwd = cwd },
    })

    expect(result.stderr).toBe('')
    const normalized = normalizeHeadlessStream(result.stdout, runCwd)
    if (refreshing) {
      await mkdir(ralphScenarioDir, { recursive: true })
      await writeFile(ralphStreamExpected, normalized)
    }
    expect(normalized).toBe(await readFile(ralphStreamExpected, 'utf8'))
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
