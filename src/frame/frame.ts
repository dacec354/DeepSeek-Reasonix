/**
 * Frame primitives. Pure functions on the `Frame` data type — no
 * Ink, no React, no side effects. Every primitive maintains the
 * row-width invariant: every `FrameRow` has cells whose total
 * visual width (counting `tail` cells for 2-wide chars) equals
 * `Frame.width`.
 *
 * Composition rules:
 *   · `vstack(...frames)` — pad narrower frames on the right with
 *     spaces to the widest, then concat row arrays
 *   · `hstack(...frames)` — pad shorter frames on the bottom with
 *     blank rows to the tallest, then concat each row
 *   · `pad(f, t,r,b,l)` — add blank cells around the existing frame
 *   · `borderLeft(f, color)` — prepend a 1-cell colored vertical bar
 *   · `slice(f, top, height)` — pick consecutive rows; out-of-range
 *     bounds clamp gracefully
 *   · `overlay(base, top, x, y)` — paint `top` over `base` at (x, y),
 *     clipping to base bounds
 *
 * These are the building blocks for Phase 2 (EventLog as Frame
 * compiler). Tests in `tests/frame.test.ts` lock the invariants.
 */

import type { Cell, Frame, FrameRow, TextOpts } from "./types.js";
import { graphemeWidth, graphemes } from "./width.js";

// ─── construction ────────────────────────────────────────────────

/** Single space cell with no styling — the universal padding atom. */
const SPACE: Cell = { char: " ", width: 1 };
/** Single space cell with `tail: true` — cell occupied by a 2-wide
 *  char's tail half. Carries no visual weight, only alignment. */
const TAIL: Cell = { char: "", width: 1, tail: true };

/** Empty frame (no rows) at the given width. Used as a base case
 *  for vstack/hstack reductions. */
export function empty(width = 0): Frame {
  return { width, rows: [] };
}

/**
 * Frame full of spaces at the given dimensions. Useful as a base
 * for `overlay` or as a vertical spacer in `vstack`.
 */
export function blank(width: number, height: number): Frame {
  if (width <= 0 || height <= 0) return empty(Math.max(0, width));
  const row: FrameRow = Object.freeze(Array.from({ length: width }, () => SPACE));
  const rows: FrameRow[] = [];
  for (let i = 0; i < height; i++) rows.push(row);
  return { width, rows };
}

/**
 * Render a string into a frame, wrapping at `opts.width`. Each
 * grapheme becomes one cell (width 1) or occupies two cells (width
 * 2 + tail). Newlines start a new row; lines longer than `width`
 * wrap at the grapheme boundary that overflows.
 *
 * Empty input → empty frame at the requested width (zero rows).
 * Single newline → one blank row.
 */
export function text(s: string, opts: TextOpts): Frame {
  const { width, fg, bg, bold, dim, italic, underline, inverse, href } = opts;
  if (width <= 0) return empty(0);

  const styleOf = (g: string, w: 1 | 2): Cell => {
    const base: Cell = { char: g, width: w };
    if (fg !== undefined) base.fg = fg;
    if (bg !== undefined) base.bg = bg;
    if (bold) base.bold = true;
    if (dim) base.dim = true;
    if (italic) base.italic = true;
    if (underline) base.underline = true;
    if (inverse) base.inverse = true;
    if (href !== undefined) base.href = href;
    return base;
  };

  const rows: FrameRow[] = [];
  const lines = s.split("\n");
  for (const line of lines) {
    if (line.length === 0) {
      rows.push(padRowRight([], width));
      continue;
    }
    let buf: Cell[] = [];
    let bufWidth = 0;
    for (const g of graphemes(line)) {
      const w = graphemeWidth(g);
      if (w === 0) continue; // combining mark / ZWJ — already part of prior cell
      if (bufWidth + w > width) {
        rows.push(padRowRight(buf, width - bufWidth));
        buf = [];
        bufWidth = 0;
      }
      buf.push(styleOf(g, w as 1 | 2));
      if (w === 2) buf.push(TAIL);
      bufWidth += w;
    }
    rows.push(padRowRight(buf, width - bufWidth));
  }
  return { width, rows };
}

/**
 * Pad a partial row to the target width with trailing spaces.
 * Used internally by primitives that produce rows of varying
 * width; the public Frame always has uniform-width rows.
 */
function padRowRight(cells: Cell[], extraSpaces: number): FrameRow {
  if (extraSpaces <= 0) return cells.slice();
  const out = cells.slice();
  for (let i = 0; i < extraSpaces; i++) out.push(SPACE);
  return out;
}

/** Generate a row of pure-space padding at the given width. */
function spacerRow(width: number): FrameRow {
  if (width <= 0) return [];
  return Array.from({ length: width }, () => SPACE);
}

// ─── composition ─────────────────────────────────────────────────

/**
 * Stack frames vertically. Result width is `max(f.width)` — narrower
 * frames are right-padded with spaces. Result height is `sum(f.rows.length)`.
 */
export function vstack(...frames: Frame[]): Frame {
  if (frames.length === 0) return empty(0);
  const w = Math.max(...frames.map((f) => f.width));
  const rows: FrameRow[] = [];
  for (const f of frames) {
    if (f.width === w) {
      rows.push(...f.rows);
    } else {
      const extra = w - f.width;
      for (const r of f.rows) rows.push(padRowRight(r as Cell[], extra));
    }
  }
  return { width: w, rows };
}

/**
 * Stack frames horizontally. Result height is `max(f.rows.length)` —
 * shorter frames are bottom-padded with blank rows of their own
 * width. Result width is `sum(f.width)`.
 */
