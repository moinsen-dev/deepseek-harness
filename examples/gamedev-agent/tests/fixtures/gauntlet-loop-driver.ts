#!/usr/bin/env node
/** Keyless Loader driver: one builder/critic gauntlet loop (fail, fail, pass the bar), then one fixture turn as canonical JSONL. */

import type { Context } from '@deepseek-ai/cordis'
import { boot, installFailLoud, loadEnv, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { runFixtureTurn } from '@deepseek-ai/dsh-loader-smoke'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

const NAME = 'gamedev-loop-test-driver'
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
    throw new Error(`${NAME}: no session available for the gauntlet loop`)
  }
  const writeEvent = (event: SessionEvent): void => {
    process.stdout.write(`${JSON.stringify({ type: 'session_event', sessionId: String(session.id), event })}\n`)
  }
  // The builder/critic loop policy: candidate strategies score 0 and 10, the
  // third reaches the bar — the loop stops there and every round is logged.
  const loop = ctx.gauntlet.runLoop(session, {
    scenarioId: 'collect-all',
    game: 'coin-chase',
    bar: 30,
    candidates: [
      ['up'],
      ['down', 'right'],
      ['down', 'right', 'down', 'left', 'up', 'up', 'right', 'right'],
    ],
  })
  if (!loop.passed || loop.attempts !== 3) {
    throw new Error(`${NAME}: expected the loop to pass on attempt 3, got ${JSON.stringify(loop)}`)
  }
  for (let seq = 0; seq < loop.attempts; seq++) {
    const event = session.events.findLast(event => event.type === 'gauntlet/round' && event.data.attempt === seq + 1)
    if (event === undefined) {
      throw new Error(`${NAME}: loop round ${seq + 1} is missing from the log`)
    }
    writeEvent(event)
  }

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
