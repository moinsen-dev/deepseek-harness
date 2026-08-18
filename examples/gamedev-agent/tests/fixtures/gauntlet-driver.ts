#!/usr/bin/env node
/** Keyless Loader driver: two scripted gauntlet rounds (fail, then pass the bar), then one fixture turn as canonical JSONL. */

import type { Context } from '@deepseek-ai/cordis'
import { boot, installFailLoud, loadEnv, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { runFixtureTurn } from '@deepseek-ai/dsh-loader-smoke'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

const NAME = 'gamedev-test-driver'
const [configPath, ...taskParts] = process.argv.slice(2)
if (configPath === undefined || taskParts.length === 0 || taskParts.every(part => part.trim() === '')) {
  throw new Error(`${NAME}: expected <config-path> <task...>`)
}

const uninstallFailLoud = installFailLoud(NAME)
let ctx: Context | undefined
try {
  loadEnv(NAME)
  ctx = await boot(NAME, resolveConfigPath(configPath, undefined))
  const session = ctx.sessions.list()[0]
  if (session === undefined) {
    throw new Error(`${NAME}: no session available for the gauntlet rounds`)
  }
  const writeEvent = (event: SessionEvent): void => {
    process.stdout.write(`${JSON.stringify({ type: 'session_event', sessionId: String(session.id), event })}\n`)
  }
  // Round 1 misses the bar; round 2 reuses the same scenario id, advances the
  // attempt, and passes — the loop shape the gauntlet owns.
  const losing = ctx.gauntlet.run(
    { id: 'collect-all', game: 'coin-chase', inputs: ['up'], bar: 30 },
    session,
    1,
  )
  const losingEvent = session.events[losing.eventSeq]
  if (losingEvent === undefined) {
    throw new Error(`${NAME}: the losing gauntlet round event is missing from the log`)
  }
  writeEvent(losingEvent)
  const winning = ctx.gauntlet.run(
    {
      id: 'collect-all',
      game: 'coin-chase',
      inputs: ['down', 'right', 'down', 'left', 'up', 'up', 'right', 'right'],
      bar: 30,
      baseline: losing.score,
    },
    session,
    2,
  )
  const winningEvent = session.events[winning.eventSeq]
  if (winningEvent === undefined) {
    throw new Error(`${NAME}: the winning gauntlet round event is missing from the log`)
  }
  writeEvent(winningEvent)

  const result = await runFixtureTurn(ctx, {
    task: taskParts.join(' '),
    onEvent: (sessionId: string, event: SessionEvent) => {
      process.stdout.write(`${JSON.stringify({ type: 'session_event', sessionId, event })}\n`)
    },
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
} catch (error: unknown) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
} finally {
  await ctx?.fiber.dispose()
  uninstallFailLoud()
}
