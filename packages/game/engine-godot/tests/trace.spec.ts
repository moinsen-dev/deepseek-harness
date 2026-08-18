import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import GameRuntime from '@deepseek-ai/dsh-game'
import { parseTraceGame, TraceGameInstance, TraceGameModule } from '@deepseek-ai/dsh-engine-godot'

const TRACE_BODY = [
  '{"state":{"step":1},"score":10,"done":false}',
  '{"state":{"step":2},"score":20,"done":false}',
  '{"state":{"step":3},"score":30,"done":true}',
].join('\n')

describe('parseTraceGame', () => {
  it('parses a valid trace body', () => {
    const trace = parseTraceGame('coin-chase', TRACE_BODY)
    expect(trace.id).toBe('coin-chase')
    expect(trace.entries).toHaveLength(3)
    expect(trace.entries[2]).toEqual({ state: { step: 3 }, score: 30, done: true })
  })

  it('accepts an empty trace body', () => {
    expect(parseTraceGame('empty', '  \n').entries).toEqual([])
  })

  it('rejects a blank game id', () => {
    expect(() => parseTraceGame('  ', TRACE_BODY)).toThrow('scenario id must be a non-empty string')
  })

  it('rejects a line that is not valid JSON', () => {
    expect(() => parseTraceGame('coin-chase', '{"state":1,"score":10,"done":false}\nnot json\n')).toThrow('line 2 is not valid JSON')
  })

  it('rejects a non-object, non-finite-score, and non-boolean-done line', () => {
    expect(() => parseTraceGame('coin-chase', '"just a string"\n')).toThrow('line 1 is not a { state, score, done } step')
    expect(() => parseTraceGame('coin-chase', '{"state":1,"score":"ten","done":false}\n')).toThrow('line 1 has a non-finite score')
    expect(() => parseTraceGame('coin-chase', '{"state":1,"score":10,"done":"yes"}\n')).toThrow('line 1 has a non-boolean done flag')
  })

  it('rejects a state that is not lossless JSON', () => {
    // JSON.parse turns 1e999 into Infinity, which the snapshotter rejects.
    expect(() => parseTraceGame('coin-chase', '{"state":1e999,"score":10,"done":false}\n'))
      .toThrow('line 1 has a state that is not lossless JSON')
  })

  it('rejects a terminal flag that regresses', () => {
    const body = [
      '{"state":1,"score":10,"done":true}',
      '{"state":2,"score":20,"done":false}',
    ].join('\n')
    expect(() => parseTraceGame('coin-chase', body)).toThrow('line 2 leaves the terminal condition after line 1')
  })
})

describe('TraceGameModule replay', () => {
  it('registers under the trace id and creates a fresh instance', () => {
    const module = new TraceGameModule(parseTraceGame('coin-chase', TRACE_BODY))
    expect(module.id).toBe('coin-chase')
    const first = module.create()
    const second = module.create()
    first.step('up')
    expect(first.score()).toBe(10)
    expect(second.score()).toBe(0)
  })

  it('replays the recorded entries per input, ignoring input content', () => {
    const run = new TraceGameInstance(parseTraceGame('coin-chase', TRACE_BODY))
    expect(run.state()).toEqual({})
    expect(run.score()).toBe(0)
    expect(run.done()).toBe(false)

    run.step('anything')
    expect(run.state()).toEqual({ step: 1 })
    expect(run.score()).toBe(10)
    expect(run.done()).toBe(false)

    run.step('also ignored')
    run.step('ignored too')
    expect(run.state()).toEqual({ step: 3 })
    expect(run.score()).toBe(30)
    expect(run.done()).toBe(true)
  })

  it('clamps extra inputs at the last entry', () => {
    const run = new TraceGameInstance(parseTraceGame('coin-chase', TRACE_BODY))
    for (let index = 0; index < 5; index++) run.step('up')
    expect(run.score()).toBe(30)
    expect(run.done()).toBe(true)
    expect(run.state()).toEqual({ step: 3 })
  })

  it('plays through the game seam end to end', async () => {
    const ctx = new Context()
    await ctx.plugin(GameRuntime)
    ctx.game.registerModule(new TraceGameModule(parseTraceGame('coin-chase', TRACE_BODY)))

    const result = ctx.game.play({ game: 'coin-chase', inputs: ['a', 'b', 'c'] })
    expect(result).toMatchObject({ steps: 3, score: 30, done: true })
    expect(result.state).toEqual({ step: 3 })
    await ctx.fiber.dispose()
  })
})