export function hstack(...frames: Frame[]): Frame {
  if (frames.length === 0) return empty(0);
  const h = Math.max(...frames.map((f) => f.rows.length));
  const w = frames.reduce((a, f) => a + f.width, 0);
  const rows: FrameRow[] = [];
  for (let i = 0; i < h; i++) {
    const cells: Cell[] = [];
    for (const f of frames) {
      const r = f.rows[i] ?? spacerRow(f.width);
      cells.push(...r);
    }
    rows.push(cells);
  }
  return { width: w, rows };
}

/**
 * Add space padding around a frame. Padding is in CELLS (visual
 * columns), not graphemes — `pad(f, 1, 0, 1, 0)` adds one row above
 * and below, leaving width unchanged.
 */
export function pad(f: Frame, top: number, right: number, bottom: number, left: number): Frame {
  const newWidth = f.width + Math.max(0, left) + Math.max(0, right);
  const tPad = Math.max(0, top);
  const bPad = Math.max(0, bottom);
  const blank = spacerRow(newWidth);
  const rows: FrameRow[] = [];
  for (let i = 0; i < tPad; i++) rows.push(blank);
  if (left <= 0 && right <= 0) {
    rows.push(...f.rows);
  } else {
    const lPad = spacerRow(Math.max(0, left));
    const rPad = spacerRow(Math.max(0, right));
    for (const r of f.rows) rows.push([...lPad, ...r, ...rPad]);
  }
  for (let i = 0; i < bPad; i++) rows.push(blank);
  return { width: newWidth, rows };
}

/**
 * Prepend a 1-cell vertical bar to every row. This is the row-by-row
 * equivalent of Ink's `borderLeft` — used for the chat accent bar
 * (`▎`-style left rule indicating "this is one log entry").
 */
export function borderLeft(f: Frame, color: string, char = "│"): Frame {
  const bar: Cell = { char, width: 1, fg: color };
  const newWidth = f.width + 1;
  const rows: FrameRow[] = [];
  for (const r of f.rows) rows.push([bar, ...r]);
  return { width: newWidth, rows };
}

// ─── slicing ─────────────────────────────────────────────────────

/**
 * Pick `height` consecutive rows starting at index `top`. Out-of-range
 * bounds clamp to the available range — never throws. Returns an
 * empty-row frame at the same width when the request is entirely
 * beyond the source.
 */
export function slice(f: Frame, top: number, height: number): Frame {
  if (height <= 0 || f.rows.length === 0) return { width: f.width, rows: [] };
  const start = Math.max(0, Math.min(top, f.rows.length));
  const end = Math.max(start, Math.min(start + height, f.rows.length));
  return { width: f.width, rows: f.rows.slice(start, end) };
}

/**
 * Take exactly `height` rows from the BOTTOM of a frame. Used by the
 * scroll viewport at offset=0 — "show the most recent N rows of the
 * stack". Equivalent to `slice(f, max(0, rows.length - height), height)`
 * but reads more clearly at call sites.
 */
export function bottom(f: Frame, height: number): Frame {
  if (height <= 0) return { width: f.width, rows: [] };
  return slice(f, Math.max(0, f.rows.length - height), height);
}

/**
 * Take exactly `height` rows from a SCROLL OFFSET counted in rows
 * from the bottom. `offset === 0` is `bottom(f, height)`; positive
 * offset reveals older rows above. Caps `offset` so the result is
 * always a valid slice within `f`.
 */
export function viewport(f: Frame, offset: number, height: number): Frame {
  if (height <= 0) return { width: f.width, rows: [] };
  const maxOffset = Math.max(0, f.rows.length - height);
  const o = Math.max(0, Math.min(offset, maxOffset));
  const start = Math.max(0, f.rows.length - height - o);
  return slice(f, start, height);
}

// ─── compositing ─────────────────────────────────────────────────

/**
 * Paint `top` over `base` at offset (x, y). Cells of `top` outside
 * `base`'s bounds are silently dropped. The result has the SAME
 * dimensions as `base` — overlay never grows the frame.
 *
 * Used for modals / popovers / ScrollBar that appear on top of the
 * scroll log. Cleaner than nested flex boxes; explicit positioning.
 */
export function overlay(base: Frame, top: Frame, x: number, y: number): Frame {
  const rows: FrameRow[] = base.rows.map((r) => r.slice());
  for (let i = 0; i < top.rows.length; i++) {
    const targetRow = rows[y + i] as Cell[] | undefined;
    if (!targetRow) continue;
    const src = top.rows[i]!;
    let col = x;
    for (const cell of src) {
      if (col >= 0 && col < base.width) targetRow[col] = cell;
      col += 1;
    }
  }
  return { width: base.width, rows };
}

/**
 * Make a frame uniform-width by either truncating each row to
 * `width` cells or right-padding with spaces. Useful when an
 * upstream producer built rows at a different width and the caller
 * needs to constrain to a known viewport.
 *
 * Truncation respects 2-wide chars: if the cut would split a
 * 2-wide grapheme (the head is included but the tail is sliced off),
 * the head is replaced by a space so we don't render a half-grapheme
 * (which terminals draw as either a stretched glyph spilling past the
 * intended column or a question-mark, depending on the font).
 */
export function fitWidth(f: Frame, width: number): Frame {
  if (f.width === width) return f;
  const rows: FrameRow[] = [];
  for (const r of f.rows) {
    if (r.length >= width) {
      const cut = r.slice(0, width) as Cell[];
      const last = cut[cut.length - 1];
      if (last && last.width === 2 && !last.tail) {
        // Cut splits a 2-wide grapheme — head kept, tail dropped.
        // Replace the orphaned head with a space so the visual width
        // matches the row count.
        cut[cut.length - 1] = SPACE;
      }
      rows.push(cut);
    } else {
      rows.push(padRowRight(r as Cell[], width - r.length));
    }
  }
  return { width, rows };
}
