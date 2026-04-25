/**
 * Paste sentinels — represent a pasted blob as a single codepoint in
 * the input buffer instead of inlining its full contents.
 *
 * Why: a 3000-line paste shoved verbatim into the buffer drowns the
 * surrounding typed text, costs a lot to render per keystroke, and
 * makes navigation/clear awkward. Replace it with one PUA char (a
 * "sentinel") and store the real content in a side registry. The
 * buffer string stays small, the user types around the sentinel as
 * if it were a single character, and a Backspace at the sentinel
 * deletes the whole paste in one stroke. On submit we expand the
 * sentinels back to real content.
 *
 * Encoding:
 *   - One codepoint per paste, in PUA range U+E100..U+E1FF (256 slots).
 *   - The codepoint's offset within that range is the paste id.
 *   - That gives us 256 distinct paste blobs per session before ids
 *     wrap. In practice users paste a handful per session — wrap is
 *     a non-issue, but if it happens, the new paste overwrites the
 *     oldest registry entry; any stale sentinels still in the buffer
 *     will render with a "(missing)" badge so the user can clean up.
 *
 * Range chosen from the Supplementary PUA-A region's neighbor (BMP
 * PUA) so a single `String.fromCharCode` works — no surrogate pairs,
 * no `length === 2` weirdness for cursor arithmetic.
 */

export const PASTE_SENTINEL_BASE = 0xe100;
export const PASTE_SENTINEL_RANGE = 256;
export const PASTE_SENTINEL_END = PASTE_SENTINEL_BASE + PASTE_SENTINEL_RANGE;

export interface PasteEntry {
  id: number;
  content: string;
  lineCount: number;
  charCount: number;
}

export function encodePasteSentinel(id: number): string {
  if (id < 0 || id >= PASTE_SENTINEL_RANGE) {
    throw new Error(`paste sentinel id ${id} out of range [0, ${PASTE_SENTINEL_RANGE})`);
  }
  return String.fromCharCode(PASTE_SENTINEL_BASE + id);
}

/** Returns the paste id, or `null` if `ch` is not a sentinel codepoint. */
export function decodePasteSentinel(ch: string): number | null {
  if (ch.length === 0) return null;
  const cp = ch.charCodeAt(0);
  if (cp < PASTE_SENTINEL_BASE || cp >= PASTE_SENTINEL_END) return null;
  return cp - PASTE_SENTINEL_BASE;
}

export function isPasteSentinel(ch: string): boolean {
  return decodePasteSentinel(ch) !== null;
}

/**
 * Build a PasteEntry from raw paste content. Computes line + char
 * counts once at registration time so the renderer doesn't re-count
 * on every keystroke.
 */
export function makePasteEntry(id: number, content: string): PasteEntry {
  return {
    id,
    content,
    lineCount: content.split("\n").length,
    charCount: content.length,
  };
}

/**
 * Expand every sentinel in `text` back to its registered paste
 * content. Unknown sentinels (entry missing — registry was wiped, or
 * id wrap collision) drop to empty string so the resulting prompt
 * doesn't carry a literal PUA codepoint to the model.
 *
 * Used at submit time to recover the full prompt the user composed.
 */
export function expandPasteSentinels(
  text: string,
  pastes: ReadonlyMap<number, PasteEntry>,
): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const id = decodePasteSentinel(ch);
    if (id === null) {
      out += ch;
      continue;
    }
    const entry = pastes.get(id);
    out += entry?.content ?? "";
  }
  return out;
}

/**
 * Quick check: does the buffer contain ANY sentinel? Used to gate
 * UI hints (the "paste #N" listing in the prompt-box footer) without
 * walking the whole buffer twice.
 */
export function bufferHasPaste(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (decodePasteSentinel(text[i]!) !== null) return true;
  }
  return false;
}

/**
 * Walk the buffer and return the ids of every sentinel still
 * present, in source order. Used by the registry's GC pass at
 * submit time so unreachable paste entries don't accumulate.
 * (No-op when the buffer is sentinel-free.)
 */
export function listPasteIdsInBuffer(text: string): number[] {
  const ids: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const id = decodePasteSentinel(text[i]!);
    if (id !== null) ids.push(id);
  }
  return ids;
}

/**
 * Format `1234` chars as `1.2KB` etc. Tiny helper used in placeholder
 * labels — kept here so paste-related display logic is co-located.
 */
export function formatBytesShort(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 1024 * 10 ? 1 : 0)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}
