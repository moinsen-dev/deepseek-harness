/**
 * The built-in `gold-run` game: a deterministic 5x5 grid with three coins
 * worth 10 points each and two mines that end the run immediately. The player
 * starts at the top-left cell and applies one of four moves per input;
 * out-of-bounds moves stop at the edge and any other input is a counted no-op.
 * A run is terminal when all three coins are collected (perfect score 30) or
 * when the player steps on a mine (score frozen at whatever was collected).
 * No randomness, no clock, no I/O: the same scripted input sequence always
 * yields the same state, score, and terminal transition.
 * @module @deepseek-ai/dsh-game-sim/gold-run
 */

import type { GameInstance, GameModule } from '@deepseek-ai/dsh-game'
import type { JsonValue } from '@deepseek-ai/dsh-session'

/** Stable id the module registers under. */
export const GOLD_RUN_ID = 'gold-run'

/** One grid dimension: the board is `GOLD_RUN_GRID_SIZE` by `GOLD_RUN_GRID_SIZE` cells. */
export const GOLD_RUN_GRID_SIZE = 5

/** Points awarded per collected coin. */
export const GOLD_COIN_SCORE = 10

/** The four accepted moves; any other input is a no-op step. */
export const GOLD_RUN_MOVES = ['up', 'down', 'left', 'right'] as const

/** The three fixed coin positions (row, column). */
const GOLD_COIN_POSITIONS: readonly (readonly [number, number])[] = [
  [0, 4],
  [2, 2],
  [4, 0],
]

/** The two fixed mine positions (row, column); stepping on one ends the run. */
const GOLD_MINE_POSITIONS: readonly (readonly [number, number])[] = [
  [1, 2],
  [3, 2],
]

/** Observable snapshot of one gold-run run. */
export interface GoldRunState {
  /** Current player position as `[row, column]`. */
  readonly player: readonly [number, number]
  /** Remaining coin positions as `[row, column]` pairs. */
  readonly coins: readonly (readonly [number, number])[]
  /** Points collected so far (10 per coin). */
  readonly score: number
  /** Number of inputs applied so far. */
  readonly moves: number
  /** False once the player stepped on a mine; the run is terminal then. */
  readonly alive: boolean
}

/** Clamp one coordinate into the grid. */
function clamp(value: number): number {
  return Math.max(0, Math.min(GOLD_RUN_GRID_SIZE - 1, value))
}

/**
 * One gold-run run. Deterministic: no randomness, no clock, no I/O.
 */
export class GoldRun implements GameInstance {
  private player: [number, number] = [0, 0]
  private coins: [number, number][] = GOLD_COIN_POSITIONS.map(([row, col]) => [row, col])
  private scoreValue = 0
  private moveCount = 0
  private aliveValue = true

  /**
   * Current observable state as a detached snapshot.
   * @returns a fresh lossless-JSON snapshot with the typed gold-run fields.
   */
  state(): GoldRunState & JsonValue {
    return {
      player: [this.player[0], this.player[1]],
      coins: this.coins.map(([row, col]) => [row, col]),
      score: this.scoreValue,
      moves: this.moveCount,
      alive: this.aliveValue,
    }
  }

  /**
   * Apply one scripted input: move (clamped to the grid), collect a coin on
   * arrival, and count the step — unless the run is already terminal, in
   * which case the input is ignored. Stepping on a mine ends the run with the
   * score collected so far. An input that is not one of the four moves is a
   * counted no-op.
   * @param input - `'up' | 'down' | 'left' | 'right'` or any other JSON value.
   */
  step(input: JsonValue): void {
    if (this.done()) return
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
    const onMine = GOLD_MINE_POSITIONS.some(([row, col]) => row === this.player[0] && col === this.player[1])
    if (onMine) {
      this.aliveValue = false
      return
    }
    const collected = this.coins.findIndex(([row, col]) => row === this.player[0] && col === this.player[1])
    if (collected >= 0) {
      this.coins.splice(collected, 1)
      this.scoreValue += GOLD_COIN_SCORE
    }
  }

  /**
   * Whether the run reached its terminal condition.
   * @returns true when every coin is collected or a mine was hit.
   */
  done(): boolean {
    return !this.aliveValue || this.coins.length === 0
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
 * The gold-run game module. One module registers one id; the seam creates a
 * fresh {@link GoldRun} per playtest run.
 */
export class GoldRunModule implements GameModule {
  readonly id = GOLD_RUN_ID

  /**
   * Create one fresh run.
   * @returns a new gold-run instance.
   */
  create(): GoldRun {
    return new GoldRun()
  }
}
