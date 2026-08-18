/**
 * The built-in `coin-chase` game: a deterministic 3x3 grid simulation. The
 * player starts at the top-left cell and applies one of four moves per input;
 * entering a coin cell collects it for 10 points, and the run ends once all
 * three coins are collected. Out-of-bounds moves stop at the edge and any
 * other input is a no-op that still consumes one step, so the same scripted
 * input sequence always yields the same state, score, and terminal transition.
 * @module @deepseek-ai/dsh-game-sim/coin-chase
 */

import type { GameInstance, GameModule } from '@deepseek-ai/dsh-game'
import type { JsonValue } from '@deepseek-ai/dsh-session'

/** Stable id the module registers under. */
export const COIN_CHASE_ID = 'coin-chase'

/** One grid dimension: the board is `GRID_SIZE` by `GRID_SIZE` cells. */
export const COIN_CHASE_GRID_SIZE = 3

/** Points awarded per collected coin. */
export const COIN_SCORE = 10

/** The three fixed coin positions (row, column). */
const COIN_POSITIONS: readonly (readonly [number, number])[] = [
  [0, 2],
  [1, 1],
  [2, 0],
]

/** The four accepted moves; any other input is a no-op step. */
export const COIN_CHASE_MOVES = ['up', 'down', 'left', 'right'] as const

/** Observable snapshot of one coin-chase run. */
export interface CoinChaseState {
  /** Current player position as `[row, column]`. */
  readonly player: readonly [number, number]
  /** Remaining coin positions as `[row, column]` pairs. */
  readonly coins: readonly (readonly [number, number])[]
  /** Points collected so far (10 per coin). */
  readonly score: number
  /** Number of inputs applied so far. */
  readonly moves: number
}

/** Clamp one coordinate into the grid. */
function clamp(value: number): number {
  return Math.max(0, Math.min(COIN_CHASE_GRID_SIZE - 1, value))
}

/**
 * One coin-chase run. Deterministic: no randomness, no clock, no I/O.
 */
export class CoinChase implements GameInstance {
  private player: [number, number] = [0, 0]
  private coins: [number, number][] = COIN_POSITIONS.map(([row, col]) => [row, col])
  private scoreValue = 0
  private moveCount = 0

  /**
   * Current observable state as a detached snapshot.
   * @returns a fresh lossless-JSON snapshot with the typed coin-chase fields.
   */
  state(): CoinChaseState & JsonValue {
    return {
      player: [this.player[0], this.player[1]],
      coins: this.coins.map(([row, col]) => [row, col]),
      score: this.scoreValue,
      moves: this.moveCount,
    }
  }

  /**
   * Apply one scripted input: move (clamped to the grid), collect a coin on
   * arrival, and count the step. An input that is not one of the four moves is
   * a counted no-op.
   * @param input - `'up' | 'down' | 'left' | 'right'` or any other JSON value.
   */
  step(input: JsonValue): void {
    if (typeof input === 'string') {
      switch (input) {
        case 'up': this.moveBy(-1, 0); break
        case 'down': this.moveBy(1, 0); break
        case 'left': this.moveBy(0, -1); break
        case 'right': this.moveBy(0, 1); break
        default: break
      }
    }
    this.moveCount++
    const collected = this.coins.findIndex(([row, col]) => row === this.player[0] && col === this.player[1])
    if (collected >= 0) {
      this.coins.splice(collected, 1)
      this.scoreValue += COIN_SCORE
    }
  }

  /**
   * Whether the run reached its terminal condition.
   * @returns true once every coin is collected.
   */
  done(): boolean {
    return this.coins.length === 0
  }

  /**
   * Objective score so far.
   * @returns points collected (10 per coin).
   */
  score(): number {
    return this.scoreValue
  }

  /** Shift the player by one clamped step. */
  private moveBy(dRow: number, dCol: number): void {
    this.player = [clamp(this.player[0] + dRow), clamp(this.player[1] + dCol)]
  }
}

/**
 * The coin-chase game module. One module registers one id; the seam creates a
 * fresh {@link CoinChase} per playtest run.
 */
export class CoinChaseModule implements GameModule {
  readonly id = COIN_CHASE_ID

  /**
   * Create one fresh run.
   * @returns a new coin-chase instance.
   */
  create(): CoinChase {
    return new CoinChase()
  }
}
