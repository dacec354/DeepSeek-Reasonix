/**
 * Canonical terminal-grid representation. A `Frame` is "what the
 * terminal will show" as pure data — every cell is addressable, every
 * row's visual width is known, no flex-engine quirks, no estimates.
 *
 * Phase 1 of the Frame-compiler architecture migration. This file
 * just defines the data shape; behavior lives in `frame.ts`.
 *
 * Why a custom type instead of leaning on Ink's tree:
 *   · Ink's overflow=hidden does NOT reliably clip negative-margin
 *     children (verified in 0.13.0; bled into chrome).
 *   · Ink doesn't expose rendered cell positions, so our slicer had
 *     to estimate event heights — wrong estimates → scroll into
 *     emptiness.
 *   · Ink renders the whole tree on every state change; for thousands
 *     of log events, this blocks the event loop > 250ms and breaks
 *     stdin parsing's ESC-ambiguity timer (0.13.2 bogus-Esc abort).
 *
 * Frames sidestep all three: layout is a deterministic function on
 * pure data, the slicer becomes `rows.slice(top, top+h)`, and a
 * future paint layer (Phase 4) can diff frames cell-by-cell instead
 * of repainting the whole viewport.
 */

/**
 * One terminal cell. Most are 1 column wide; CJK / emoji / fullwidth
 * forms occupy 2 columns. The `width` field is the canonical source
 * of truth for visual width, used by every layout primitive — never
 * inferred from the character.
 *
 * Style fields mirror Ink's `<Text>` props so migration from Ink
 * Text → Frame is mechanical. ANSI escape sequences live ONLY in the
 * paint layer (`ansi.ts`); never inside Frame data.
 */
export interface Cell {
  /**
   * The grapheme rendered at this cell. For 2-wide chars, the cell
   * with `width: 2` carries the actual char and the immediately-next
   * cell is a "tail" with `tail: true` and `char: ""` so row arrays
   * always have `length === Frame.width` (invariant). The tail cell
   * is skipped during paint but counted in slicing/positioning.
   */
  char: string;
  /** 1 for ASCII / Latin / most BMP. 2 for CJK / emoji / fullwidth. */
  width: 1 | 2;
  /** Sentinel for the second cell of a 2-wide grapheme. */
  tail?: boolean;
  /** Foreground color: hex `#rrggbb` or named ANSI ("red", "cyan"). */
  fg?: string;
  /** Background color: hex `#rrggbb` or named ANSI. */
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
  /** OSC-8 hyperlink target (cell renders as a clickable link). */
  href?: string;
}

/**
 * One terminal row. INVARIANT: `cells.reduce((a, c) => a + (c.tail ? 0 : c.width), 0) === Frame.width`.
 * Every layout primitive maintains this invariant; tests verify it.
 */
export type FrameRow = readonly Cell[];

/**
 * Immutable terminal grid. `width` is the column count (visual cells);
 * `rows.length` is the row count. Every row has exactly `width`
 * worth of cells (counting `tail` cells for 2-wide chars).
 *
 * Frames compose via primitives in `frame.ts`. They render to the
 * terminal via `ansi.ts`. They never mutate after construction.
 */
export interface Frame {
  readonly width: number;
  readonly rows: readonly FrameRow[];
}

/**
 * Style options for text rendering. Mirrors Ink's `<Text>` props
 * so call sites read the same. `width` is the wrap column —
 * graphemes that don't fit start a new row.
 */
export interface TextOpts {
  /** Wrap column. Mandatory — text without a wrap budget is a
   *  rendering bug; either pass terminal columns or constrain. */
  width: number;
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
  href?: string;
}
